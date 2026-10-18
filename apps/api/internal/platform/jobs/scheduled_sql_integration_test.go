//go:build integration

package jobs_test

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func scheduledNamedSQL(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile("../../../db/queries/jobs.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, section := range strings.Split(string(raw), "-- name: ")[1:] {
		header, query, ok := strings.Cut(section, "\n")
		if ok && strings.Fields(header)[0] == name {
			return strings.TrimSpace(query)
		}
	}
	t.Fatalf("missing owned named SQL %s", name)
	return ""
}

type scheduledSQLExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func scheduledExec(t *testing.T, ctx context.Context, db scheduledSQLExecutor, query string, args ...any) int64 {
	t.Helper()
	r, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		t.Fatal(err)
	}
	n, err := r.RowsAffected()
	if err != nil {
		t.Fatal(err)
	}
	return n
}
func scheduledSnapshot(t *testing.T, ctx context.Context, db *sql.DB, key string) string {
	t.Helper()
	var row string
	if err := db.QueryRowContext(ctx, `SELECT to_jsonb(j)::text FROM background_jobs j WHERE job_key=$1`, key).Scan(&row); err != nil {
		t.Fatal(err)
	}
	return row
}
func scheduledWaitForLock(t *testing.T, ctx context.Context, db *sql.DB, pid int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var waiting bool
		if err := db.QueryRowContext(ctx, `SELECT COALESCE(wait_event_type='Lock',false) FROM pg_stat_activity WHERE pid=$1`, pid).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("contender did not reach PostgreSQL row/unique-key lock")
}

