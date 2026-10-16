//go:build integration

package worker

import (
	"context"
	"errors"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestExecutionGateNativePartial(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("gate fixture rejects external DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	server, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("gate"), postgres.WithUsername("gate"), postgres.WithPassword("synthetic-gate-fixture"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if server != nil {
		t.Cleanup(func() {
			cleanup, done := context.WithTimeout(context.Background(), 20*time.Second)
			defer done()
			if err := server.Terminate(cleanup); err != nil {
				t.Errorf("terminate owned gate PostgreSQL: %v", err)
			}
		})
	}
	if err != nil {
		t.Fatal(err)
	}
	dsn, err := server.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	newPool := func() *pgxpool.Pool {
		t.Helper()
		config, err := pgxpool.ParseConfig(dsn)
		if err != nil {
			t.Fatal(err)
		}
		config.MaxConns = 1
		pool, err := pgxpool.NewWithConfig(ctx, config)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(pool.Close)
		if err := pool.Ping(ctx); err != nil {
			t.Fatal(err)
		}
		return pool
	}
	pool, other, control := newPool(), newPool(), newPool()
	clock := product.Clock(func() time.Time { return time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC) })
	gate, err := NewExecutionGate(pool, clock)
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewExecutionGate(other, clock)
	if err != nil {
		t.Fatal(err)
	}
	receipt := jobs.Receipt{ID: "receipt-one", Token: "1"}

	assertClean := func(t *testing.T) {
		t.Helper()
		check, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		var count int
		for {
			if err := control.QueryRow(check, "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())").Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count == 0 {
				break
			}
			if check.Err() != nil {
				t.Fatalf("owned database retains %d advisory locks", count)
			}
			time.Sleep(10 * time.Millisecond)
		}
		if err := pool.Ping(check); err != nil {
			t.Fatalf("pool unusable after cleanup: %v", err)
		}
		if pool.Stat().AcquiredConns() != 0 {
			t.Fatal("gate retained borrowed pool connection")
		}
	}
	t.Run("constructor and canonical lock namespace", func(t *testing.T) {
		if _, err := NewExecutionGate(nil, clock); err == nil {
			t.Fatal("nil pool accepted")
		}
		if _, err := NewExecutionGate(pool, nil); err == nil {
			t.Fatal("nil clock accepted")
		}
		if gate.Pool != pool || gate.Clock() != clock() {
			t.Fatal("constructor lost dependencies")
		}
		for kind, want := range map[string]int64{"gametime_fill": -8771629260875047356, "reconcile_dry_run": 3947569968103470284} {
			if got := maintenanceLockID(kind); got != want {
				t.Fatalf("%s lock ID = %d, want %d", kind, got, want)
			}
		}
	})
	t.Run("same connection receipt and independent kinds", func(t *testing.T) {
		var pointer *pgxpool.Conn
		var expected uint32
		if err := pool.QueryRow(context.Background(), "SELECT pg_backend_pid()").Scan(&expected); err != nil {
			t.Fatal(err)
		}
		var pid uint32
		acquired, err := gate.Do(context.Background(), "gametime_fill", receipt, func(ctx context.Context, scope jobs.ExecutionScope) error {
			pointer, pid = scope.Connection, scope.Connection.Conn().PgConn().PID()
			if scope.Receipt != receipt {
				t.Fatal("receipt changed")
			}
			var actual uint32
			if err := scope.Connection.QueryRow(ctx, "SELECT pg_backend_pid()").Scan(&actual); err != nil {
				return err
			}
			if actual != pid || pid != expected {
				t.Fatal("borrowed connection changed backend")
			}
			if scope.Connection != pointer || pool.Stat().AcquiredConns() != 1 {
				t.Fatal("callback did not borrow exact acquired connection")
			}
			ran := false
			busy, err := second.Do(ctx, "gametime_fill", jobs.Receipt{ID: "another", Token: "88"}, func(context.Context, jobs.ExecutionScope) error { ran = true; return nil })
			if busy || err != nil || ran {
				t.Fatalf("same kind bypassed exclusion: %v %v callback=%v", busy, err, ran)
			}
			different, err := second.Do(ctx, "reconcile_dry_run", receipt, func(context.Context, jobs.ExecutionScope) error { ran = true; return nil })
			if !different || err != nil || !ran {
				t.Fatalf("different kind excluded: %v %v callback=%v", different, err, ran)
			}
			return nil
		})
		if !acquired || err != nil || pointer == nil || pid == 0 {
			t.Fatalf("acquisition failed: %v %v", acquired, err)
		}
		assertClean(t)
		again, err := second.Do(context.Background(), "gametime_fill", receipt, func(context.Context, jobs.ExecutionScope) error { return nil })
		if !again || err != nil {
			t.Fatalf("kind remains locked: %v %v", again, err)
		}
	})
	t.Run("callback error identity and panic cleanup", func(t *testing.T) {
		sentinel := errors.New("callback sentinel")
		acquired, err := gate.Do(context.Background(), "gametime_fill", receipt, func(context.Context, jobs.ExecutionScope) error { return sentinel })
		if !acquired || err != sentinel {
			t.Fatalf("callback error identity lost: %v %v", acquired, err)
		}
		assertClean(t)
		panicValue := new(int)
		func() {
			defer func() {
				if recovered := recover(); recovered != panicValue {
					t.Fatalf("panic changed: %v", recovered)
				}
			}()
			_, _ = gate.Do(context.Background(), "gametime_fill", receipt, func(context.Context, jobs.ExecutionScope) error { panic(panicValue) })
			t.Error("panic swallowed")
		}()
		assertClean(t)
	})
	t.Run("cancel before acquire and while pool blocked", func(t *testing.T) {
		cancelled, stop := context.WithCancel(context.Background())
		stop()
		called := false
		acquired, err := gate.Do(cancelled, "gametime_fill", receipt, func(context.Context, jobs.ExecutionScope) error { called = true; return nil })
		if acquired || !errors.Is(err, context.Canceled) || called {
			t.Fatalf("preacquire cancellation lost: %v %v", acquired, err)
		}
		held, err := pool.Acquire(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		defer held.Release()
		blocked, done := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer done()
		acquired, err = gate.Do(blocked, "gametime_fill", receipt, func(context.Context, jobs.ExecutionScope) error { called = true; return nil })
		if acquired || !errors.Is(err, context.DeadlineExceeded) || called {
			t.Fatalf("blocked acquisition cancellation lost: %v %v", acquired, err)
		}
	})
	t.Run("pool acquisition consumes callback budget", func(t *testing.T) {
		held, err := pool.Acquire(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		release := time.AfterFunc(120*time.Millisecond, held.Release)
		defer release.Stop()
		parent, done := context.WithTimeout(context.Background(), 400*time.Millisecond)
		defer done()
		deadline, _ := parent.Deadline()
		acquired, err := gate.Do(parent, "gametime_fill", receipt, func(ctx context.Context, scope jobs.ExecutionScope) error {
			actual, ok := ctx.Deadline()
			if !ok || !actual.Equal(deadline) || time.Until(actual) > 350*time.Millisecond {
				t.Errorf("budget restarted after pool acquisition: %v", actual)
			}
			return nil
		})
		if !acquired || err != nil {
			t.Fatalf("delayed acquire: %v %v", acquired, err)
		}
		assertClean(t)
	})
	t.Run("cancel joins real server work and discards closed connection", func(t *testing.T) {
		parent, done := context.WithTimeout(context.Background(), 250*time.Millisecond)
		defer done()
		var pid uint32
		returned := false
		acquired, err := gate.Do(parent, "gametime_fill", receipt, func(ctx context.Context, scope jobs.ExecutionScope) error {
			pid = scope.Connection.Conn().PgConn().PID()
			_, err := scope.Connection.Exec(ctx, "SELECT pg_sleep(60)")
			returned = true
			return err
		})
		if !acquired || err == nil || !returned {
			t.Fatalf("did not join cancelled callback: %v %v returned=%v", acquired, err, returned)
		}
		assertClean(t)
		check, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for {
			var exists bool
			if err := control.QueryRow(check, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1)", pid).Scan(&exists); err != nil {
				t.Fatal(err)
			}
			if !exists {
				break
			}
			if check.Err() != nil {
				t.Fatal("cancelled backend survived")
			}
			time.Sleep(10 * time.Millisecond)
		}
	})
	t.Run("uncertain unlock discards session", func(t *testing.T) {
		var pid uint32
		acquired, err := gate.Do(context.Background(), "gametime_fill", receipt, func(ctx context.Context, scope jobs.ExecutionScope) error {
			pid = scope.Connection.Conn().PgConn().PID()
			var unlocked bool
			return scope.Connection.QueryRow(ctx, "SELECT pg_advisory_unlock($1)", maintenanceLockID("gametime_fill")).Scan(&unlocked)
		})
		if !acquired || err == nil {
			t.Fatalf("unconfirmed cleanup accepted: %v %v", acquired, err)
		}
		assertClean(t)
		check, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		var current uint32
		if err := pool.QueryRow(check, "SELECT pg_backend_pid()").Scan(&current); err != nil {
			t.Fatal(err)
		}
		if current == pid {
			t.Fatal("uncertain session returned reusable to pool")
		}
	})
	t.Run("real thirty second bound ignores business clock", func(t *testing.T) {
		var calls atomic.Int32
		gate.Clock = func() time.Time { calls.Add(1); return time.Now().Add(500 * time.Hour) }
		held, err := pool.Acquire(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		release := time.AfterFunc(150*time.Millisecond, held.Release)
		defer release.Stop()
		started := time.Now()
		var callbackDone bool
		acquired, err := gate.Do(context.Background(), "gametime_fill", receipt, func(ctx context.Context, scope jobs.ExecutionScope) error {
			deadline, ok := ctx.Deadline()
			if !ok || deadline.Sub(started) > 30*time.Second+10*time.Millisecond || deadline.Sub(started) < 29*time.Second {
				t.Fatalf("unexpected real budget: %v", deadline.Sub(started))
			}
			_, err := scope.Connection.Exec(ctx, "SELECT pg_sleep(60)")
			callbackDone = true
			return err
		})
		elapsed := time.Since(started)
		if !acquired || err == nil || !callbackDone || elapsed < 29*time.Second || elapsed > 34*time.Second {
			t.Fatalf("actual budget/join failed: %v %v done=%v elapsed=%v", acquired, err, callbackDone, elapsed)
		}
		if calls.Load() != 0 {
			t.Fatal("business clock was used as budget authority")
		}
		assertClean(t)
	})
}
