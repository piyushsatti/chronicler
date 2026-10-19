package notification

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductPostgres struct {
	DB dbgen.DBTX
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
		PageSize:   limit,
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
	items := make([]NotificationView, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapNotificationRow(row))
	}
	return NotificationConnection{Items: items, HasMore: len(items) == int(limit)}, nil
}

func mapNotificationRow(row dbgen.ProductNotificationInboxRow) NotificationView {
	view := NotificationView{
		Id:        db.UUIDString(row.PublicID),
		Kind:      row.Kind,
		CreatedAt: row.CreatedAt.Time,
		Title:     &row.Body,
	}
	if row.SubjectType.Valid {
		view.SubjectType = row.SubjectType.String
	}
	if row.ReadAt.Valid {
		t := row.ReadAt.Time
		view.ReadAt = &t
	}
	return view
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

func (p *ProductPostgres) ReadBatchNotificationSubjects(ctx context.Context, _ auth.Authority, keys []SubjectKey) ([]product.BatchResult[SubjectProjection], error) {
	out := make([]product.BatchResult[SubjectProjection], len(keys))
	if len(keys) == 0 {
		return out, nil
	}

	docIDs, charIDs, questIDs := partitionSubjectIDs(keys)
	existingDocs, err := p.existingSubjectIDs(ctx, subjectTypeDocument, docIDs)
	if err != nil {
		return nil, err
	}
	existingChars, err := p.existingSubjectIDs(ctx, subjectTypeCharacter, charIDs)
	if err != nil {
		return nil, err
	}
	existingQuests, err := p.existingSubjectIDs(ctx, subjectTypeQuest, questIDs)
	if err != nil {
		return nil, err
	}

	for i, key := range keys {
		subjectType := strings.TrimSpace(key.SubjectType)
		subjectID := strings.TrimSpace(key.SubjectID)
		proj := SubjectProjection{
			SubjectType: subjectType,
			SubjectID:   subjectID,
			Label:       "",
		}
		switch subjectType {
		case subjectTypeDocument:
			if subjectID == "" {
				proj.Visible = false
				proj.Malformed = false
			} else {
				proj.Visible = existingDocs[subjectID]
				proj.Malformed = false
			}
		case subjectTypeCharacter:
			if subjectID == "" || !existingChars[subjectID] {
				proj.Malformed = true
			} else {
				proj.Visible = true
			}
		case subjectTypeQuest:
			if subjectID == "" || !existingQuests[subjectID] {
				proj.Malformed = true
			} else {
				proj.Visible = true
			}
		default:
			proj.Malformed = true
		}
		out[i] = product.BatchResult[SubjectProjection]{Value: &proj}
	}
	return out, nil
}

func partitionSubjectIDs(keys []SubjectKey) (docs, chars, quests []pgtype.UUID) {
	for _, key := range keys {
		id := strings.TrimSpace(key.SubjectID)
		if id == "" {
			continue
		}
		parsed, err := db.ParseUUID(id)
		if err != nil {
			continue
		}
		switch strings.TrimSpace(key.SubjectType) {
		case subjectTypeDocument:
			docs = append(docs, parsed)
		case subjectTypeCharacter:
			chars = append(chars, parsed)
		case subjectTypeQuest:
			quests = append(quests, parsed)
		}
	}
	return docs, chars, quests
}

func (p *ProductPostgres) existingSubjectIDs(ctx context.Context, subjectType string, ids []pgtype.UUID) (map[string]bool, error) {
	out := make(map[string]bool, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	var found []pgtype.UUID
	var err error
	switch subjectType {
	case subjectTypeDocument:
		found, err = p.queries().ProductNotificationSubjectDocuments(ctx, ids)
	case subjectTypeCharacter:
		found, err = p.queries().ProductNotificationSubjectCharacters(ctx, ids)
	case subjectTypeQuest:
		found, err = p.queries().ProductNotificationSubjectQuests(ctx, ids)
	default:
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	for _, id := range found {
		out[db.UUIDString(id)] = true
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

func (p *ProductPostgres) ReadPreferences(context.Context, []string) ([]Preferences, error) {
	return nil, fmt.Errorf("notification preferences pending wiring")
}

func (p *ProductPostgres) InsertEvent(context.Context, Event) (string, error) {
	return "", fmt.Errorf("notification event insert pending wiring")
}

func (p *ProductPostgres) InsertRecipients(context.Context, string, []string, time.Time) error {
	return fmt.Errorf("notification recipients insert pending wiring")
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
