package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"strconv"
	"time"
)

type PostgresStore struct {
	q    *dbgen.Queries
	pool *pgxpool.Pool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{dbgen.New(pool), pool}
}
func NewFromQueries(q *dbgen.Queries) *PostgresStore { return &PostgresStore{q: q} }
func (s *PostgresStore) Transaction(ctx context.Context, fn func(*dbgen.Queries) error) error {
	if s.pool == nil {
		return fmt.Errorf("lease operation requires transactional store")
	}
	return db.NewRunner(&db.Pool{Pool: s.pool}, func(tx pgx.Tx) *dbgen.Queries { return dbgen.New(tx) }).Do(ctx, fn)
}
func (s *PostgresStore) Enqueue(ctx context.Context, j Job) error {
	p := j.Payload
	if p == nil {
		p = []byte(`{}`)
	}
	return s.q.EnqueueJob(ctx, dbgen.EnqueueJobParams{JobKey: j.Key, Kind: j.Kind, Lane: j.Lane, Payload: p})
}
func fromRow(r dbgen.BackgroundJob) Job {
	return Job{ID: strconv.FormatInt(r.ID, 10), PublicID: db.UUIDString(r.PublicID), Key: r.JobKey, Kind: r.Kind, Lane: r.Lane, State: State(r.State), Attempts: int(r.Attempts), Payload: r.Payload, NextRunAt: r.NextRunAt.Time, Token: r.LeaseToken, LeaseExpiresAt: r.LeaseExpiresAt.Time, ClaimedAt: r.ClaimedAt.Time, AttemptDeadlineAt: r.AttemptDeadlineAt.Time, QuestionDeadlineAt: r.QuestionDeadlineAt.Time, CompletionOperation: r.CompletionOperation.String, CompletionPayload: r.CompletionPayload, ErrorMessage: r.ErrorMessage.String}
}
func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: !t.IsZero()} }
func txt(s string) pgtype.Text          { return pgtype.Text{String: s, Valid: s != ""} }
func save(ctx context.Context, q *dbgen.Queries, j Job, now time.Time) error {
	id, err := strconv.ParseInt(j.ID, 10, 64)
	if err != nil {
		return err
	}
	n, err := q.SaveLeasedJob(ctx, dbgen.SaveLeasedJobParams{ID: id, State: string(j.State), Attempts: int32(j.Attempts), LeaseToken: j.Token, LeaseExpiresAt: ts(j.LeaseExpiresAt), ClaimedAt: ts(j.ClaimedAt), AttemptDeadlineAt: ts(j.AttemptDeadlineAt), NextRunAt: ts(j.NextRunAt), CompletionOperation: txt(j.CompletionOperation), CompletionPayload: j.CompletionPayload, ErrorMessage: txt(j.ErrorMessage), UpdatedAt: ts(now)})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrMissing
	}
	if j.Kind == "agent_question" && j.terminal() {
		n, err = q.ProjectQuestionResult(ctx, dbgen.ProjectQuestionResultParams{JobID: id, Result: j.CompletionPayload})
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("missing question projection")
		}
	}
	return nil
}
func (s *PostgresStore) ClaimOne(ctx context.Context, lane string) (out Job, err error) {
	err = s.Transaction(ctx, func(q *dbgen.Queries) error {
		for range 32 {
			row, e := q.LockClaimableJob(ctx, lane)
			if errors.Is(e, pgx.ErrNoRows) {
				return nil
			}
			if e != nil {
				return e
			}
			clock, e := q.JobClock(ctx)
			if e != nil {
				return e
			}
			now := clock.Time // after FOR UPDATE, never transaction-start now()
			j := fromRow(row)
			ok, e := j.Claim(now)
			if e != nil {
				return e
			}
			if e = save(ctx, q, j, now); e != nil {
				return e
			}
			if ok {
				out = j
				return nil
			}
		}
		return nil
	})
	return
}
func (s *PostgresStore) mutate(ctx context.Context, r Receipt, fn func(*Job, time.Time) error) (out Job, err error) {
	token, e := ParseToken(r.Token)
	if e != nil {
		return out, e
	}
	id, e := strconv.ParseInt(r.ID, 10, 64)
	if e != nil {
		return out, ErrMissing
	}
	var outcome error
	err = s.Transaction(ctx, func(q *dbgen.Queries) error {
		row, e := q.LockJob(ctx, id)
		if errors.Is(e, pgx.ErrNoRows) {
			return ErrMissing
		}
		if e != nil {
			return e
		}
		clock, e := q.JobClock(ctx)
		if e != nil {
			return e
		}
		j := fromRow(row)
		if j.ExpireQuestion(clock.Time) {
			outcome = ErrLease
		} else {
			if j.Token != token {
				return ErrLease
			}
			if e = fn(&j, clock.Time); e != nil {
				return e
			}
		}
		out = j
		if row.State == string(j.State) && j.terminal() && row.CompletionOperation.String == j.CompletionOperation && EqualJSON(row.CompletionPayload, j.CompletionPayload) {
			return nil
		}
		return save(ctx, q, j, clock.Time)
	})
	if err == nil {
		err = outcome
	}
	return
}
func (s *PostgresStore) Renew(ctx context.Context, r Receipt) (Lease, error) {
	var lease Lease
	_, err := s.mutate(ctx, r, func(j *Job, now time.Time) error {
		t, _ := ParseToken(r.Token)
		if e := j.Renew(t, now); e != nil {
			return e
		}
		lease = j.Lease(now)
		return nil
	})
	return lease, err
}
func (s *PostgresStore) Complete(ctx context.Context, r Receipt, op string, state State, payload []byte, after time.Duration, reason string) error {
	_, err := s.mutate(ctx, r, func(j *Job, now time.Time) error {
		t, _ := ParseToken(r.Token)
		delay := after
		if op == "retry" && delay == 0 {
			delay = Backoff(j.Attempts)
		}
		return j.Finish(t, now, op, state, payload, delay, reason)
	})
	return err
}
func (s *PostgresStore) Succeed(ctx context.Context, r Receipt) error {
	return s.Complete(ctx, r, "succeed", Succeeded, []byte(`{}`), 0, "")
}
func (s *PostgresStore) Retry(ctx context.Context, r Receipt, after time.Duration, reason string) error {
	return s.Complete(ctx, r, "retry", RetryWait, nil, after, reason)
}
func (s *PostgresStore) Fail(ctx context.Context, r Receipt, state State, reason string) error {
	p, _ := json.Marshal(map[string]string{"reason": reason})
	return s.Complete(ctx, r, "fail", state, p, 0, reason)
}

