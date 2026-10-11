package notification

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

// PostgresRepository uses sqlc. Commands bind it to their existing transaction;
// read queries use the pool. The repository never starts or commits transactions.
type PostgresRepository struct {
	q *dbgen.Queries
}

func NewPostgresRepository(q *dbgen.Queries) *PostgresRepository {
	return &PostgresRepository{q: q}
}

func (p *PostgresRepository) UnreadCount(ctx context.Context, memberID string) (int64, error) {
	if p == nil || p.q == nil {
		return 0, errUnavailable
	}
	id, err := db.ParseUUID(memberID)
	if err != nil {
		return 0, err
	}
	return p.q.CountUnreadNotificationsByMember(ctx, id)
}

func (p *PostgresRepository) MarkRead(ctx context.Context, memberID string, ids []string) error {
	if p == nil || p.q == nil {
		return errCommandUnavailable
	}
	member, err := db.ParseUUID(memberID)
	if err != nil {
		return err
	}
	publicIDs := make([]pgtype.UUID, len(ids))
	for i, id := range ids {
		publicIDs[i], err = db.ParseUUID(id)
		if err != nil {
			return err
		}
	}
	return p.q.MarkNotificationsReadByMember(ctx, dbgen.MarkNotificationsReadByMemberParams{
		MemberID: member, PublicIds: publicIDs,
	})
}
