//go:build integration

package worker_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		code = 1
	}
	os.Exit(code)
}

func TestMaintenanceTimeNativeProcessOnePoolOneAndSafeFailures(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	config, err := pgxpool.ParseConfig(f.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	config.MaxConns = 1
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	clock := product.Clock(func() time.Time { return time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC) })
	gate, _ := worker.NewExecutionGate(pool, clock)
	writer, _ := spatial.NewTimeFillWriter(clock, db.NewConnectionRunner())
	store := jobs.NewPostgresStore(pool)
	handler, err := worker.NewMaintenanceHandler(store, gate, writer, clock)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO time_anchors(public_id,real_utc,epoch_day,rate) VALUES($1,'2026-10-01T00:00:00Z',100,1);`, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO game_time_map(real_date,game_day) VALUES('2026-10-13',112)`); err != nil {
		t.Fatal(err)
	}
	process := func(kind, wantState, wantCode string) {
		t.Helper()
		key := uuid.NewString()
		if err := store.Enqueue(ctx, jobs.Job{Key: key, Kind: kind, Lane: worker.LaneMaintenance}); err != nil {
			t.Fatal(err)
		}
		if ok, err := handler.ProcessOne(ctx); err != nil || !ok {
			t.Fatalf("kind=%s processed=%v error=%v", kind, ok, err)
		}
		var state, code, safe string
		wantSafe := ""
		if wantState == "repair_required" {
			wantSafe = wantCode
		}
		if err := f.Pool.QueryRow(ctx, `SELECT state,COALESCE(error_message,''),COALESCE(safe_error_code,'') FROM background_jobs WHERE job_key=$1`, key).Scan(&state, &code, &safe); err != nil || state != wantState || code != wantCode || safe != wantSafe {
			t.Fatalf("kind=%s state=%s code=%s safe=%s error=%v", kind, state, code, safe, err)
		}
		if pool.Stat().AcquiredConns() != 0 {
			t.Fatal("maintenance retained borrowed connection")
		}
	}
	process("gametime_fill", "succeeded", "")
	var first, last, past, count int32
	if err := f.Pool.QueryRow(ctx, `SELECT (SELECT game_day FROM game_time_map WHERE real_date='2026-10-14'),(SELECT game_day FROM game_time_map WHERE real_date='2026-11-12'),(SELECT game_day FROM game_time_map WHERE real_date='2026-10-13'),(SELECT count(*) FROM game_time_map WHERE real_date>='2026-10-14')`).Scan(&first, &last, &past, &count); err != nil || first != 113 || last != 142 || past != 112 || count != 30 {
		t.Fatalf("projected=%d/%d past=%d count=%d error=%v", first, last, past, count, err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE time_anchors SET epoch_day=0,rate=0`); err != nil {
		t.Fatal(err)
	}
	process("gametime_fill", "succeeded", "")
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM game_time_map WHERE real_date>='2026-10-14' AND game_day=0`).Scan(&count); err != nil || count != 30 {
		t.Fatalf("paused zero rows=%d error=%v", count, err)
	}
	process("reconcile_dry_run", "succeeded", "")
	if _, err := f.Pool.Exec(ctx, `DELETE FROM time_anchors`); err != nil {
		t.Fatal(err)
	}
	process("gametime_fill", "repair_required", worker.TimeAnchorUncoveredCode)
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM game_time_map WHERE real_date>='2026-10-14' AND game_day=0`).Scan(&count); err != nil || count != 30 {
		t.Fatalf("missing trajectory rewrote zero rows=%d error=%v", count, err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO time_anchors(public_id,real_utc,epoch_day,rate) VALUES($1,'2026-10-01T00:00:00Z',100,1);`, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	process("gametime_fill", "succeeded", "")
	if err := f.Pool.QueryRow(ctx, `SELECT (SELECT game_day FROM game_time_map WHERE real_date='2026-10-14'),(SELECT game_day FROM game_time_map WHERE real_date='2026-11-12'),(SELECT count(*) FROM game_time_map WHERE real_date>='2026-10-14' AND game_day<>0)`).Scan(&first, &last, &count); err != nil || first != 113 || last != 142 || count != 30 {
		t.Fatalf("resumed projection=%d/%d count=%d error=%v", first, last, count, err)
	}
}

