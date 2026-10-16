//go:build integration

package observations_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/piyushsatti/chronicler/apps/api/internal/observations"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func ob03Query(t *testing.T, name string, values map[string]any) (string, []any) {
	t.Helper()
	raw, err := os.ReadFile("../../db/queries/observations.sql")
	if err != nil {
		t.Fatal(err)
	}
	marker := "-- name: " + name + " "
	_, rest, found := strings.Cut(string(raw), marker)
	if !found {
		t.Fatalf("missing query %s", name)
	}
	_, body, _ := strings.Cut(rest, "\n")
	body, _, _ = strings.Cut(body, "-- name:")
	var args []any
	indexes := map[string]int{}
	body = regexp.MustCompile(`sqlc\.arg\(([a-z_]+)\)`).ReplaceAllStringFunc(body, func(s string) string {
		key := strings.TrimSuffix(strings.TrimPrefix(s, "sqlc.arg("), ")")
		i, ok := indexes[key]
		if !ok {
			v, exists := values[key]
			if !exists {
				t.Fatalf("missing %s argument", key)
			}
			args = append(args, v)
			i = len(args)
			indexes[key] = i
		}
		return fmt.Sprintf("$%d", i)
	})
	return body, args
}

func TestPhase3TaskOB03Acceptance(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable database; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	before, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("preexisting container identities %s", strings.TrimSpace(string(before)))
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("ob03"), postgres.WithUsername("ob03"), postgres.WithPassword("synthetic-ob03"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned PostgreSQL container %s", container.GetContainerID())
	t.Cleanup(func() {
		cleanCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := container.Terminate(cleanCtx); err != nil {
			t.Error(err)
		}
		after, err := exec.CommandContext(cleanCtx, "docker", "ps", "-aq", "--no-trunc").Output()
		if err != nil {
			t.Error(err)
			return
		}
		for _, id := range strings.Fields(string(before)) {
			if !strings.Contains(string(after), id) {
				t.Errorf("preexisting container removed %s", id)
			}
		}
		if strings.Contains(string(after), container.GetContainerID()) {
			t.Error("owned PostgreSQL remains")
		}
		t.Logf("container identities after owned cleanup %s", strings.TrimSpace(string(after)))
	})
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	migrationDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer migrationDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	migrations, err := filepath.Abs("../../db/migrations")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, migrationDB, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	run := func(name string, values map[string]any) int64 {
		t.Helper()
		q, args := ob03Query(t, name, values)
		tag, err := pool.Exec(ctx, q, args...)
		if err != nil {
			t.Fatal(err)
		}
		return tag.RowsAffected()
	}
	slot := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	now := slot.Add(2 * time.Minute)
	id := "00000000-0000-0000-0000-000000000140"
	key := "maintenance:gametime_fill:2026-10-14T00:00:00Z"
	slots := `[{"kind":"gametime_fill","slot":"2026-10-14T00:00:00Z","deadline":"2026-10-14T00:15:00Z"},{"kind":"reconcile_dry_run","slot":"2026-10-14T00:30:00Z","deadline":"2026-10-14T00:45:00Z"}]`
	type status struct {
		Kind          string
		Slot          time.Time
		Outcome       string
		Start, Finish *time.Time
		Job, Code     *string
	}
	read := func() []status {
		t.Helper()
		q, args := ob03Query(t, "ListScheduledObservationOutcomes", map[string]any{"slots": slots})
		rows, err := pool.Query(ctx, q, args...)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []status
		for rows.Next() {
			var s status
			if err := rows.Scan(&s.Kind, &s.Slot, &s.Outcome, &s.Start, &s.Finish, &s.Job, &s.Code); err != nil {
				t.Fatal(err)
			}
			out = append(out, s)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return out
	}
	overdue := func(at time.Time) []string {
		t.Helper()
		q, args := ob03Query(t, "ListOverdueScheduledObservations", map[string]any{"slots": slots, "now": at})
		rows, err := pool.Query(ctx, q, args...)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var kinds []string
		for rows.Next() {
			var kind string
			var a, b time.Time
			if err := rows.Scan(&kind, &a, &b); err != nil {
				t.Fatal(err)
			}
			kinds = append(kinds, kind)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return kinds
	}
	t.Run("WORK-OUTCOME no admission is unknown execution", func(t *testing.T) {
		got := read()
		if len(got) != 2 {
			t.Fatal(got)
		}
		for _, s := range got {
			if s.Outcome != "NEVER_RAN" || s.Start != nil || s.Finish != nil || s.Job != nil || s.Code != nil {
				t.Fatal(s)
			}
		}
	})
	t.Run("WORK-MISSED exact deadline inclusive", func(t *testing.T) {
		if got := overdue(slot.Add(14 * time.Minute)); len(got) != 0 {
			t.Fatal(got)
		}
		if got := overdue(slot.Add(15 * time.Minute)); !reflect.DeepEqual(got, []string{"gametime_fill"}) {
			t.Fatal(got)
		}
	})
	if _, err := pool.Exec(ctx, `INSERT INTO background_jobs(public_id,job_key,kind,state,lease_token,attempts) VALUES($1,$2,'gametime_fill','succeeded',1,1)`, id, key); err != nil {
		t.Fatal(err)
	}
	start, finish := slot.Add(time.Minute), slot.Add(2*time.Minute)
	fact := jobs.LifecycleFact{JobID: id, JobKey: key, Kind: "gametime_fill", BuildID: "fixture", State: jobs.State("succeeded"), Slot: &slot, StartedAt: &start, FinishedAt: &finish, LeaseToken: 1, Attempt: 1, EventKind: jobs.LifecycleEventSucceeded}
	encode := func(v any) []byte {
		t.Helper()
		raw, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	t.Run("immutable lifecycle and fenced identity", func(t *testing.T) {
		raw := encode(fact)
		values := map[string]any{"fact": raw, "observed_at": now}
		if got := run("InsertLifecycleObservation", values); got != 1 {
			t.Fatal(got)
		}
		if got := run("InsertLifecycleObservation", values); got != 0 {
			t.Fatal(got)
		}
		changed := fact
		changed.EffectCount = 999
		if got := run("InsertLifecycleObservation", map[string]any{"fact": encode(changed), "observed_at": now.Add(time.Hour)}); got != 0 {
			t.Fatal(got)
		}
		q, args := ob03Query(t, "GetOperationalObservation", map[string]any{"key": "job:" + id + ":token:1:event:SUCCEEDED"})
		var k, state string
		var at time.Time
		var stored []byte
		if err := pool.QueryRow(ctx, q, args...).Scan(&k, &at, &state, &stored); err != nil {
			t.Fatal(err)
		}
		var got jobs.LifecycleFact
		if err := json.Unmarshal(stored, &got); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, fact) || !at.Equal(now) || state != "succeeded" {
			t.Fatalf("changed immutable fact %#v %s %s", got, at, state)
		}
		changed.LeaseToken = 2
		if got := run("InsertLifecycleObservation", map[string]any{"fact": encode(changed), "observed_at": now}); got != 0 {
			t.Fatal("stale/noncurrent token inserted", got)
		}
	})
	t.Run("WORK-OUTCOME persisted success and WORK-MISSED recovery", func(t *testing.T) {
		got := read()
		s := got[0]
		if s.Outcome != "SUCCEEDED" || s.Job == nil || *s.Job != id || s.Start == nil || !s.Start.Equal(start) || s.Finish == nil || !s.Finish.Equal(finish) {
			t.Fatal(got)
		}
		if got := overdue(slot.Add(17 * time.Minute)); len(got) != 0 {
			t.Fatal(got)
		}
	})
	t.Run("WORK-OUTCOME failed execution and unrelated JSON projection", func(t *testing.T) {
		failedID := "00000000-0000-0000-0000-000000000141"
		failedSlot := slot.Add(30 * time.Minute)
		failedStart, failedFinish := slot.Add(31*time.Minute), slot.Add(32*time.Minute)
		failedKey := "maintenance:reconcile_dry_run:2026-10-14T00:30:00Z"
		if _, err := pool.Exec(ctx, `INSERT INTO background_jobs(public_id,job_key,kind,state,lease_token,attempts,safe_error_code) VALUES($1,$2,'reconcile_dry_run','dead',1,1,'JOB_INVARIANT_FAILED')`, failedID, failedKey); err != nil {
			t.Fatal(err)
		}
		code := "JOB_INVARIANT_FAILED"
		failed := jobs.LifecycleFact{JobID: failedID, JobKey: failedKey, Kind: "reconcile_dry_run", BuildID: "fixture", State: jobs.State("dead"), Slot: &failedSlot, StartedAt: &failedStart, FinishedAt: &failedFinish, LeaseToken: 1, Attempt: 1, SafeErrorCode: &code, EventKind: jobs.LifecycleEventFailed}
		if got := run("InsertLifecycleObservation", map[string]any{"fact": encode(failed), "observed_at": failedFinish}); got != 1 {
			t.Fatal(got)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO operational_observations(key,observed_at,state,payload) VALUES('probe:unrelated',$1,'UNKNOWN','{"JobID":"invalid external text"}')`, now); err != nil {
			t.Fatal(err)
		}
		got := read()
		f := got[1]
		if f.Outcome != "FAILED" || f.Job == nil || *f.Job != failedID || f.Code == nil || *f.Code != code || f.Start == nil || !f.Start.Equal(failedStart) || f.Finish == nil || !f.Finish.Equal(failedFinish) {
			t.Fatal(got)
		}
		if got := overdue(slot.Add(45 * time.Minute)); !reflect.DeepEqual(got, []string{"reconcile_dry_run"}) {
			t.Fatal(got)
		}
		q, args := ob03Query(t, "ListTerminalWorkObservations", nil)
		rows, err := pool.Query(ctx, q, args...)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		count := 0
		for rows.Next() {
			var id, kind, state string
			var safe *string
			if err := rows.Scan(&id, &kind, &state, &safe); err != nil {
				t.Fatal(err)
			}
			if id != failedID || kind != "reconcile_dry_run" || state != "dead" || safe == nil || *safe != code {
				t.Fatal(id, kind, state, safe)
			}
			count++
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatal(count)
		}
	})
	t.Run("condition versions immutable exact key and rollback", func(t *testing.T) {
		transition := observations.AlertTransition{Key: "missed:gametime_fill:2026-10-14T00:00:00Z", Kind: "MISSED", State: "OPEN", SafeSummary: "scheduled work overdue", Version: 1, ObservedAt: slot.Add(15 * time.Minute)}
		if got := run("InsertConditionObservation", map[string]any{"transition": encode(transition)}); got != 1 {
			t.Fatal(got)
		}
		if got := run("InsertConditionObservation", map[string]any{"transition": encode(transition)}); got != 0 {
			t.Fatal(got)
		}
		transition.Version = 2
		transition.State = "RESOLVED"
		transition.ObservedAt = slot.Add(17 * time.Minute)
		if got := run("InsertConditionObservation", map[string]any{"transition": encode(transition)}); got != 1 {
			t.Fatal(got)
		}
		q, args := ob03Query(t, "CurrentConditionObservation", map[string]any{"condition_key": transition.Key})
		var k, state string
		var at time.Time
		var raw []byte
		if err := pool.QueryRow(ctx, q, args...).Scan(&k, &at, &state, &raw); err != nil {
			t.Fatal(err)
		}
		var got observations.AlertTransition
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, transition) {
			t.Fatal(got)
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		transition.Version = 3
		transition.State = "OPEN"
		q, args = ob03Query(t, "InsertConditionObservation", map[string]any{"transition": encode(transition)})
		if _, err := tx.Exec(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
		if err := tx.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM operational_observations WHERE key=$1`, "condition:"+transition.Key+":version:3").Scan(&n); err != nil || n != 0 {
			t.Fatalf("rollback count %d error %v", n, err)
		}
	})

	t.Run("fresh current token admission and persisted fact", func(t *testing.T) {
		jobID := "00000000-0000-0000-0000-000000000142"
		jobKey := "ob03:current-token-contrast"
		var claimedAt time.Time
		if err := pool.QueryRow(ctx, `INSERT INTO background_jobs(public_id,job_key,kind,state,lease_token,attempts,lease_expires_at,claimed_at,attempt_deadline_at)
            VALUES($1,$2,'gametime_fill','running',7,3,clock_timestamp()+interval '2 minutes',clock_timestamp(),clock_timestamp()+interval '10 minutes')
            RETURNING claimed_at`, jobID, jobKey).Scan(&claimedAt); err != nil {
			t.Fatal(err)
		}
		claimedAt = claimedAt.UTC()
		current := jobs.LifecycleFact{JobID: jobID, JobKey: jobKey, Kind: "gametime_fill", BuildID: "fixture", State: jobs.State("running"), StartedAt: &claimedAt, LeaseToken: 7, Attempt: 3, EventKind: jobs.LifecycleEventClaimed}
		observationKey := "job:" + jobID + ":token:7:event:CLAIMED"
		assertCount := func(want int) {
			t.Helper()
			var count int
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM operational_observations WHERE key=$1`, observationKey).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != want {
				t.Fatalf("fresh observation count %d, want %d", count, want)
			}
		}
		assertCount(0)
		wrong := current
		wrong.LeaseToken = 6
		if got := run("InsertLifecycleObservation", map[string]any{"fact": encode(wrong), "observed_at": claimedAt}); got != 0 {
			t.Fatalf("wrong token admitted %d fresh observations", got)
		}
		assertCount(0)
		if got := run("InsertLifecycleObservation", map[string]any{"fact": encode(current), "observed_at": claimedAt}); got != 1 {
			t.Fatalf("current token admitted %d observations, want 1", got)
		}
		assertCount(1)
		q, args := ob03Query(t, "GetOperationalObservation", map[string]any{"key": observationKey})
		var persistedKey, state string
		var observedAt time.Time
		var payload []byte
		if err := pool.QueryRow(ctx, q, args...).Scan(&persistedKey, &observedAt, &state, &payload); err != nil {
			t.Fatal(err)
		}
		var persisted jobs.LifecycleFact
		if err := json.Unmarshal(payload, &persisted); err != nil {
			t.Fatal(err)
		}
		if persistedKey != observationKey || state != "running" || !observedAt.Equal(claimedAt) || !reflect.DeepEqual(persisted, current) {
			t.Fatalf("persisted current fact mismatch key=%s state=%s at=%s fact=%#v", persistedKey, state, observedAt, persisted)
		}
	})
	t.Run("WORK-HEARTBEAT", func(t *testing.T) {
		ob03HeartbeatAcceptance(t, ctx, pool)
	})
}

type ob03HeartbeatSample struct {
	Key        string
	ObservedAt time.Time
	Inserted   bool
}

func ob03HeartbeatAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	writerSQL, writerArgs := ob03Query(t, "InsertWorkerHeartbeatSample", nil)
	readerSQL, readerArgs := ob03Query(t, "ReadWorkerHeartbeatStatus", nil)
	write := func(ctx context.Context, db jobs.SQLExecutor) (ob03HeartbeatSample, error) {
		var sample ob03HeartbeatSample
		err := db.QueryRow(ctx, writerSQL, writerArgs...).Scan(&sample.Key, &sample.ObservedAt, &sample.Inserted)
		sample.ObservedAt = sample.ObservedAt.UTC()
		return sample, err
	}
	read := func() observations.WorkerHeartbeatStatus {
		t.Helper()
		var status observations.WorkerHeartbeatStatus
		if err := pool.QueryRow(ctx, readerSQL, readerArgs...).Scan(&status.CheckedAt, &status.LastObservedAt); err != nil {
			t.Fatal(err)
		}
		status.CheckedAt = status.CheckedAt.UTC()
		if status.LastObservedAt != nil {
			v := status.LastObservedAt.UTC()
			status.LastObservedAt = &v
		}
		return status
	}
	dbNow := func() time.Time {
		t.Helper()
		var now time.Time
		if err := pool.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			t.Fatal(err)
		}
		return now.UTC()
	}
	keyAt := func(at time.Time) string {
		return "heartbeat:worker:" + at.UTC().Truncate(time.Minute).Format("2006-01-02T15:04:05Z")
	}
	clear := func() {
		t.Helper()
		if _, err := pool.Exec(ctx, "DELETE FROM operational_observations WHERE starts_with(key, 'heartbeat:')"); err != nil {
			t.Fatal(err)
		}
	}
	seed := func(key string, at time.Time, state, payload string) {
		t.Helper()
		if _, err := pool.Exec(ctx, `INSERT INTO operational_observations(key, observed_at, state, payload) VALUES($1,$2,$3,$4::jsonb)`, key, at, state, payload); err != nil {
			t.Fatal(err)
		}
	}
	const payload = `{"version":1,"kind":"worker_heartbeat"}`
	t.Run("one database clock and immutable minute duplicate", func(t *testing.T) {
		clear()
		before := dbNow()
		first, err := write(ctx, pool)
		if err != nil {
			t.Fatal(err)
		}
		after := dbNow()
		if !first.Inserted || first.Key != keyAt(first.ObservedAt) || first.ObservedAt.Before(before) || first.ObservedAt.After(after) {
			t.Fatal(before, first, after)
		}
		for attempt := 0; attempt < 4; attempt++ {
			next, err := write(ctx, pool)
			if err != nil {
				t.Fatal(err)
			}
			if next.Key != first.Key {
				if !next.Inserted {
					t.Fatal("new minute already occupied", next)
				}
				first = next
				continue
			}
			if next.Inserted {
				t.Fatal("duplicate created or overwrote a sample", next)
			}
			q, args := ob03Query(t, "GetOperationalObservation", map[string]any{"key": next.Key})
			var key, state string
			var observedAt time.Time
			var raw []byte
			if err := pool.QueryRow(ctx, q, args...).Scan(&key, &observedAt, &state, &raw); err != nil {
				t.Fatal(err)
			}
			var value map[string]any
			if err := json.Unmarshal(raw, &value); err != nil {
				t.Fatal(err)
			}
			if key != first.Key || !observedAt.Equal(first.ObservedAt) || state != "OBSERVED" || !reflect.DeepEqual(value, map[string]any{"version": float64(1), "kind": "worker_heartbeat"}) {
				t.Fatal("immutable sample changed", key, observedAt, state, string(raw))
			}
			if next.Key != keyAt(next.ObservedAt) || next.ObservedAt.Before(first.ObservedAt) {
				t.Fatal("attempt did not return its captured key/time", next, first)
			}
			return
		}
		t.Fatal("did not observe a same-minute duplicate in four immediate attempts")
	})
	t.Run("four exact minute candidates and actual CheckedAt", func(t *testing.T) {
		for _, age := range []int{0, 3, 4} {
			t.Run(fmt.Sprintf("M-minus-%d", age), func(t *testing.T) {
				for attempt := 0; attempt < 4; attempt++ {
					clear()
					anchor := dbNow()
					sampleAt := anchor.Truncate(time.Minute).Add(-time.Duration(age) * time.Minute)
					seed(keyAt(sampleAt), sampleAt, "OBSERVED", payload)
					got := read()
					after := dbNow()
					if got.CheckedAt.Before(anchor) || got.CheckedAt.After(after) {
						t.Fatal("CheckedAt did not come from this database statement", anchor, got, after)
					}
					if got.CheckedAt.Truncate(time.Minute) != anchor.Truncate(time.Minute) {
						continue
					}
					if age == 4 {
						if got.LastObservedAt != nil {
							t.Fatal("historical sample admitted", got)
						}
					} else if got.LastObservedAt == nil || !got.LastObservedAt.Equal(sampleAt) {
						t.Fatal("candidate minute omitted", age, got, sampleAt)
					}
					return
				}
				t.Fatal("four immediate reads crossed different database minutes")
			})
		}
		clear()
		before := dbNow()
		got := read()
		after := dbNow()
		if got.LastObservedAt != nil || got.CheckedAt.Before(before) || got.CheckedAt.After(after) {
			t.Fatal("absent samples manufactured health", before, got, after)
		}
	})
	t.Run("shape alignment future and unrelated namespaces", func(t *testing.T) {
		shapeChecked := false
		for attempt := 0; attempt < 4; attempt++ {
			clear()
			anchor := dbNow()
			minute := anchor.Truncate(time.Minute)
			seed(keyAt(minute), minute, "OPEN", payload)
			seed(keyAt(minute.Add(-time.Minute)), minute.Add(-time.Minute), "OBSERVED", `{"version":2,"kind":"worker_heartbeat"}`)
			seed(keyAt(minute.Add(-2*time.Minute)), minute.Add(-time.Minute), "OBSERVED", payload)
			seed(keyAt(minute.Add(-3*time.Minute)), minute.Add(-3*time.Minute), "OBSERVED", `{"version":1,"kind":"worker_heartbeat","replica":"extra"}`)
			seed("heartbeat:worker:malformed", anchor, "OBSERVED", payload)
			seed("heartbeat:workers:"+minute.Format(time.RFC3339), anchor, "OBSERVED", payload)
			got := read()
			if got.CheckedAt.Truncate(time.Minute) != minute {
				continue
			}
			if got.LastObservedAt != nil {
				t.Fatal("invalid shape/alignment/namespace admitted", got)
			}
			shapeChecked = true
			break
		}
		if !shapeChecked {
			t.Fatal("shape checks crossed four database minute boundaries")
		}
		for attempt := 0; attempt < 4; attempt++ {
			clear()
			anchor := dbNow()
			minute := anchor.Truncate(time.Minute)
			future := anchor.Add(minute.Add(time.Minute).Sub(anchor) / 2)
			seed(keyAt(minute), future, "OBSERVED", payload)
			seed(keyAt(minute.Add(time.Minute)), minute.Add(time.Minute), "OBSERVED", payload)
			got := read()
			if got.CheckedAt.Truncate(time.Minute) != minute || !future.After(got.CheckedAt) {
				continue
			}
			if got.LastObservedAt != nil {
				t.Fatal("future evidence admitted", got, future)
			}
			return
		}
		t.Fatal("could not place an actual same-minute future sample")
	})
	t.Run("latest valid candidate excludes future and probe rows", func(t *testing.T) {
		for attempt := 0; attempt < 4; attempt++ {
			clear()
			anchor := dbNow()
			minute := anchor.Truncate(time.Minute)
			for age := 1; age <= 3; age++ {
				at := minute.Add(-time.Duration(age) * time.Minute)
				seed(keyAt(at), at, "OBSERVED", payload)
			}
			future := anchor.Add(minute.Add(time.Minute).Sub(anchor) / 2)
			seed(keyAt(minute), future, "OBSERVED", payload)
			probeKey := "probe:heartbeat:" + minute.Format(time.RFC3339)
			if _, err := pool.Exec(ctx, `INSERT INTO operational_observations(key,observed_at,state,payload) VALUES($1,$2,'OBSERVED',$3::jsonb) ON CONFLICT(key) DO NOTHING`, probeKey, anchor, payload); err != nil {
				t.Fatal(err)
			}
			got := read()
			if got.CheckedAt.Truncate(time.Minute) != minute || !future.After(got.CheckedAt) {
				continue
			}
			want := minute.Add(-time.Minute)
			if got.LastObservedAt == nil || !got.LastObservedAt.Equal(want) {
				t.Fatal("latest valid candidate mismatch", got, want)
			}
			return
		}
		t.Fatal("could not observe a stable database minute")
	})
	type result struct {
		sample ob03HeartbeatSample
		err    error
	}
	waitLock := func(t *testing.T, pid uint32, done <-chan result) (result, bool) {
		t.Helper()
		timer := time.NewTimer(2 * time.Second)
		defer timer.Stop()
		ticker := time.NewTicker(5 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case r := <-done:
				return r, false
			case <-timer.C:
				t.Fatal("writer neither blocked on the actual unique key nor completed")
				return result{}, false
			case <-ticker.C:
				var blocked bool
				if err := pool.QueryRow(ctx, `SELECT coalesce(wait_event_type='Lock',false) FROM pg_stat_activity WHERE pid=$1`, pid).Scan(&blocked); err != nil {
					t.Fatal(err)
				}
				if blocked {
					return result{}, true
				}
			}
		}
	}
	t.Run("two replicas wait then preserve the first committed sample", func(t *testing.T) {
		for attempt := 0; attempt < 4; attempt++ {
			clear()
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			first, err := write(ctx, tx)
			if err != nil {
				_ = tx.Rollback(ctx)
				t.Fatal(err)
			}
			other, err := pool.Acquire(ctx)
			if err != nil {
				_ = tx.Rollback(ctx)
				t.Fatal(err)
			}
			done := make(chan result, 1)
			go func() { s, err := write(ctx, other); done <- result{s, err} }()
			completed, blocked := waitLock(t, other.Conn().PgConn().PID(), done)
			if !blocked {
				_ = tx.Rollback(ctx)
				other.Release()
				if completed.err != nil {
					t.Fatal(completed.err)
				}
				if completed.sample.Key == first.Key {
					t.Fatal("same-key writer bypassed the uncommitted winner", completed)
				}
				continue
			}
			if err := tx.Commit(ctx); err != nil {
				other.Release()
				t.Fatal(err)
			}
			select {
			case completed = <-done:
			case <-time.After(3 * time.Second):
				other.Release()
				t.Fatal("duplicate did not finish after winner committed")
			}
			other.Release()
			if completed.err != nil || completed.sample.Inserted || completed.sample.Key != first.Key {
				t.Fatal(first, completed)
			}
			q, args := ob03Query(t, "GetOperationalObservation", map[string]any{"key": completed.sample.Key})
			var key, state string
			var at time.Time
			var body []byte
			if err := pool.QueryRow(ctx, q, args...).Scan(&key, &at, &state, &body); err != nil {
				t.Fatal(err)
			}
			if !at.Equal(first.ObservedAt) || state != "OBSERVED" {
				t.Fatal("replica replaced first sample", first, key, at, state)
			}
			return
		}
		t.Fatal("replicas repeatedly started in different database minutes")
	})
	t.Run("blocked writer cancellation leaves no durable sample", func(t *testing.T) {
		for attempt := 0; attempt < 4; attempt++ {
			clear()
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			first, err := write(ctx, tx)
			if err != nil {
				_ = tx.Rollback(ctx)
				t.Fatal(err)
			}
			other, err := pool.Acquire(ctx)
			if err != nil {
				_ = tx.Rollback(ctx)
				t.Fatal(err)
			}
			otherPID := other.Conn().PgConn().PID()
			callCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			done := make(chan result, 1)
			go func() { s, err := write(callCtx, other); done <- result{s, err} }()
			completed, blocked := waitLock(t, other.Conn().PgConn().PID(), done)
			if !blocked {
				cancel()
				_ = tx.Rollback(ctx)
				other.Release()
				if completed.err != nil {
					t.Fatal(completed.err)
				}
				if completed.sample.Key == first.Key {
					t.Fatal("same-key writer did not block", completed)
				}
				continue
			}
			cancel()
			select {
			case completed = <-done:
			case <-time.After(3 * time.Second):
				_ = tx.Rollback(ctx)
				other.Release()
				t.Fatal("cancelled writer remained blocked")
			}
			other.Release()
			if completed.err == nil {
				_ = tx.Rollback(ctx)
				t.Fatal("cancelled writer returned success", completed.sample)
			}
			serverStopped := false
			for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); {
				var active bool
				if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active')`, otherPID).Scan(&active); err != nil {
					_ = tx.Rollback(ctx)
					t.Fatal(err)
				}
				if !active {
					serverStopped = true
					break
				}
				time.Sleep(5 * time.Millisecond)
			}
			if !serverStopped {
				_ = tx.Rollback(ctx)
				t.Fatal("cancelled PostgreSQL writer did not stop while the conflicting transaction remained locked")
			}
			if err := tx.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
			var count int
			if err := pool.QueryRow(ctx, "SELECT count(*) FROM operational_observations WHERE key=$1", first.Key).Scan(&count); err != nil || count != 0 {
				t.Fatal("cancelled/uncommitted sample persisted", count, err)
			}
			return
		}
		t.Fatal("cancellation replicas repeatedly crossed database minutes")
	})
	t.Run("populated real plan probes four unique keys", func(t *testing.T) {
		clear()
		if _, err := pool.Exec(ctx, `INSERT INTO operational_observations(key,observed_at,state,payload) SELECT 'probe:ob03-index:'||n,clock_timestamp(),'OBSERVED','{}'::jsonb FROM generate_series(1,20000) n`); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, "ANALYZE operational_observations"); err != nil {
			t.Fatal(err)
		}
		if _, err := write(ctx, pool); err != nil {
			t.Fatal(err)
		}
		var raw []byte
		if err := pool.QueryRow(ctx, "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+readerSQL, readerArgs...).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var documents []map[string]any
		if err := json.Unmarshal(raw, &documents); err != nil {
			t.Fatal(err)
		}
		indexed, candidates := false, false
		var visit func(any)
		visit = func(value any) {
			switch v := value.(type) {
			case []any:
				for _, child := range v {
					visit(child)
				}
			case map[string]any:
				if v["Relation Name"] == "operational_observations" {
					kind, _ := v["Node Type"].(string)
					index, _ := v["Index Name"].(string)
					loops, _ := v["Actual Loops"].(float64)
					rows, _ := v["Actual Rows"].(float64)
					if (kind != "Index Scan" && kind != "Index Only Scan") || !strings.Contains(index, "key") || loops != 4 || rows > 1 {
						t.Fatalf("unbounded/nonindexed observation read %#v", v)
					}
					indexed = true
				}
				if v["CTE Name"] == "candidates" && v["Actual Rows"] == float64(4) {
					candidates = true
				}
				for _, child := range v {
					visit(child)
				}
			}
		}
		for _, doc := range documents {
			visit(doc)
		}
		if !indexed || !candidates {
			t.Fatalf("missing four-candidate unique-index plan %s", raw)
		}
		t.Logf("populated four-key PostgreSQL plan %s", raw)
	})
}
