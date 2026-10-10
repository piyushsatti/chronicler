package ingest

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresStore struct {
	q *dbgen.Queries
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{q: dbgen.New(pool)}
}

func (p *PostgresStore) SaveEvent(ctx context.Context, e Event) error {
	return p.q.InsertDiscordActivityEvent(ctx, dbgen.InsertDiscordActivityEventParams{
		EventID:       e.EventID,
		Kind:          e.Kind,
		DiscordUserID: e.DiscordUserID,
		ChannelID:     e.ChannelID,
		OccurredAt:    pgtype.Timestamptz{Time: e.OccurredAt, Valid: true},
		Amount:        e.Amount,
	})
}

func (p *PostgresStore) SaveHeartbeat(ctx context.Context, payload json.RawMessage) error {
	return p.q.InsertBotHeartbeat(ctx, payload)
}