func TestMaintenanceTimeNativeBusyDistinctJobsAndSQLSafeCode(t *testing.T) {
	for _, busy := range []bool{false, true} {
		t.Run(map[bool]string{false: "SQL failure", true: "two jobs same kind"}[busy], func(t *testing.T) {
			f := dbtest.NewProductFixture(t)
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			newPool := func() *pgxpool.Pool {
				t.Helper()
				cfg, err := pgxpool.ParseConfig(f.DatabaseURL)
				if err != nil {
					t.Fatal(err)
				}
				cfg.MaxConns = 1
				pool, err := pgxpool.NewWithConfig(ctx, cfg)
				if err != nil {
					t.Fatal(err)
				}
				t.Cleanup(pool.Close)
				return pool
			}
			pool := newPool()
			clock := product.Clock(func() time.Time { return time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC) })
			gate, _ := worker.NewExecutionGate(pool, clock)
			writer, _ := spatial.NewTimeFillWriter(clock, db.NewConnectionRunner())
			store := jobs.NewPostgresStore(pool)
			handler, _ := worker.NewMaintenanceHandler(store, gate, writer, clock)
			if _, err := f.Pool.Exec(ctx, `INSERT INTO time_anchors(public_id,real_utc,epoch_day,rate) VALUES($1,'2026-10-01T00:00:00Z',100,1)`, uuid.NewString()); err != nil {
				t.Fatal(err)
			}
			wantCode := "JOB_EXECUTION_FAILED"
			var resume chan struct{}
			var finished chan error
			if busy {
				wantCode = "JOB_BUSY"
				control := jobs.NewPostgresStore(f.Pool.Pool)
				if err := control.Enqueue(ctx, jobs.Job{Key: uuid.NewString(), Kind: "gametime_fill", Lane: worker.LaneMaintenance}); err != nil {
					t.Fatal(err)
				}
				first, err := control.ClaimOne(ctx, worker.LaneMaintenance)
				if err != nil {
					t.Fatal(err)
				}
				holding, _ := worker.NewExecutionGate(newPool(), clock)
				entered := make(chan struct{})
				resume = make(chan struct{})
				finished = make(chan error, 1)
				go func() {
					_, err := holding.Do(ctx, "gametime_fill", first.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
						close(entered)
						select {
						case <-resume:
						case <-ctx.Done():
							return ctx.Err()
						}
						_, err := writer.FillFuture(ctx, scope, "2026-10-14", 30)
						return err
					})
					if err == nil {
						err = control.Succeed(ctx, first.Receipt())
					}
					finished <- err
				}()
				<-entered
			} else {
				if _, err := f.Pool.Exec(ctx, `CREATE FUNCTION worker_time_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SQL_PRIVATE_SENTINEL'; END $$; CREATE TRIGGER worker_time_fail BEFORE INSERT ON game_time_map FOR EACH ROW EXECUTE FUNCTION worker_time_fail()`); err != nil {
					t.Fatal(err)
				}
			}
			key := uuid.NewString()
			if err := store.Enqueue(ctx, jobs.Job{Key: key, Kind: "gametime_fill", Lane: worker.LaneMaintenance}); err != nil {
				t.Fatal(err)
			}
			if ok, err := handler.ProcessOne(ctx); err != nil || !ok {
				t.Fatalf("processed=%v error=%v", ok, err)
			}
			var state, code string
			var delay float64
			if err := f.Pool.QueryRow(ctx, `SELECT state,error_message,extract(epoch FROM next_run_at-updated_at)::float8 FROM background_jobs WHERE job_key=$1`, key).Scan(&state, &code, &delay); err != nil || state != "retry_wait" || code != wantCode || busy && delay != 1 {
				t.Fatalf("state=%s code=%s delay=%v error=%v", state, code, delay, err)
			}
			var count int
			if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM game_time_map`).Scan(&count); err != nil || count != 0 {
				t.Fatalf("busy/failed worker committed%d effects error=%v", count, err)
			}
			if busy {
				close(resume)
				if err := <-finished; err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}
