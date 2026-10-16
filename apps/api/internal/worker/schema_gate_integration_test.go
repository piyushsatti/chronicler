//go:build integration

package worker_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func wk03Mismatch(t *testing.T, err error, have int64) {
	t.Helper()
	var mismatch *worker.SchemaCompatibilityError
	if !errors.As(err, &mismatch) || mismatch.Have != have || mismatch.Min != 3 || mismatch.Max != 3 {
		t.Fatalf("got %v, want typed compatibility failure Have=%d Min=3 Max=3", err, have)
	}
	if strings.Contains(err.Error(), "SELECT") || strings.Contains(err.Error(), "password") {
		t.Fatalf("unsafe compatibility failure %q", err)
	}
}

func TestPhase3TaskWK03Acceptance(t *testing.T) {
	gate, err := worker.NewSchemaGate(3, 3)
	if err != nil {
		t.Fatal(err)
	}
	t.Run("WORK-SCHEMA invalid bounds and nil boundaries fail closed", func(t *testing.T) {
		for _, bounds := range [][2]int64{{0, 3}, {-1, 3}, {3, 2}, {3, 0}} {
			got, err := worker.NewSchemaGate(bounds[0], bounds[1])
			if err == nil || got != nil {
				t.Fatalf("accepted invalid bounds %v", bounds)
			}
		}
		if _, err := worker.NewSchemaGate(2, 4); err != nil {
			t.Fatalf("ordered constructor bounds rejected %v", err)
		}
		var typedNil *pgxpool.Pool
		for _, db := range []jobs.SQLExecutor{nil, typedNil} {
			if err := gate.Check(context.Background(), db); err == nil {
				t.Fatal("nil executor admitted")
			}
		}
		var absent *worker.SchemaGate
		if err := absent.Check(context.Background(), nil); err == nil {
			t.Fatal("nil gate admitted")
		}
		if err := new(worker.SchemaGate).Check(context.Background(), nil); err == nil {
			t.Fatal("zero gate admitted")
		}
		if err := gate.Check(nil, typedNil); err == nil {
			t.Fatal("nil context admitted")
		}
	})
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	before, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("preexisting container identities %s", strings.TrimSpace(string(before)))
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("wk03"), postgres.WithUsername("wk03"), postgres.WithPassword("synthetic-wk03"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
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
		remaining := map[string]bool{}
		for _, id := range strings.Fields(string(after)) {
			remaining[id] = true
		}
		for _, id := range strings.Fields(string(before)) {
			if !remaining[id] {
				t.Errorf("preexisting container removed %s", id)
			}
		}
		if remaining[container.GetContainerID()] {
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
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	t.Run("WORK-SCHEMA Goose2 rejects then actual Goose3 admits", func(t *testing.T) {
		if err := goose.UpToContext(ctx, migrationDB, migrations, 2); err != nil {
			t.Fatal(err)
		}
		wk03Mismatch(t, gate.Check(ctx, pool), 2)
		if err := goose.UpToContext(ctx, migrationDB, migrations, 3); err != nil {
			t.Fatal(err)
		}
		if err := gate.Check(ctx, pool); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("WORK-SCHEMA actual Goose3 down rejects and reapply admits", func(t *testing.T) {
		if err := goose.DownToContext(ctx, migrationDB, migrations, 2); err != nil {
			t.Fatal(err)
		}
		wk03Mismatch(t, gate.Check(ctx, pool), 2)
		if err := goose.UpToContext(ctx, migrationDB, migrations, 3); err != nil {
			t.Fatal(err)
		}
		if err := gate.Check(ctx, pool); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("WORK-SCHEMA latest record per version suppresses prior applied3", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
		if _, err := tx.Exec(ctx, `INSERT INTO goose_db_version(version_id,is_applied) VALUES(3,false)`); err != nil {
			t.Fatal(err)
		}
		wk03Mismatch(t, gate.Check(ctx, tx), 2)
		if _, err := tx.Exec(ctx, `INSERT INTO goose_db_version(version_id,is_applied) VALUES(3,true)`); err != nil {
			t.Fatal(err)
		}
		if err := gate.Check(ctx, tx); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("WORK-SCHEMA latest applied ID takes precedence over maximum version", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
		if _, err := tx.Exec(ctx, `INSERT INTO goose_db_version(version_id,is_applied) VALUES(2,true)`); err != nil {
			t.Fatal(err)
		}
		wk03Mismatch(t, gate.Check(ctx, tx), 2)
	})
	t.Run("WORK-SCHEMA no applied history is version zero", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
		if _, err := tx.Exec(ctx, `INSERT INTO goose_db_version(version_id,is_applied) SELECT DISTINCT version_id,false FROM goose_db_version`); err != nil {
			t.Fatal(err)
		}
		wk03Mismatch(t, gate.Check(ctx, tx), 0)
	})
	t.Run("WORK-SCHEMA read only transaction preserves full version history", func(t *testing.T) {
		tx, err := pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
		const snapshot = `SELECT jsonb_agg(to_jsonb(v) ORDER BY id)::text FROM goose_db_version v`
		var before, after string
		if err := tx.QueryRow(ctx, snapshot).Scan(&before); err != nil {
			t.Fatal(err)
		}
		if err := gate.Check(ctx, tx); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, snapshot).Scan(&after); err != nil || after != before {
			t.Fatalf("version history changed %v", err)
		}
	})
	t.Run("WORK-SCHEMA caller cancellation fails closed", func(t *testing.T) {
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		if err := gate.Check(cancelled, pool); !errors.Is(err, context.Canceled) {
			t.Fatalf("got %v, want cancellation", err)
		}
	})
	t.Run("WORK-SCHEMA database lock is bounded by three second timeout", func(t *testing.T) {
		blocker, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer blocker.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
		if _, err := blocker.Exec(ctx, `LOCK TABLE goose_db_version IN ACCESS EXCLUSIVE MODE`); err != nil {
			t.Fatal(err)
		}
		start := time.Now()
		err = gate.Check(ctx, pool)
		elapsed := time.Since(start)
		if !errors.Is(err, context.DeadlineExceeded) || elapsed < 2*time.Second || elapsed > 6*time.Second {
			t.Fatalf("got %v after %v, want bounded schema timeout", err, elapsed)
		}
	})
	t.Run("WORK-SCHEMA future Goose4 after startup rejects and down restores3", func(t *testing.T) {
		if err := gate.Check(ctx, pool); err != nil {
			t.Fatal(err)
		}
		futureDir := t.TempDir()
		for _, name := range []string{"0001_init.sql", "0002_quest_display_status.sql", "0003_product_graphql.sql"} {
			raw, err := os.ReadFile(filepath.Join(migrations, name))
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(futureDir, name), raw, 0600); err != nil {
				t.Fatal(err)
			}
		}
		if err := os.WriteFile(filepath.Join(futureDir, "0004_future.sql"), []byte("-- +goose Up\nSELECT 1;\n-- +goose Down\nSELECT 1;\n"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := goose.UpToContext(ctx, migrationDB, futureDir, 4); err != nil {
			t.Fatal(err)
		}
		wk03Mismatch(t, gate.Check(ctx, pool), 4)
		if err := goose.DownToContext(ctx, migrationDB, futureDir, 3); err != nil {
			t.Fatal(err)
		}
		if err := gate.Check(ctx, pool); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("WORK-SCHEMA missing version table fails opaque without creating it", func(t *testing.T) {
		if _, err := pool.Exec(ctx, `DROP TABLE goose_db_version`); err != nil {
			t.Fatal(err)
		}
		err := gate.Check(ctx, pool)
		var pgErr *pgconn.PgError
		var mismatch *worker.SchemaCompatibilityError
		var expected *apierr.Error
		if !errors.As(err, &pgErr) || pgErr.Code != "42P01" || errors.As(err, &mismatch) || errors.As(err, &expected) {
			t.Fatalf("got %v, want unexpected missing-table database failure", err)
		}
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT to_regclass('goose_db_version') IS NOT NULL`).Scan(&exists); err != nil || exists {
			t.Fatalf("missing table recreated %v", err)
		}
	})
}
