//go:build integration

package integration_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

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

// Run only against the admitted disposable database. Temporary shadow tables
// isolate the exact migration precondition from the migrated application data.
func TestJobLeaseMigrationRefusesAdmittedWork(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	raw, e := os.ReadFile("../../db/migrations/0002_job_leases.sql")
	if e != nil {
		t.Fatal(e)
	}
	up := strings.Split(string(raw), "-- +goose Down")[0]
	for _, fixture := range []string{"running_generic", "queued_agent", "question_projection"} {
		t.Run(fixture, func(t *testing.T) {
			tx, e := pool.Begin(ctx)
			if e != nil {
				t.Fatal(e)
			}
			defer tx.Rollback(ctx)
			if _, e := tx.Exec(ctx, `CREATE TEMP TABLE background_jobs(id bigint,state text,kind text); CREATE TEMP TABLE agent_questions(job_id bigint);`); e != nil {
				t.Fatal(e)
			}
			switch fixture {
			case "running_generic":
				_, e = tx.Exec(ctx, `INSERT INTO background_jobs VALUES(1,'running','maintenance')`)
			case "queued_agent":
				_, e = tx.Exec(ctx, `INSERT INTO background_jobs VALUES(1,'queued','agent_question')`)
			case "question_projection":
				_, e = tx.Exec(ctx, `INSERT INTO agent_questions VALUES(1)`)
			}
			if e != nil {
				t.Fatal(e)
			}
			_, e = tx.Exec(ctx, up)
			if e == nil || !strings.Contains(e.Error(), "requires reconciliation") {
				t.Fatalf("migration admitted %s: %v", fixture, e)
			}
		})
	}
}
