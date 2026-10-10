package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresStore struct {
	q *dbgen.Queries
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return NewFromQueries(dbgen.New(pool))
}

func NewFromQueries(q *dbgen.Queries) *PostgresStore {
	return &PostgresStore{q: q}
}

func (s *PostgresStore) Enqueue(ctx context.Context, job Job) error {
	payload := job.Payload
	if payload == nil {
		payload = []byte("{}")
	}
	return s.q.EnqueueJob(ctx, dbgen.EnqueueJobParams{
		JobKey:  job.Key,
		Kind:    job.Kind,
		Lane:    job.Lane,
		Payload: payload,
	})
}

func (s *PostgresStore) ClaimOne(ctx context.Context, lane string) (Job, error) {
	row, err := s.q.ClaimJob(ctx, lane)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Job{}, nil
		}
		return Job{}, err
	}
	if row.ID == 0 {
		return Job{}, nil
	}
	return Job{
		ID:        strconv.FormatInt(row.ID, 10),
		Key:       row.JobKey,
		Kind:      row.Kind,
		Lane:      row.Lane,
		State:     State(row.State),
		Attempts:  int(row.Attempts),
		Payload:   row.Payload,
		NextRunAt: row.NextRunAt.Time,
	}, nil
}

func (s *PostgresStore) Succeed(ctx context.Context, id string) error {
	n, err := parseJobID(id)
	if err != nil {
		return err
	}
	return s.q.SucceedJob(ctx, n)
}

func (s *PostgresStore) Retry(ctx context.Context, id string, after time.Duration, reason string) error {
	n, err := parseJobID(id)
	if err != nil {
		return err
	}
	return s.q.RetryJob(ctx, dbgen.RetryJobParams{
		ID:           n,
		NextRunAt:    pgTime(time.Now().Add(after)),
		ErrorMessage: pgText(reason),
	})
}

func (s *PostgresStore) Fail(ctx context.Context, id string, state State, reason string) error {
	n, err := parseJobID(id)
	if err != nil {
		return err
	}
	return s.q.FailJob(ctx, dbgen.FailJobParams{
		ID:           n,
		State:        string(state),
		ErrorMessage: pgText(reason),
	})
}

func parseJobID(id string) (int64, error) {
	return strconv.ParseInt(id, 10, 64)
}

func pgText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func pgTime(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// Enqueuer coalesces quest Discord delivery jobs.
type Enqueuer struct {
	store Store
}

func NewEnqueuer(store Store) *Enqueuer {
	return &Enqueuer{store: store}
}

func (e *Enqueuer) EnqueueQuestDiscord(ctx context.Context, body QuestDiscordPayload) error {
	if e.store == nil {
		return nil
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	return e.store.Enqueue(ctx, Job{
		Key:     QuestDiscordKey(body.PublicID),
		Kind:    "quest_discord_delivery",
		Lane:    "discord",
		Payload: payload,
	})
}
