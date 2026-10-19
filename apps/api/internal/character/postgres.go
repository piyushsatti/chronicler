package character

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresQueries struct {
	q *dbgen.Queries
}

func NewPostgresQueries(pool *pgxpool.Pool) *PostgresQueries {
	return &PostgresQueries{q: dbgen.New(pool)}
}

func (p *PostgresQueries) Progression(ctx context.Context, characterID string, limit int) ([]ProgressionEntry, error) {
	uid, err := db.ParseUUID(characterID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := p.q.ListCharacterProgression(ctx, dbgen.ListCharacterProgressionParams{
		CharacterID: uid,
		RowLimit:    int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]ProgressionEntry, 0, len(rows))
	for _, row := range rows {
		out = append(out, ProgressionEntry{
			ID:          db.UUIDString(row.ID),
			CharacterID: db.UUIDString(row.CharacterID),
			Delta:       int(row.Delta),
			Reason:      row.Reason,
			CreatedAt:   row.CreatedAt.Time,
		})
	}
	return out, nil
}

func (p *PostgresQueries) Logs(ctx context.Context, characterID string, limit int) ([]LogEntry, error) {
	uid, err := db.ParseUUID(characterID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := p.q.ListCharacterLogs(ctx, dbgen.ListCharacterLogsParams{
		CharacterID: uid,
		RowLimit:    int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]LogEntry, 0, len(rows))
	for _, row := range rows {
		out = append(out, LogEntry{
			ID:          db.UUIDString(row.ID),
			CharacterID: db.UUIDString(row.CharacterID),
			QuestID:     db.UUIDString(row.QuestID),
			Body:        row.Body,
			CreatedAt:   row.CreatedAt.Time,
		})
	}
	return out, nil
}

func (p *PostgresQueries) VerificationHistory(ctx context.Context, characterID string, limit int) ([]VerificationEntry, error) {
	uid, err := db.ParseUUID(characterID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := p.q.ListCharacterVerifications(ctx, dbgen.ListCharacterVerificationsParams{
		SubjectID: uid,
		RowLimit:  int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]VerificationEntry, 0, len(rows))
	for _, row := range rows {
		out = append(out, VerificationEntry{
			ID:        db.UUIDString(row.ID),
			Decision:  row.Decision,
			DecidedBy: db.UUIDString(row.DecidedBy),
			Note:      db.TextOrEmpty(row.Note),
			CreatedAt: row.CreatedAt.Time,
		})
	}
	return out, nil
}
