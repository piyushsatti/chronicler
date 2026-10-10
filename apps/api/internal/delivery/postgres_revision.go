package delivery

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type PostgresRevisionApplier struct {
	q *dbgen.Queries
}

func NewPostgresRevisionApplier(pool *pgxpool.Pool) *PostgresRevisionApplier {
	return &PostgresRevisionApplier{q: dbgen.New(pool)}
}

func (p *PostgresRevisionApplier) ApplyDiscordRevision(ctx context.Context, questID string, desired int) error {
	uid, err := db.ParseUUID(questID)
	if err != nil {
		return err
	}
	return p.q.ApplyQuestDiscordRevision(ctx, dbgen.ApplyQuestDiscordRevisionParams{
		PublicID: uid,
		Desired:  int32(desired),
	})
}

func (p *PostgresRevisionApplier) GetDiscordMessageID(ctx context.Context, questID string) (string, error) {
	uid, err := db.ParseUUID(questID)
	if err != nil {
		return "", err
	}
	row, err := p.q.QuestDiscordRevisions(ctx, uid)
	if err != nil {
		return "", err
	}
	if !row.DiscordMessageID.Valid {
		return "", nil
	}
	return row.DiscordMessageID.String, nil
}

func (p *PostgresRevisionApplier) SetDiscordMessageID(ctx context.Context, questID string, messageID string) error {
	uid, err := db.ParseUUID(questID)
	if err != nil {
		return err
	}
	return p.q.SetQuestDiscordMessageID(ctx, dbgen.SetQuestDiscordMessageIDParams{
		DiscordMessageID: pgtype.Text{String: messageID, Valid: messageID != ""},
		PublicID:         uid,
	})
}

// PostgresReconciler re-enqueues discord delivery when desired still leads applied
// after a job finishes (bursts that landed while state was running).
type PostgresReconciler struct {
	q        *dbgen.Queries
	enqueuer *jobs.Enqueuer
}

func NewPostgresReconciler(pool *pgxpool.Pool, enqueuer *jobs.Enqueuer) *PostgresReconciler {
	return &PostgresReconciler{q: dbgen.New(pool), enqueuer: enqueuer}
}

func (p *PostgresReconciler) Reconcile(ctx context.Context, questPublicID string) error {
	if p.enqueuer == nil {
		return nil
	}
	uid, err := db.ParseUUID(questPublicID)
	if err != nil {
		return err
	}
	row, err := p.q.QuestDiscordRevisions(ctx, uid)
	if err != nil {
		return err
	}
	if row.DiscordAppliedRevision >= row.DiscordDesiredRevision {
		return nil
	}
	return p.enqueuer.EnqueueQuestDiscord(ctx, jobs.QuestDiscordPayload{
		ID:              row.ID,
		PublicID:        db.UUIDString(row.PublicID),
		DesiredRevision: int(row.DiscordDesiredRevision),
	})
}
