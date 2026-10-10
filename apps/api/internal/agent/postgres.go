package agent

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresStore struct {
	q *dbgen.Queries
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{q: dbgen.New(pool)}
}

func (p *PostgresStore) Create(ctx context.Context, req QuestionRequested) error {
	uid, err := db.ParseUUID(req.JobID)
	if err != nil {
		return apierr.New(apierr.Invalid, "job_id must be a UUID")
	}
	history := req.History
	if history == nil {
		history = json.RawMessage("[]")
	}
	return p.q.UpsertAgentQuestion(ctx, dbgen.UpsertAgentQuestionParams{
		JobID:    uid,
		Question: req.Question,
		History:  history,
	})
}

func (p *PostgresStore) Get(ctx context.Context, jobID string) (string, json.RawMessage, bool, error) {
	uid, err := db.ParseUUID(jobID)
	if err != nil {
		return "", nil, false, apierr.New(apierr.NotFound, "question not found")
	}
	row, err := p.q.GetAgentQuestion(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil, false, nil
		}
		return "", nil, false, err
	}
	return row.State, row.Result, true, nil
}

func (p *PostgresStore) Complete(ctx context.Context, result QuestionResult) error {
	uid, err := db.ParseUUID(result.JobID)
	if err != nil {
		return apierr.New(apierr.NotFound, "question not found")
	}
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return p.q.CompleteAgentQuestion(ctx, dbgen.CompleteAgentQuestionParams{
		JobID:  uid,
		Result: raw,
	})
}
