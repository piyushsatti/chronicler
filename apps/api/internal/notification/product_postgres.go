package notification

import (
	"context"
	"fmt"
	"reflect"
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
	for i := range keys {
		out[i] = product.BatchResult[SubjectProjection]{Value: &SubjectProjection{Malformed: true}}
	}
	return out, nil
}

func (p *ProductPostgres) LockAcknowledgeSuppressedNotifications(ctx context.Context, actorID string, spec AcknowledgeSuppressedNotificationsSpec) (AcknowledgeSuppressedNotificationsState, error) {
	_ = ctx
	_ = actorID
	_ = spec
	return AcknowledgeSuppressedNotificationsState{}, fmt.Errorf("notification inbox commands pending wiring")
}

func (p *ProductPostgres) StoreAcknowledgeSuppressedNotifications(ctx context.Context, write AcknowledgeSuppressedNotificationsWrite) (NotificationWriteReceipt, error) {
	_ = ctx
	_ = write
	return NotificationWriteReceipt{}, fmt.Errorf("notification inbox commands pending wiring")
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
