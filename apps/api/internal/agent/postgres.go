package agent

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"strconv"
)

type PostgresStore struct {
	q    *dbgen.Queries
	jobs *jobs.PostgresStore
}

func NewPostgresStore(p *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{dbgen.New(p), jobs.NewPostgresStore(p)}
}
func (p *PostgresStore) Create(ctx context.Context, r QuestionRequested) error {
	if e := validateRequest(&r); e != nil {
		return e
	}
	id, _ := db.ParseUUID(r.JobID)
	payload, _ := json.Marshal(r)
	return p.jobs.Transaction(ctx, func(q *dbgen.Queries) error {
		if _, e := q.InsertQuestionJob(ctx, dbgen.InsertQuestionJobParams{JobID: id, Payload: payload}); e != nil {
			return e
		}
		row, e := q.LockPublicJob(ctx, id)
		if e != nil {
			return e
		}
		if row.Kind != "agent_question" || !jobs.EqualJSON(row.Payload, payload) {
			return jobs.ErrLease
		}
		_, e = q.GetAgentQuestion(ctx, id)
		if e == nil {
			return nil
		}
		if !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		h := r.History
		if len(h) == 0 {
			h = []byte(`null`)
		}
		return q.InsertAgentQuestion(ctx, dbgen.InsertAgentQuestionParams{JobID: row.ID, Question: r.Question, History: h})
	})
}
func (p *PostgresStore) Get(ctx context.Context, id string) (string, json.RawMessage, bool, error) {
	uid, e := db.ParseUUID(id)
	if e != nil {
		return "", nil, false, nil
	}
	r, e := p.q.GetAgentQuestion(ctx, uid)
	if errors.Is(e, pgx.ErrNoRows) {
		return "", nil, false, nil
	}
	if e != nil {
		return "", nil, false, e
	}
	return r.State, r.Result, true, nil
}
func (p *PostgresStore) Claim(ctx context.Context) (ClaimedQuestion, bool, error) {
	j, e := p.jobs.ClaimOne(ctx, "agent")
	if e != nil || j.ID == "" {
		return ClaimedQuestion{}, false, e
	}
	id, _ := db.ParseUUID(j.PublicID)
	r, e := p.q.GetAgentQuestion(ctx, id)
	if e != nil {
		return ClaimedQuestion{}, false, e
	}
	h := json.RawMessage(r.History)
	if string(h) == "null" {
		h = nil
	}
	return ClaimedQuestion{QuestionRequested{1, "question.requested", j.PublicID, r.Question, h}, j.Lease(j.ClaimedAt), j.QuestionDeadlineAt}, true, nil
}
func (p *PostgresStore) receipt(ctx context.Context, id, token string) (jobs.Receipt, error) {
	uid, e := db.ParseUUID(id)
	if e != nil {
		return jobs.Receipt{}, jobs.ErrMissing
	}
	r, e := p.q.GetAgentQuestion(ctx, uid)
	if errors.Is(e, pgx.ErrNoRows) {
		return jobs.Receipt{}, jobs.ErrMissing
	}
	return jobs.Receipt{ID: strconv.FormatInt(r.ID, 10), Token: token}, e
}
func (p *PostgresStore) Complete(ctx context.Context, c QuestionCompletion) error {
	if e := validateCompletion(&c, c.JobID); e != nil {
		return e
	}
	r, e := p.receipt(ctx, c.JobID, c.LeaseToken)
	if e != nil {
		return e
	}
	payload, _ := json.Marshal(c.QuestionResult)
	state, op := jobs.Succeeded, "succeed"
	if c.Type == "question.failed" {
		state, op = jobs.Dead, "fail"
	}
	return p.jobs.Complete(ctx, r, op, state, payload, 0, "")
}
func (p *PostgresStore) Renew(ctx context.Context, id, token string) (jobs.Lease, error) {
	r, e := p.receipt(ctx, id, token)
	if e != nil {
		return jobs.Lease{}, e
	}
	return p.jobs.Renew(ctx, r)
}
func (p *PostgresStore) Retry(ctx context.Context, id, token, reason string) error {
	r, e := p.receipt(ctx, id, token)
	if e != nil {
		return e
	}
	return p.jobs.Retry(ctx, r, 0, reason)
}
