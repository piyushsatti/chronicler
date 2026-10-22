package notification

import (
	"context"
	"fmt"
	"reflect"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductPostgres struct {
	DB     dbgen.DBTX
	origin *commandOrigin
	proofs []inboxProof
}

func NewProductPostgres(db dbgen.DBTX) (*ProductPostgres, error) {
	if db == nil || (reflect.ValueOf(db).Kind() == reflect.Pointer && reflect.ValueOf(db).IsNil()) {
		return nil, fmt.Errorf("notification database executor required")
	}
	return &ProductPostgres{DB: db}, nil
}

func (p *ProductPostgres) queries() *dbgen.Queries {
	return dbgen.New(p.DB)
}

func memberUUID(actor auth.Authority) (pgtype.UUID, error) {
	return db.ParseUUID(actor.Claims().MemberID)
}

func (p *ProductPostgres) ReadMyNotifications(ctx context.Context, actor auth.Authority, spec MyNotificationsSpec) (NotificationConnection, error) {
	memberID, err := memberUUID(actor)
	if err != nil {
		return NotificationConnection{}, err
	}
	limit := spec.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	arg := dbgen.ProductNotificationInboxParams{
		MemberID:   memberID,
		UnreadOnly: spec.UnreadOnly,
		PageSize:   limit + 1,
	}
	if spec.BeforeCreatedAt != nil && spec.BeforeNotificationID != nil {
		beforeID, err := db.ParseUUID(*spec.BeforeNotificationID)
		if err != nil {
			return NotificationConnection{}, err
		}
		arg.BeforeCreatedAt = pgtype.Timestamptz{Time: *spec.BeforeCreatedAt, Valid: true}
		arg.BeforeNotificationID = beforeID
	}
	rows, err := p.queries().ProductNotificationInbox(ctx, arg)
	if err != nil {
		return NotificationConnection{}, err
	}
	hasMore := len(rows) > int(limit)
	if hasMore {
		rows = rows[:limit]
	}
	candidates := make([]storedNotification, len(rows))
	for i, row := range rows {
		candidates[i] = storedNotification{ID: db.UUIDString(row.PublicID), Kind: EventKind(row.Kind), SubjectType: row.SubjectType.String, SubjectID: db.UUIDString(row.SubjectPublicID), Body: row.Body, CreatedAt: row.CreatedAt.Time, ReadAt: row.ReadAt}
	}
	projections, err := p.proveNotifications(ctx, actor.Claims().MemberID, candidates)
	if err != nil {
		return NotificationConnection{}, opaqueNotificationProofError()
	}
	items := make([]NotificationView, len(rows))
	for i, row := range candidates {
		projection := projections[i]
		items[i] = NotificationView{Id: row.ID, Kind: string(row.Kind), CreatedAt: row.CreatedAt, Label: projection.Label, Title: projection.Title, Summary: projection.Summary, SubjectId: projection.SubjectID, SubjectType: projection.SubjectType, SubjectCode: projection.Code}
		if row.ReadAt.Valid {
			at := row.ReadAt.Time
			items[i].ReadAt = &at
		}
	}
	return NotificationConnection{Items: items, HasMore: hasMore}, nil
}

func (p *ProductPostgres) ReadMyUnreadNotificationCount(ctx context.Context, actor auth.Authority, _ MyUnreadNotificationCountSpec) (int32, error) {
	memberID, err := memberUUID(actor)
	if err != nil {
		return 0, err
	}
	count, err := p.queries().ProductNotificationUnreadCount(ctx, memberID)
	if err != nil {
		return 0, err
	}
	return int32(count), nil
}

func (p *ProductPostgres) ReadBatchNotificationSubjects(ctx context.Context, actor auth.Authority, keys []SubjectKey) ([]product.BatchResult[SubjectProjection], error) {
	out := make([]product.BatchResult[SubjectProjection], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	if len(keys) > maxAckLimit {
		return nil, opaqueNotificationProofError()
	}
	memberID, err := memberUUID(actor)
	if err != nil {
		return nil, opaqueNotificationProofError()
	}
	ids := make([]pgtype.UUID, len(keys))
	for i, key := range keys {
		if !canonicalNotificationID(key.NotificationID) {
			return nil, opaqueNotificationProofError()
		}
		ids[i], _ = db.ParseUUID(key.NotificationID)
	}
	rows, err := p.queries().ProductNotificationRowsForProof(ctx, dbgen.ProductNotificationRowsForProofParams{MemberID: memberID, NotificationIds: ids})
	if err != nil {
		return nil, opaqueNotificationProofError()
	}
	stored := make(map[string]storedNotification, len(rows))
	for _, row := range rows {
		id := db.UUIDString(row.PublicID)
		stored[id] = storedNotification{ID: id, Kind: EventKind(row.Kind), SubjectType: row.SubjectType.String, SubjectID: db.UUIDString(row.SubjectPublicID), Body: row.Body, CreatedAt: row.CreatedAt.Time, ReadAt: row.ReadAt}
	}
	candidates := make([]storedNotification, len(keys))
	for i, key := range keys {
		row, ok := stored[key.NotificationID]
		if !ok || key.SubjectType != row.SubjectType || (key.SubjectID != row.SubjectID && row.SubjectID != "") {
			return nil, opaqueNotificationProofError()
		}
		candidates[i] = row
	}
	projections, err := p.proveNotifications(ctx, actor.Claims().MemberID, candidates)
	if err != nil {
		return nil, opaqueNotificationProofError()
	}
	for i := range keys {
		projection := projections[i]
		out[i] = product.BatchResult[SubjectProjection]{Value: &projection}
	}
	return out, nil
}

func (p *ProductPostgres) LockAcknowledgeSuppressedNotifications(ctx context.Context, actorID string, spec AcknowledgeSuppressedNotificationsSpec) (AcknowledgeSuppressedNotificationsState, error) {
	memberID, err := db.ParseUUID(actorID)
	if err != nil {
		return AcknowledgeSuppressedNotificationsState{}, err
	}
	limit := spec.Limit
	if limit <= 0 {
		limit = maxAckLimit
	}
	if limit > maxAckLimit {
		limit = maxAckLimit
	}
	rows, err := p.queries().ProductNotificationLockOldestUnread(ctx, dbgen.ProductNotificationLockOldestUnreadParams{
		MemberID: memberID,
		RowLimit: limit,
	})
	if err != nil {
		return AcknowledgeSuppressedNotificationsState{}, err
	}
	candidates := make([]NotificationCandidate, 0, len(rows))
	for _, row := range rows {
		candidates = append(candidates, mapLockedNotificationRow(row))
	}
	return AcknowledgeSuppressedNotificationsState{ActorID: actorID, Candidates: candidates}, nil
}

func mapLockedNotificationRow(row dbgen.ProductNotificationLockOldestUnreadRow) NotificationCandidate {
	candidate := NotificationCandidate{
		NotificationID: db.UUIDString(row.PublicID),
		CreatedAt:      row.CreatedAt.Time,
		Kind:           EventKind(row.Kind),
		Subject: SubjectKey{
			NotificationID: db.UUIDString(row.PublicID),
		},
	}
	if row.ReadAt.Valid {
		t := row.ReadAt.Time
		candidate.ReadAt = &t
	}
	if row.SubjectType.Valid {
		candidate.Subject.SubjectType = row.SubjectType.String
	}
	if row.SubjectPublicID.Valid {
		candidate.Subject.SubjectID = db.UUIDString(row.SubjectPublicID)
	}
	// Orphan document refs keep type but empty SubjectID so ACK can suppress them.
	// Non-document refs with subject_ref_present but no join hit are treated as missing.
	_ = row.SubjectRefPresent
	return candidate
}

func (p *ProductPostgres) StoreAcknowledgeSuppressedNotifications(ctx context.Context, write AcknowledgeSuppressedNotificationsWrite) (NotificationWriteReceipt, error) {
	if len(write.SelectedIDs) == 0 {
		return NotificationWriteReceipt{AffectedCount: 0}, nil
	}
	return p.StoreMarkNotificationsRead(ctx, MarkNotificationsReadWrite{
		ActorID: write.ActorID,
		At:      write.At,
		Input:   MarkNotificationsReadSpec{Ids: write.SelectedIDs},
	})
}

func (p *ProductPostgres) StoreMarkNotificationsRead(ctx context.Context, write MarkNotificationsReadWrite) (NotificationWriteReceipt, error) {
	memberID, err := db.ParseUUID(write.ActorID)
	if err != nil {
		return NotificationWriteReceipt{}, err
	}
	ids := make([]pgtype.UUID, 0, len(write.Input.Ids))
	for _, id := range write.Input.Ids {
		parsed, err := db.ParseUUID(id)
		if err != nil {
			return NotificationWriteReceipt{}, err
		}
		ids = append(ids, parsed)
	}
	count, err := p.queries().ProductNotificationMarkRead(ctx, dbgen.ProductNotificationMarkReadParams{
		MemberID:        memberID,
		NotificationIds: ids,
		ReadAt:          pgtype.Timestamptz{Time: write.At, Valid: true},
	})
	if err != nil {
		return NotificationWriteReceipt{}, err
	}
	return NotificationWriteReceipt{AffectedCount: count}, nil
}
