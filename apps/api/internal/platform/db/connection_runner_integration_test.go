//go:build integration

package db

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestPhase3TaskDB01Acceptance(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	before, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("container identities before: %s", strings.TrimSpace(string(before)))
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("db01"), postgres.WithUsername("db01"), postgres.WithPassword("synthetic-db01"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned PostgreSQL container %s", container.GetContainerID())
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if err := container.Terminate(cleanup); err != nil {
			t.Errorf("terminate owned PostgreSQL: %v", err)
			return
		}
		after, err := exec.CommandContext(cleanup, "docker", "ps", "-aq", "--no-trunc").Output()
		if err != nil {
			t.Error(err)
			return
		}
		t.Logf("container identities after owned cleanup: %s", strings.TrimSpace(string(after)))
		ids := map[string]bool{}
		for _, id := range strings.Fields(string(after)) {
			ids[id] = true
		}
		for _, id := range strings.Fields(string(before)) {
			if !ids[id] {
				t.Errorf("preexisting container missing %s", id)
			}
		}
		if ids[container.GetContainerID()] {
			t.Error("owned PostgreSQL remains")
		}
	})
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	newPool := func(t *testing.T) *Pool {
		t.Helper()
		config, err := pgxpool.ParseConfig(dsn)
		if err != nil {
			t.Fatal(err)
		}
		config.MaxConns = 1
		config.MinConns = 0
		pool, err := pgxpool.NewWithConfig(ctx, config)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(pool.Close)
		return &Pool{Pool: pool}
	}
	pool, observer := newPool(t), newPool(t)
	mustExec := func(t *testing.T, q string, args ...any) {
		t.Helper()
		if _, err := observer.Exec(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec(t, "CREATE TABLE runner_effects (id int PRIMARY KEY DEFERRABLE INITIALLY DEFERRED, pid int NOT NULL, tx bigint NOT NULL)")
	count := func(t *testing.T, id int) int {
		t.Helper()
		var n int
		if err := observer.QueryRow(ctx, "SELECT count(*) FROM runner_effects WHERE id=$1", id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	insert := func(tx pgx.Tx, id int) error {
		_, err := tx.Exec(ctx, "INSERT INTO runner_effects VALUES ($1,pg_backend_pid(),txid_current())", id)
		return err
	}
	sentinel := errors.New("callback sentinel")
	runner := NewConnectionRunner()
	t.Run("nil-boundaries", func(t *testing.T) {
		if err := runner.Run(ctx, nil, func(pgx.Tx) error { t.Fatal("callback invoked"); return nil }); err == nil {
			t.Fatal("nil connection admitted")
		}
		if _, err := NewProductRunner[pgx.Tx](nil, func(tx pgx.Tx) (pgx.Tx, error) { return tx, nil }); err == nil {
			t.Fatal("nil pool admitted")
		}
		if _, err := NewProductRunner[pgx.Tx](&Pool{}, func(tx pgx.Tx) (pgx.Tx, error) { return tx, nil }); err == nil {
			t.Fatal("nil embedded pool admitted")
		}
		if _, err := NewProductRunner[pgx.Tx](pool, nil); err == nil {
			t.Fatal("nil binder admitted")
		}
	})
	t.Run("borrowed-single-connection-commit-rollback-lock", func(t *testing.T) {
		conn, err := pool.Acquire(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Release()
		pid := conn.Conn().PgConn().PID()
		if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock(8123041)"); err != nil {
			t.Fatal(err)
		}
		defer conn.Exec(ctx, "SELECT pg_advisory_unlock(8123041)") //nolint:errcheck
		assertOwned := func(t *testing.T) {
			t.Helper()
			if pool.Stat().AcquiredConns() != 1 {
				t.Fatalf("borrowed connection released: %d", pool.Stat().AcquiredConns())
			}
			if conn.Conn().PgConn().PID() != pid {
				t.Fatal("connection changed")
			}
			var free bool
			if err := observer.QueryRow(ctx, "SELECT pg_try_advisory_lock(8123041)").Scan(&free); err != nil {
				t.Fatal(err)
			}
			if free {
				mustExec(t, "SELECT pg_advisory_unlock(8123041)")
				t.Fatal("borrower's session lock lost")
			}
		}
		if err := runner.Run(ctx, conn, nil); err == nil {
			t.Fatal("nil callback admitted")
		}
		assertOwned(t)
		var completed pgx.Tx
		short, stop := context.WithTimeout(ctx, 3*time.Second)
		defer stop()
		if err := runner.Run(short, conn, func(tx pgx.Tx) error {
			completed = tx
			if tx.Conn() != conn.Conn() {
				t.Fatal("different borrowed connection")
			}
			var actual uint32
			if err := tx.QueryRow(ctx, "SELECT pg_backend_pid()").Scan(&actual); err != nil {
				return err
			}
			if actual != pid {
				t.Fatalf("backend %d want %d", actual, pid)
			}
			assertOwned(t)
			return insert(tx, 1)
		}); err != nil {
			t.Fatal(err)
		}
		assertOwned(t)
		if completed.Conn().PgConn().TxStatus() != 'I' {
			t.Fatal("transaction left open")
		}
		if _, err := completed.Exec(ctx, "SELECT 1"); !errors.Is(err, pgx.ErrTxClosed) {
			t.Fatalf("transaction remains usable: %v", err)
		}
		if count(t, 1) != 1 {
			t.Fatal("commit did not persist exactly one effect")
		}
		if err := runner.Run(ctx, conn, func(tx pgx.Tx) error {
			if err := insert(tx, 2); err != nil {
				return err
			}
			return sentinel
		}); !errors.Is(err, sentinel) {
			t.Fatalf("callback error replaced: %v", err)
		}
		if count(t, 2) != 0 {
			t.Fatal("failed callback committed")
		}
		assertOwned(t)
		panicValue := &struct{ reason string }{"borrowed panic"}
		func() {
			defer func() {
				if got := recover(); got != panicValue {
					t.Errorf("panic changed: %#v", got)
				}
			}()
			_ = runner.Run(ctx, conn, func(tx pgx.Tx) error {
				if err := insert(tx, 3); err != nil {
					t.Fatal(err)
				}
				panic(panicValue)
			})
		}()
		if count(t, 3) != 0 {
			t.Fatal("panic committed")
		}
		assertOwned(t)
		cancelled, cancelCallback := context.WithCancel(ctx)
		err = runner.Run(cancelled, conn, func(tx pgx.Tx) error {
			if err := insert(tx, 4); err != nil {
				return err
			}
			cancelCallback()
			return sentinel
		})
		if !errors.Is(err, sentinel) {
			t.Fatalf("cancelled callback error replaced: %v", err)
		}
		if count(t, 4) != 0 {
			t.Fatal("cancelled callback committed")
		}
		assertOwned(t)
		if conn.Conn().PgConn().TxStatus() != 'I' {
			t.Fatal("cancelled transaction left open")
		}
		err = runner.Run(ctx, conn, func(tx pgx.Tx) error {
			if err := insert(tx, 5); err != nil {
				return err
			}
			return insert(tx, 5)
		})
		if err == nil {
			t.Fatal("commit constraint error hidden")
		}
		if count(t, 5) != 0 {
			t.Fatal("failed commit persisted effects")
		}
		assertOwned(t)
	})
	t.Run("product-binding-and-transaction-ownership", func(t *testing.T) {
		var bound pgx.Tx
		binds := 0
		product, err := NewProductRunner(pool, func(tx pgx.Tx) (pgx.Tx, error) { binds++; bound = tx; return tx, nil })
		if err != nil {
			t.Fatal(err)
		}
		if err := product.Do(ctx, nil); err == nil {
			t.Fatal("nil callback admitted")
		}
		if binds != 0 {
			t.Fatal("nil callback opened transaction")
		}
		if err := product.Do(ctx, func(tx pgx.Tx) error {
			if tx != bound {
				t.Fatal("different bound transaction")
			}
			return insert(tx, 10)
		}); err != nil {
			t.Fatal(err)
		}
		if binds != 1 || count(t, 10) != 1 {
			t.Fatal("binding or commit count differs")
		}
		if pool.Stat().AcquiredConns() != 0 {
			t.Fatal("product connection not released")
		}
		if _, err := bound.Exec(ctx, "SELECT 1"); !errors.Is(err, pgx.ErrTxClosed) {
			t.Fatalf("bound transaction remains usable: %v", err)
		}
		if err := product.Do(ctx, func(tx pgx.Tx) error {
			if err := insert(tx, 11); err != nil {
				return err
			}
			return sentinel
		}); !errors.Is(err, sentinel) {
			t.Fatalf("callback error: %v", err)
		}
		if count(t, 11) != 0 {
			t.Fatal("product callback failure committed")
		}
		bindingFailure, err := NewProductRunner(pool, func(tx pgx.Tx) (pgx.Tx, error) {
			if err := insert(tx, 12); err != nil {
				return nil, err
			}
			return nil, sentinel
		})
		if err != nil {
			t.Fatal(err)
		}
		if err := bindingFailure.Do(ctx, func(pgx.Tx) error { t.Fatal("callback after binding failure"); return nil }); !errors.Is(err, sentinel) {
			t.Fatalf("binding error: %v", err)
		}
		if count(t, 12) != 0 {
			t.Fatal("binding failure committed")
		}
		for _, inBinder := range []bool{false, true} {
			panicValue := &struct{ binder bool }{inBinder}
			id := 13
			if inBinder {
				id = 14
			}
			withPanic, err := NewProductRunner(pool, func(tx pgx.Tx) (pgx.Tx, error) {
				if inBinder {
					if err := insert(tx, id); err != nil {
						t.Fatal(err)
					}
					panic(panicValue)
				}
				return tx, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			func() {
				defer func() {
					if got := recover(); got != panicValue {
						t.Errorf("panic changed: %#v", got)
					}
				}()
				_ = withPanic.Do(ctx, func(tx pgx.Tx) error {
					if err := insert(tx, id); err != nil {
						t.Fatal(err)
					}
					panic(panicValue)
				})
			}()
			if count(t, id) != 0 {
				t.Fatal("product panic committed")
			}
		}
		cancelled, stop := context.WithCancel(ctx)
		if err := product.Do(cancelled, func(tx pgx.Tx) error {
			if err := insert(tx, 15); err != nil {
				return err
			}
			stop()
			return sentinel
		}); !errors.Is(err, sentinel) {
			t.Fatalf("cancellation replaced error: %v", err)
		}
		if count(t, 15) != 0 {
			t.Fatal("cancelled product committed")
		}
		if pool.Stat().AcquiredConns() != 0 {
			t.Fatal("rollback leaked product connection")
		}
		if err := product.Do(ctx, func(tx pgx.Tx) error {
			if err := insert(tx, 16); err != nil {
				return err
			}
			return insert(tx, 16)
		}); err == nil {
			t.Fatal("product commit failure hidden")
		}
		if count(t, 16) != 0 {
			t.Fatal("product failed commit persisted effects")
		}
	})
	t.Run("cancelled-admission-and-commit", func(t *testing.T) {
		for _, borrowed := range []bool{false, true} {
			isolated := newPool(t)
			conn, err := isolated.Acquire(ctx)
			if err != nil {
				t.Fatal(err)
			}
			expired, stop := context.WithCancel(ctx)
			stop()
			called := false
			if borrowed {
				err = runner.Run(expired, conn, func(pgx.Tx) error { called = true; return nil })
			} else {
				conn.Release()
				product, makeErr := NewProductRunner(isolated, func(tx pgx.Tx) (pgx.Tx, error) { return tx, nil })
				if makeErr != nil {
					t.Fatal(makeErr)
				}
				err = product.Do(expired, func(pgx.Tx) error { called = true; return nil })
			}
			if borrowed {
				conn.Release()
			}
			if err == nil || called {
				t.Fatalf("cancelled admission err=%v called=%v", err, called)
			}
		}
		isolated := newPool(t)
		conn, err := isolated.Acquire(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Release()
		cancelled, stop := context.WithCancel(ctx)
		err = runner.Run(cancelled, conn, func(tx pgx.Tx) error {
			if err := insert(tx, 20); err != nil {
				return err
			}
			stop()
			return nil
		})
		if err == nil {
			t.Fatal("cancelled commit returned success")
		}
		if count(t, 20) != 0 {
			t.Fatal("cancelled commit persisted effect")
		}
		if isolated.Stat().AcquiredConns() != 1 {
			t.Fatal("cancelled runner released borrowed connection")
		}
	})
}
