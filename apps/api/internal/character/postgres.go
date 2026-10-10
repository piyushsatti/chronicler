package character

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
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

func mapChar(row dbgen.GetCharacterRow) CharacterView {
	return CharacterView{
		ID:        db.UUIDString(row.ID),
		ShortCode: row.ShortCode,
		Name:      row.Name,
		OwnerID:   db.UUIDString(row.OwnerID),
		Status:    row.Status,
		PCXP:      int(row.Pcxp),
	}
}

func (p *PostgresQueries) GetByID(ctx context.Context, id string) (CharacterView, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return CharacterView{}, ErrNotFound
	}
	row, err := p.q.GetCharacter(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CharacterView{}, ErrNotFound
		}
		return CharacterView{}, err
	}
	return mapChar(row), nil
}

func (p *PostgresQueries) GetByShortCode(ctx context.Context, code string) (CharacterView, error) {
	row, err := p.q.GetCharacterByShortCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CharacterView{}, ErrNotFound
		}
		return CharacterView{}, err
	}
	return CharacterView{
		ID:        db.UUIDString(row.ID),
		ShortCode: row.ShortCode,
		Name:      row.Name,
		OwnerID:   db.UUIDString(row.OwnerID),
		Status:    row.Status,
		PCXP:      int(row.Pcxp),
	}, nil
}

func (p *PostgresQueries) ListByOwner(ctx context.Context, ownerID string, limit, offset int) ([]CharacterView, error) {
	uid, err := db.ParseUUID(ownerID)
	if err != nil {
		return nil, nil
	}
	rows, err := p.q.ListCharactersByOwner(ctx, dbgen.ListCharactersByOwnerParams{
		OwnerID:   uid,
		RowLimit:  int32(limit),
		RowOffset: int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]CharacterView, 0, len(rows))
	for _, row := range rows {
		out = append(out, CharacterView{
			ID:        db.UUIDString(row.ID),
			ShortCode: row.ShortCode,
			Name:      row.Name,
			OwnerID:   db.UUIDString(row.OwnerID),
			Status:    row.Status,
			PCXP:      int(row.Pcxp),
		})
	}
	return out, nil
}

func (p *PostgresQueries) List(ctx context.Context, status *string, limit, offset int) ([]CharacterView, error) {
	rows, err := p.q.ListCharacters(ctx, dbgen.ListCharactersParams{
		Column1: db.OptString(status),
		Limit:   int32(limit),
		Offset:  int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]CharacterView, 0, len(rows))
	for _, row := range rows {
		out = append(out, CharacterView{
			ID:        db.UUIDString(row.ID),
			ShortCode: row.ShortCode,
			Name:      row.Name,
			OwnerID:   db.UUIDString(row.OwnerID),
			Status:    row.Status,
			PCXP:      int(row.Pcxp),
		})
	}
	return out, nil
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