// CancelByID is an internal operator command using the public job UUID. It
// deliberately needs no worker receipt: queued jobs have never held one.
// Terminal jobs remain immutable; an elapsed question deadline wins first.
func (s *PostgresStore) CancelByID(ctx context.Context, publicID string) error {
	id, e := db.ParseUUID(publicID)
	if e != nil {
		return ErrMissing
	}
	var outcome error
	err := s.Transaction(ctx, func(q *dbgen.Queries) error {
		row, e := q.LockPublicJob(ctx, id)
		if errors.Is(e, pgx.ErrNoRows) {
			return ErrMissing
		}
		if e != nil {
			return e
		}
		clock, e := q.JobClock(ctx)
		if e != nil {
			return e
		}
		j := fromRow(row)
		if j.ExpireQuestion(clock.Time) {
			outcome = ErrLease
		} else if e := j.Cancel(); e != nil {
			return e
		}
		return save(ctx, q, j, clock.Time)
	})
	if err != nil {
		return err
	}
	return outcome
}
func (s *PostgresStore) SweepQuestions(ctx context.Context, limit int) (count int, err error) {
	for range limit {
		changed := false
		err = s.Transaction(ctx, func(q *dbgen.Queries) error {
			r, e := q.LockExpiredQuestion(ctx)
			if errors.Is(e, pgx.ErrNoRows) {
				return nil
			}
			if e != nil {
				return e
			}
			clock, e := q.JobClock(ctx)
			if e != nil {
				return e
			}
			j := fromRow(r)
			changed = j.ExpireQuestion(clock.Time)
			if changed {
				return save(ctx, q, j, clock.Time)
			}
			return nil
		})
		if err != nil || !changed {
			return
		}
		count++
	}
	return
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
