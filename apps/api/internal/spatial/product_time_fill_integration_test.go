//go:build integration

package spatial

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

type nativeTimeFillFixture struct {
	DB      *dbtest.ProductFixture
	Context context.Context
	Store   *jobs.PostgresStore
	Writer  *TimeFillWriter
	Clock   func() time.Time
}

func timeFillFixture(t *testing.T) nativeTimeFillFixture {
	t.Helper()
	f := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	clock := func() time.Time { return time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC) }
	writer, err := NewTimeFillWriter(clock, db.NewConnectionRunner())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO time_anchors(public_id,real_utc,epoch_day,rate) VALUES($1,'2026-10-01T00:00:00Z',100,1)`, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO game_time_map(real_date,game_day) VALUES('2026-10-13',112)`); err != nil {
		t.Fatal(err)
	}
	return nativeTimeFillFixture{f, ctx, jobs.NewPostgresStore(f.Pool.Pool), writer, clock}
}

func (f nativeTimeFillFixture) gate(t *testing.T) (*worker.AdvisoryExecutionGate, *pgxpool.Pool) {
	t.Helper()
	config, err := pgxpool.ParseConfig(f.DB.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	config.MaxConns = 1
	pool, err := pgxpool.NewWithConfig(f.Context, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(f.Context); err != nil {
		t.Fatal(err)
	}
	gate, err := worker.NewExecutionGate(pool, f.Clock)
	if err != nil {
		t.Fatal(err)
	}
	return gate, pool
}

func (f nativeTimeFillFixture) claim(t *testing.T, kind string) jobs.Job {
	t.Helper()
	if err := f.Store.Enqueue(f.Context, jobs.Job{Key: uuid.NewString(), Kind: kind, Lane: "maintenance"}); err != nil {
		t.Fatal(err)
	}
	job, err := f.Store.ClaimOne(f.Context, "maintenance")
	if err != nil || job.ID == "" {
		t.Fatalf("claim=%+v error=%v", job, err)
	}
	return job
}

func (f nativeTimeFillFixture) projected(t *testing.T) int {
	t.Helper()
	var count int
	if err := f.DB.Pool.QueryRow(f.Context, `SELECT count(*) FROM game_time_map WHERE real_date>='2026-10-14'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestTimeFillNativeBorrowedPoolOneProjectionAndRanges(t *testing.T) {
	f := timeFillFixture(t)
	gate, pool := f.gate(t)
	job := f.claim(t, "gametime_fill")
	for _, want := range []int32{30, 0} {
		var changed int32
		ok, err := gate.Do(f.Context, "gametime_fill", job.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
			if pool.Stat().AcquiredConns() != 1 {
				return errors.New("gate did not borrow one connection")
			}
			var err error
			changed, err = f.Writer.FillFuture(ctx, scope, "2026-10-14", 30)
			return err
		})
		if err != nil || !ok || changed != want || pool.Stat().AcquiredConns() != 0 {
			t.Fatalf("gate=%v count=%d error=%v", ok, changed, err)
		}
	}
	timeDay(t, f.DB, f.Context, "2026-10-13", 112)
	timeDay(t, f.DB, f.Context, "2026-10-14", 113)
	timeDay(t, f.DB, f.Context, "2026-11-12", 142)
	if err := f.Store.Succeed(f.Context, job.Receipt()); err != nil {
		t.Fatal(err)
	}
	t.Run("past intersection and future range", func(t *testing.T) {
		f := timeFillFixture(t)
		gate, _ := f.gate(t)
		job := f.claim(t, "gametime_fill")
		for _, test := range []struct {
			from string
			days int32
			want int32
		}{{"2026-10-01", 2, 0}, {"2026-10-13", 2, 1}, {"2026-10-15", 2, 2}} {
			var changed int32
			_, err := gate.Do(f.Context, "gametime_fill", job.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
				var err error
				changed, err = f.Writer.FillFuture(ctx, scope, product.Date(test.from), test.days)
				return err
			})
			if err != nil || changed != test.want {
				t.Fatalf("range=%+v changed=%d error=%v", test, changed, err)
			}
		}
		timeDay(t, f.DB, f.Context, "2026-10-13", 112)
	})
}

func TestTimeFillNativeCrossKindAndMissingAnchorFailClosed(t *testing.T) {
	for _, kind := range []string{"reconcile_dry_run", "gametime_fill"} {
		t.Run(kind, func(t *testing.T) {
			f := timeFillFixture(t)
			gate, _ := f.gate(t)
			job := f.claim(t, kind)
			want := apierr.Conflict
			if kind == "gametime_fill" {
				want = apierr.Invalid
				if _, err := f.DB.Pool.Exec(f.Context, `DELETE FROM time_anchors`); err != nil {
					t.Fatal(err)
				}
			}
			var changed int32
			_, err := gate.Do(f.Context, "gametime_fill", job.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
				var err error
				changed, err = f.Writer.FillFuture(ctx, scope, "2026-10-14", 30)
				return err
			})
			pointcrawlCode(t, err, want)
			if changed != 0 || f.projected(t) != 0 {
				t.Fatal("invalid receipt/trajectory committed effects")
			}
		})
	}
}

func TestTimeFillNativeStaleReceiptAndSameKindExclusion(t *testing.T) {
	f := timeFillFixture(t)
	first, _ := f.gate(t)
	second, _ := f.gate(t)
	job := f.claim(t, "gametime_fill")
	entered, resume := make(chan struct{}), make(chan struct{})
	result := make(chan error, 1)
	var active atomic.Int32
	go func() {
		_, err := first.Do(f.Context, "gametime_fill", job.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
			active.Add(1)
			defer active.Add(-1)
			close(entered)
			select {
			case <-resume:
			case <-ctx.Done():
				return ctx.Err()
			}
			_, err := f.Writer.FillFuture(ctx, scope, "2026-10-14", 30)
			return err
		})
		result <- err
	}()
	<-entered
	if _, err := f.DB.Pool.Exec(f.Context, `UPDATE background_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1::bigint`, job.ID); err != nil {
		t.Fatal(err)
	}
	reclaimed, err := f.Store.ClaimOne(f.Context, "maintenance")
	if err != nil || reclaimed.ID != job.ID || reclaimed.Token != job.Token+1 {
		t.Fatalf("reclaim=%+v error=%v", reclaimed, err)
	}
	called := false
	acquired, err := second.Do(f.Context, "gametime_fill", reclaimed.Receipt(), func(context.Context, jobs.ExecutionScope) error { called = true; return nil })
	if err != nil || acquired || called || active.Load() != 1 {
		t.Fatalf("samekind overlap acquired=%v callback=%v active=%d error=%v", acquired, called, active.Load(), err)
	}
	if err := f.Store.Retry(f.Context, reclaimed.Receipt(), time.Second, "JOB_BUSY"); err != nil {
		t.Fatal(err)
	}
	close(resume)
	if err := <-result; !errors.Is(err, jobs.ErrLease) {
		t.Fatalf("stale receipt error=%v", err)
	}
	if f.projected(t) != 0 {
		t.Fatal("superseded receipt wrote map")
	}
	if err := f.Store.Succeed(f.Context, job.Receipt()); !errors.Is(err, jobs.ErrLease) {
		t.Fatalf("stale finish=%v", err)
	}
	time.Sleep(1050 * time.Millisecond)
	current, err := f.Store.ClaimOne(f.Context, "maintenance")
	if err != nil || current.Token != job.Token+2 || current.Attempts != 3 {
		t.Fatalf("newclaim=%+v error=%v", current, err)
	}
	_, err = second.Do(f.Context, "gametime_fill", current.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
		changed, err := f.Writer.FillFuture(ctx, scope, "2026-10-14", 30)
		if err == nil && changed != 30 {
			return errors.New("current receipt did not insert30 rows")
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Store.Succeed(f.Context, current.Receipt()); err != nil {
		t.Fatal(err)
	}
}

func TestTimeFillNativeExpiryDuringEffectAndMapFailureRollBack(t *testing.T) {
	for _, expiry := range []bool{false, true} {
		t.Run(map[bool]string{false: "map failure", true: "deadline during effect"}[expiry], func(t *testing.T) {
			f := timeFillFixture(t)
			gate, _ := f.gate(t)
			job := f.claim(t, "gametime_fill")
			if expiry {
				if _, err := f.DB.Pool.Exec(f.Context, `CREATE SEQUENCE time_effect_probe; CREATE FUNCTION test_time_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('time_effect_probe'); PERFORM pg_sleep(1); RETURN NEW; END $$; CREATE TRIGGER test_time_effect BEFORE INSERT ON game_time_map FOR EACH ROW EXECUTE FUNCTION test_time_effect()`); err != nil {
					t.Fatal(err)
				}
				if _, err := f.DB.Pool.Exec(f.Context, `UPDATE background_jobs SET lease_expires_at=clock_timestamp()+interval '750 milliseconds' WHERE id=$1::bigint`, job.ID); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := f.DB.Pool.Exec(f.Context, `CREATE FUNCTION test_time_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SQL_PRIVATE_SENTINEL'; END $$; CREATE TRIGGER test_time_effect BEFORE INSERT ON game_time_map FOR EACH ROW EXECUTE FUNCTION test_time_effect()`); err != nil {
					t.Fatal(err)
				}
			}
			var changed int32
			_, err := gate.Do(f.Context, "gametime_fill", job.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
				var err error
				changed, err = f.Writer.FillFuture(ctx, scope, "2026-10-14", 1)
				return err
			})
			if err == nil || changed != 0 || f.projected(t) != 0 {
				t.Fatalf("changed=%d map=%d error=%v", changed, f.projected(t), err)
			}
			if expiry {
				if !errors.Is(err, jobs.ErrLease) {
					t.Fatalf("expiry error=%v", err)
				}
				var called bool
				if err := f.DB.Pool.QueryRow(f.Context, `SELECT is_called FROM time_effect_probe`).Scan(&called); err != nil || !called {
					t.Fatalf("effect was never attempted before finalfence: %v", err)
				}
			}
		})
	}
}
