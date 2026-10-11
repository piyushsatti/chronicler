//go:build integration

package integration_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func TestJobLeaseConcurrentClaimReclaimAndReplay(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := jobs.NewPostgresStore(pool.Pool)
	lane := fmt.Sprintf("lease-test-%d", time.Now().UnixNano())
	key := lane + ":one"
	t.Cleanup(func() { pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE job_key=$1`, key) })
	if e := s.Enqueue(ctx, jobs.Job{Key: key, Kind: "test", Lane: lane}); e != nil {
		t.Fatal(e)
	}
	start := make(chan struct{})
	var wg sync.WaitGroup
	got := make(chan jobs.Job, 2)
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; j, e := s.ClaimOne(ctx, lane); got <- j; errs <- e }()
	}
	close(start)
	wg.Wait()
	close(got)
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	var first jobs.Job
	count := 0
	for j := range got {
		if j.ID != "" {
			count++
			first = j
		}
	}
	if count != 1 || first.Token != 1 {
		t.Fatalf("claims=%d job=%+v", count, first)
	}
	if _, e := pool.Exec(ctx, `UPDATE background_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, first.ID); e != nil {
		t.Fatal(e)
	}
	second, e := s.ClaimOne(ctx, lane)
	if e != nil || second.Token != 2 || second.Attempts != 2 {
		t.Fatal(second, e)
	}
	if e := s.Succeed(ctx, first.Receipt()); !errors.Is(e, jobs.ErrLease) {
		t.Fatal("stale finish", e)
	}
	if _, e := s.Renew(ctx, first.Receipt()); !errors.Is(e, jobs.ErrLease) {
		t.Fatal("stale renew", e)
	}
	if e := s.Retry(ctx, first.Receipt(), time.Second, "transient_error"); !errors.Is(e, jobs.ErrLease) {
		t.Fatal("stale retry", e)
	}
	if e := s.Succeed(ctx, second.Receipt()); e != nil {
		t.Fatal(e)
	}
	var before, after time.Time
	pool.QueryRow(ctx, `SELECT updated_at FROM background_jobs WHERE id=$1`, second.ID).Scan(&before)
	if e := s.Succeed(ctx, second.Receipt()); e != nil {
		t.Fatal("lost response replay", e)
	}
	pool.QueryRow(ctx, `SELECT updated_at FROM background_jobs WHERE id=$1`, second.ID).Scan(&after)
	if before != after {
		t.Fatal("replay rewrote terminal row")
	}
	if e := s.Fail(ctx, second.Receipt(), jobs.Dead, "changed"); !errors.Is(e, jobs.ErrLease) {
		t.Fatal(e)
	}
	if e := s.Enqueue(ctx, jobs.Job{Key: key, Kind: "test", Lane: lane}); e != nil {
		t.Fatal(e)
	}
	third, e := s.ClaimOne(ctx, lane)
	if e != nil || third.ID != first.ID || third.Token != 3 || third.Attempts != 1 {
		t.Fatal(third, e)
	}
	if e := s.Succeed(ctx, second.Receipt()); !errors.Is(e, jobs.ErrLease) {
		t.Fatal("old generation replay", e)
	}
}

func TestJobLeaseSamplesClockAfterRowLock(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := jobs.NewPostgresStore(pool.Pool)
	key := fmt.Sprintf("lockclock-%d", time.Now().UnixNano())
	t.Cleanup(func() { pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE job_key=$1`, key) })
	if e := s.Enqueue(ctx, jobs.Job{Key: key, Kind: "test", Lane: key}); e != nil {
		t.Fatal(e)
	}
	j, e := s.ClaimOne(ctx, key)
	if e != nil {
		t.Fatal(e)
	}
	tx, e := pool.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(ctx)
	// The completion transaction starts while the receipt is valid, then waits
	// behind this lock until it has expired. Transaction-start now() is unsafe.
	if _, e = tx.Exec(ctx, `UPDATE background_jobs SET lease_expires_at=clock_timestamp()+interval '100 milliseconds' WHERE id=$1`, j.ID); e != nil {
		t.Fatal(e)
	}
	finished := make(chan error, 1)
	go func() { finished <- s.Succeed(ctx, j.Receipt()) }()
	time.Sleep(200 * time.Millisecond)
	if e := tx.Commit(ctx); e != nil {
		t.Fatal(e)
	}
	if e := <-finished; !errors.Is(e, jobs.ErrLease) {
		t.Fatal("completion after lock wait", e)
	}
}

func TestJobLeaseRetryAndCancellationRace(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := jobs.NewPostgresStore(pool.Pool)
	key := fmt.Sprintf("cancel-%d", time.Now().UnixNano())
	t.Cleanup(func() { pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE job_key=$1`, key) })
	if e := s.Enqueue(ctx, jobs.Job{Key: key, Kind: "test", Lane: key}); e != nil {
		t.Fatal(e)
	}
	j, e := s.ClaimOne(ctx, key)
	if e != nil {
		t.Fatal(e)
	}
	if e := s.Retry(ctx, j.Receipt(), time.Millisecond, "transient_error"); e != nil {
		t.Fatal(e)
	}
	if e := s.Retry(ctx, j.Receipt(), time.Millisecond, "transient_error"); !errors.Is(e, jobs.ErrLease) {
		t.Fatal("released retry", e)
	}
	pool.Exec(ctx, `UPDATE background_jobs SET next_run_at=clock_timestamp() WHERE id=$1`, j.ID)
	j, e = s.ClaimOne(ctx, key)
	if e != nil {
		t.Fatal(e)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	go func() { <-start; results <- s.Succeed(ctx, j.Receipt()) }()
	go func() { <-start; results <- s.CancelByID(ctx, j.PublicID) }()
	close(start)
	a, b := <-results, <-results
	if !((a == nil && errors.Is(b, jobs.ErrLease)) || (b == nil && errors.Is(a, jobs.ErrLease))) {
		t.Fatal(a, b)
	}
	var state string
	if e := pool.QueryRow(ctx, `SELECT state FROM background_jobs WHERE id=$1`, j.ID).Scan(&state); e != nil {
		t.Fatal(e)
	}
	if state != "succeeded" && state != "cancelled" {
		t.Fatal(state)
	}
}

// These tests exercise the current initial schema on an admitted disposable
// database. They do not establish an upgrade path for former Goose histories.
func TestJobLeaseSchemaCatalog(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	t.Run("single_lifecycle_authority", func(t *testing.T) {
		var count int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns
			WHERE table_schema='public' AND table_name='agent_questions' AND column_name='state'`).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatal("agent_questions must derive lifecycle from background_jobs")
		}
	})
	t.Run("lease_token_column", func(t *testing.T) {
		var notNull bool
		var typeName, defaultExpr string
		if err := pool.QueryRow(ctx, `SELECT a.attnotnull, format_type(a.atttypid,a.atttypmod), pg_get_expr(d.adbin,d.adrelid)
			FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
			WHERE a.attrelid='public.background_jobs'::regclass AND a.attname='lease_token' AND NOT a.attisdropped`).Scan(&notNull, &typeName, &defaultExpr); err != nil {
			t.Fatal(err)
		}
		if !notNull || typeName != "bigint" || defaultExpr != "0" {
			t.Fatalf("lease_token: notNull=%v type=%s default=%s", notNull, typeName, defaultExpr)
		}
	})
	for _, check := range []struct {
		name    string
		columns []string
	}{
		{"background_jobs_lease_token_check", []string{"lease_token"}},
		{"job_lease_state", []string{"attempt_deadline_at", "claimed_at", "lease_expires_at", "state"}},
		{"job_completion_pair", []string{"completion_operation", "completion_payload"}},
		{"agent_question_deadline", []string{"kind", "question_deadline_at"}},
	} {
		t.Run(check.name, func(t *testing.T) {
			var validated bool
			var definition string
			var columns []string
			if err := pool.QueryRow(ctx, `SELECT c.convalidated, pg_get_constraintdef(c.oid),
				ARRAY(SELECT a.attname::text FROM unnest(c.conkey) AS keys(attnum)
					JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=keys.attnum ORDER BY a.attname)
				FROM pg_constraint c WHERE c.conrelid='public.background_jobs'::regclass AND c.conname=$1 AND c.contype='c'`, check.name).Scan(&validated, &definition, &columns); err != nil {
				t.Fatal(err)
			}
			if !validated || !strings.HasPrefix(definition, "CHECK (") || strings.Join(columns, ",") != strings.Join(check.columns, ",") {
				t.Fatalf("constraint %s: validated=%v columns=%v definition=%s", check.name, validated, columns, definition)
			}
			t.Logf("%s: %s", check.name, definition)
		})
	}
	for _, index := range []struct {
		name, column string
		agentOnly    bool
	}{
		{"background_jobs_expiry_idx", "lease_expires_at", false},
		{"background_jobs_question_deadline_idx", "question_deadline_at", true},
	} {
		t.Run(index.name, func(t *testing.T) {
			var valid, ready, unique bool
			var method, predicate string
			var columns []string
			if err := pool.QueryRow(ctx, `SELECT i.indisvalid, i.indisready, i.indisunique, am.amname, pg_get_expr(i.indpred,i.indrelid),
				ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS keys(attnum,ordinal)
					JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=keys.attnum ORDER BY keys.ordinal)
				FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
				WHERE i.indrelid='public.background_jobs'::regclass AND i.indexrelid=to_regclass('public.' || $1)`, index.name).Scan(&valid, &ready, &unique, &method, &predicate, &columns); err != nil {
				t.Fatal(err)
			}
			if !valid || !ready || unique || method != "btree" || len(columns) != 1 || columns[0] != index.column || predicate == "" {
				t.Fatalf("index %s: valid=%v ready=%v unique=%v method=%s columns=%v predicate=%s", index.name, valid, ready, unique, method, columns, predicate)
			}
			// Evaluate PostgreSQL's catalog predicate, rather than matching its
			// version-specific deparsed spelling, for every supported state/kind.
			for _, kind := range []string{"test", "agent_question"} {
				for _, state := range leaseSchemaStates {
					want := state == "running"
					if index.agentOnly {
						want = kind == "agent_question" && (state == "queued" || state == "retry_wait" || state == "running")
					}
					var got bool
					query := fmt.Sprintf(`SELECT %s FROM (VALUES ($1::text,$2::text)) AS fixture(kind,state)`, predicate)
					if err := pool.QueryRow(ctx, query, kind, state).Scan(&got); err != nil {
						t.Fatal(err)
					}
					if got != want {
						t.Fatalf("index %s includes kind=%s state=%s: got %v want %v", index.name, kind, state, got, want)
					}
				}
			}
			t.Logf("%s: %s", index.name, predicate)
		})
	}
}

func TestJobLeaseSchemaAdmitsValidJobs(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	for _, kind := range []string{"test", "agent_question"} {
		for _, state := range leaseSchemaStates {
			t.Run(kind+"_"+state, func(t *testing.T) {
				tx, err := pool.Begin(ctx)
				if err != nil {
					t.Fatal(err)
				}
				defer tx.Rollback(ctx)
				fixture := leaseSchemaFixture{kind: kind, state: state, token: int64(0)}
				if state == "running" {
					fixture.timestamps = 7
				}
				if kind == "agent_question" {
					fixture.questionDeadline = time.Now().Add(time.Minute)
				}
				if _, err := insertLeaseSchemaFixture(ctx, tx, t.Name(), fixture); err != nil {
					t.Fatalf("valid row rejected: %v", err)
				}
			})
		}
	}
	t.Run("completion_pair", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		fixture := leaseSchemaFixture{kind: "test", state: "succeeded", token: int64(1), operation: "test.completed", payload: "{}"}
		if _, err := insertLeaseSchemaFixture(ctx, tx, t.Name(), fixture); err != nil {
			t.Fatalf("matching completion pair rejected: %v", err)
		}
	})
	t.Run("default_lease_token", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var token int64
		if err := tx.QueryRow(ctx, `INSERT INTO background_jobs(job_key,kind) VALUES($1,'test') RETURNING lease_token`, t.Name()).Scan(&token); err != nil {
			t.Fatal(err)
		}
		if token != 0 {
			t.Fatalf("default lease token=%d, want 0", token)
		}
	})
}

func TestJobLeaseSchemaRejectsInvalidJobs(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	type rejection struct {
		name, code, constraint, column string
		fixture                        leaseSchemaFixture
	}
	base := leaseSchemaFixture{kind: "test", state: "queued", token: int64(0)}
	negative, nullToken, operationOnly, payloadOnly, agentNoDeadline, genericDeadline := base, base, base, base, base, base
	negative.token = int64(-1)
	nullToken.token = nil
	operationOnly.operation = "test.completed"
	payloadOnly.payload = "{}"
	agentNoDeadline.kind = "agent_question"
	genericDeadline.questionDeadline = time.Now().Add(time.Minute)
	cases := []rejection{
		{"negative_lease_token", "23514", "background_jobs_lease_token_check", "", negative},
		{"null_lease_token", "23502", "", "lease_token", nullToken},
		{"completion_operation_only", "23514", "job_completion_pair", "", operationOnly},
		{"completion_payload_only", "23514", "job_completion_pair", "", payloadOnly},
		{"agent_without_question_deadline", "23514", "agent_question_deadline", "", agentNoDeadline},
		{"generic_with_question_deadline", "23514", "agent_question_deadline", "", genericDeadline},
	}
	for _, state := range leaseSchemaStates {
		for mask := uint8(0); mask < 8; mask++ {
			if (state == "running" && mask == 7) || (state != "running" && mask == 0) {
				continue
			}
			fixture := base
			fixture.state, fixture.timestamps = state, mask
			cases = append(cases, rejection{fmt.Sprintf("%s_timestamps_%03b", state, mask), "23514", "job_lease_state", "", fixture})
		}
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			_, err = insertLeaseSchemaFixture(ctx, tx, t.Name(), tc.fixture)
			var pgErr *pgconn.PgError
			if !errors.As(err, &pgErr) || pgErr.Code != tc.code || pgErr.TableName != "background_jobs" || pgErr.ConstraintName != tc.constraint || pgErr.ColumnName != tc.column {
				t.Fatalf("want SQLSTATE=%s table=background_jobs constraint=%s column=%s, got %v", tc.code, tc.constraint, tc.column, err)
			}
		})
	}
}

var leaseSchemaStates = []string{"queued", "running", "succeeded", "retry_wait", "repair_required", "dead", "cancelled"}

type leaseSchemaFixture struct {
	kind, state      string
	token            any
	timestamps       uint8
	questionDeadline any
	operation        any
	payload          any
}

func insertLeaseSchemaFixture(ctx context.Context, tx pgx.Tx, key string, fixture leaseSchemaFixture) (int64, error) {
	var timestamps [3]any
	for i := range timestamps {
		if fixture.timestamps&(1<<i) != 0 {
			timestamps[i] = time.Now().Add(time.Minute)
		}
	}
	var token int64
	err := tx.QueryRow(ctx, `INSERT INTO background_jobs
		(job_key,kind,state,lease_token,lease_expires_at,claimed_at,attempt_deadline_at,question_deadline_at,completion_operation,completion_payload)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING lease_token`,
		key, fixture.kind, fixture.state, fixture.token, timestamps[0], timestamps[1], timestamps[2], fixture.questionDeadline, fixture.operation, fixture.payload).Scan(&token)
	return token, err
}