func TestScheduledSQLAdmission(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 9*time.Minute)
	defer cancel()
	before, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("preexisting container identities: %s", strings.TrimSpace(string(before)))
	c, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("j03"), postgres.WithUsername("j03"), postgres.WithPassword("synthetic-j03"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned PostgreSQL container: %s", c.GetContainerID())
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if err := c.Terminate(cleanupCtx); err != nil {
			t.Errorf("terminate owned PostgreSQL: %v", err)
			return
		}
		after, err := exec.CommandContext(cleanupCtx, "docker", "ps", "-aq", "--no-trunc").Output()
		if err != nil {
			t.Error(err)
			return
		}
		remaining := make(map[string]bool)
		for _, id := range strings.Fields(string(after)) {
			remaining[id] = true
		}
		for _, id := range strings.Fields(string(before)) {
			if !remaining[id] {
				t.Errorf("preexisting container missing: %s", id)
			}
		}
		if remaining[c.GetContainerID()] {
			t.Error("owned PostgreSQL container remains")
		}
		t.Logf("container identities after owned cleanup: %s", strings.TrimSpace(string(after)))
	})
	dsn, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(6)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, db, "../../../db/migrations"); err != nil {
		t.Fatal(err)
	}
	var version int64
	if err := db.QueryRowContext(ctx, `SELECT max(version_id) FROM goose_db_version WHERE is_applied`).Scan(&version); err != nil || version != 4 {
		t.Fatalf("migrated version=%d error=%v", version, err)
	}
	enqueue := scheduledNamedSQL(t, "EnqueueScheduledJob")
	payload := `{"version":1,"scheduledSlot":"2026-10-14T00:00:00Z","schemaVersion":3,"buildId":"j03"}`
	t.Run("new-slot-and-repeat", func(t *testing.T) {
		key := "maintenance:gametime_fill:2026-10-14T00:00:00Z"
		var beforeAdmission time.Time
		if err := db.QueryRowContext(ctx, `SELECT clock_timestamp()`).Scan(&beforeAdmission); err != nil {
			t.Fatal(err)
		}
		if n := scheduledExec(t, ctx, db, enqueue, key, "gametime_fill", "maintenance", payload); n != 1 {
			t.Fatalf("new slot affected %d rows", n)
		}
		var state, kind, lane string
		var attempts, token int64
		var questionDeadline sql.NullTime
		var samePayload bool
		var nextRun, afterAdmission time.Time
		if err := db.QueryRowContext(ctx, `SELECT state,kind,lane,attempts,lease_token,question_deadline_at,payload=$2::jsonb,next_run_at,clock_timestamp() FROM background_jobs WHERE job_key=$1`, key, payload).Scan(&state, &kind, &lane, &attempts, &token, &questionDeadline, &samePayload, &nextRun, &afterAdmission); err != nil {
			t.Fatal(err)
		}
		if state != "queued" || kind != "gametime_fill" || lane != "maintenance" || attempts != 0 || token != 0 || questionDeadline.Valid || !samePayload {
			t.Fatalf("incorrect slot state=%s kind=%s lane=%s attempts=%d token=%d deadline=%v payload=%v", state, kind, lane, attempts, token, questionDeadline, samePayload)
		}
		if nextRun.Before(beforeAdmission) || nextRun.After(afterAdmission) {
			t.Fatalf("next run %s outside actual admission clocks [%s,%s]", nextRun, beforeAdmission, afterAdmission)
		}
		before := scheduledSnapshot(t, ctx, db, key)
		if n := scheduledExec(t, ctx, db, enqueue, key, "different_kind", "different_lane", `{"different":true}`); n != 0 {
			t.Fatalf("repeat affected %d rows", n)
		}
		if after := scheduledSnapshot(t, ctx, db, key); after != before {
			t.Fatalf("repeat changed slot\nbefore %s\nafter %s", before, after)
		}
	})
	for _, state := range []string{"queued", "running", "succeeded", "retry_wait", "repair_required", "dead", "cancelled"} {
		t.Run("preserve-"+state, func(t *testing.T) {
			key := "maintenance:preserve:" + state
			scheduledExec(t, ctx, db, `INSERT INTO background_jobs(job_key,kind,lane,state,payload,attempts,lease_token,lease_expires_at,claimed_at,attempt_deadline_at,completion_operation,completion_payload,error_message,redrive_count,safe_error_code)
    VALUES($1,'gametime_fill','maintenance',$2,'{"original":true}',7,89,
    CASE WHEN $2='running' THEN clock_timestamp()+interval '120 seconds' END,
    CASE WHEN $2='running' THEN clock_timestamp() END,
    CASE WHEN $2='running' THEN clock_timestamp()+interval '10 minutes' END,
    'original.completion','{"originalReceipt":true}','retained-error',3,'RETAINED_CODE')`, key, state)
			before := scheduledSnapshot(t, ctx, db, key)
			if n := scheduledExec(t, ctx, db, enqueue, key, "reconcile_dry_run", "changed", payload); n != 0 {
				t.Fatalf("existing %s affected %d rows", state, n)
			}
			if after := scheduledSnapshot(t, ctx, db, key); after != before {
				t.Fatalf("existing %s changed\nbefore %s\nafter %s", state, before, after)
			}
		})
	}
	t.Run("concurrent-single-admission", func(t *testing.T) {
		key := "maintenance:concurrent:2026-10-14T00:30:00Z"
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		if n := scheduledExec(t, ctx, tx, enqueue, key, "reconcile_dry_run", "maintenance", payload); n != 1 {
			t.Fatalf("first contender affected %d", n)
		}
		conn, err := db.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		defer tx.Rollback()
		var pid int
		if err := conn.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&pid); err != nil {
			t.Fatal(err)
		}
		type outcome struct {
			n   int64
			err error
		}
		result := make(chan outcome, 1)
		go func() {
			r, err := conn.ExecContext(ctx, enqueue, key, "changed", "changed", `{"changed":true}`)
			if err != nil {
				result <- outcome{err: err}
				return
			}
			n, err := r.RowsAffected()
			result <- outcome{n: n, err: err}
		}()
		scheduledWaitForLock(t, ctx, db, pid)
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		got := <-result
		if got.err != nil || got.n != 0 {
			t.Fatalf("second admission rows=%d err=%v", got.n, got.err)
		}
		var count int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM background_jobs WHERE job_key=$1 AND kind='reconcile_dry_run' AND lane='maintenance' AND payload=$2::jsonb`, key, payload).Scan(&count); err != nil || count != 1 {
			t.Fatalf("concurrent original rows=%d err=%v", count, err)
		}
	})
	t.Run("required-persistence-failure-rolls-back-admission", func(t *testing.T) {
		key := "maintenance:rollback:2026-10-14T00:00:00Z"
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		if n := scheduledExec(t, ctx, tx, enqueue, key, "gametime_fill", "maintenance", payload); n != 1 {
			t.Fatalf("insert rows=%d", n)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO operational_observations(observed_at,payload,state) VALUES(clock_timestamp(),'{}','QUEUED')`); err == nil {
			t.Fatal("required observation accepted missing key")
		}
		if err := tx.Commit(); err == nil {
			t.Fatal("aborted admission committed")
		}
		var count int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM background_jobs WHERE job_key=$1`, key).Scan(&count); err != nil || count != 0 {
			t.Fatalf("rolled-back rows=%d err=%v", count, err)
		}
		if n := scheduledExec(t, ctx, db, enqueue, key, "gametime_fill", "maintenance", payload); n != 1 {
			t.Fatalf("admission after rollback rows=%d", n)
		}
	})
	t.Run("post-lock-database-clock-and-skip-locked", func(t *testing.T) {
		key := "maintenance:lockclock:2026-10-14T00:00:00Z"
		scheduledExec(t, ctx, db, enqueue, key, "gametime_fill", "lockclock", payload)
		var id int64
		if err := db.QueryRowContext(ctx, `SELECT id FROM background_jobs WHERE job_key=$1`, key).Scan(&id); err != nil {
			t.Fatal(err)
		}
		lock, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer lock.Rollback()
		rows, err := lock.QueryContext(ctx, scheduledNamedSQL(t, "LockJob"), id)
		if err != nil {
			t.Fatal(err)
		}
		rows.Close()
		rows, err = db.QueryContext(ctx, scheduledNamedSQL(t, "LockClaimableJob"), "lockclock")
		if err != nil {
			t.Fatal(err)
		}
		if rows.Next() {
			rows.Close()
			t.Fatal("locked row was claimable")
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		rows.Close()
		contender, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer contender.Rollback()
		defer lock.Rollback()
		var pid int
		var transactionStart time.Time
		if err := contender.QueryRowContext(ctx, `SELECT pg_backend_pid(),transaction_timestamp()`).Scan(&pid, &transactionStart); err != nil {
			t.Fatal(err)
		}
		lockSQL := scheduledNamedSQL(t, "LockJob")
		result := make(chan error, 1)
		go func() {
			rows, err := contender.QueryContext(ctx, lockSQL, id)
			if err == nil {
				err = rows.Close()
			}
			result <- err
		}()
		scheduledWaitForLock(t, ctx, db, pid)
		var releaseClock time.Time
		if err := lock.QueryRowContext(ctx, `SELECT clock_timestamp()`).Scan(&releaseClock); err != nil {
			t.Fatal(err)
		}
		if err := lock.Commit(); err != nil {
			t.Fatal(err)
		}
		if err := <-result; err != nil {
			t.Fatal(err)
		}
		var postLockClock time.Time
		if err := contender.QueryRowContext(ctx, scheduledNamedSQL(t, "JobClock")).Scan(&postLockClock); err != nil {
			t.Fatal(err)
		}
		if !postLockClock.After(releaseClock) || !postLockClock.After(transactionStart) {
			t.Fatalf("clock sampled before acquired lock: tx=%s release=%s sampled=%s", transactionStart, releaseClock, postLockClock)
		}
		t.Logf("actual database clocks transaction=%s release=%s post-lock=%s", transactionStart, releaseClock, postLockClock)
	})
	t.Logf("executed actual owned jobs.sql against Goose version %d", version)
}
