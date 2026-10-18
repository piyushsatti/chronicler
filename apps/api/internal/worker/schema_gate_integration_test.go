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
	if !errors.As(err, &mismatch) || mismatch.Have != have || mismatch.Min != 1 || mismatch.Max != 1 {
		t.Fatalf("got %v, want typed compatibility failure Have=%d Min=1 Max=1", err, have)
	}
	if strings.Contains(err.Error(), "SELECT") || strings.Contains(err.Error(), "password") {
		t.Fatalf("unsafe compatibility failure %q", err)
	}
}

func TestPhase3TaskWK03Acceptance(t *testing.T) {
	gate, err := worker.NewSchemaGate(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	t.Run("WORK-SCHEMA invalid bounds and nil boundaries fail closed", func(t *testing.T) {
		for _, bounds := range [][2]int64{{0, 1}, {-1, 1}, {1, 0}} {
			got, err := worker.NewSchemaGate(bounds[0], bounds[1])
			if err == nil || got != nil {
				t.Fatalf("accepted invalid bounds %v", bounds)
			}
		}
		var typedNil *pgxpool.Pool
		for _, db := range []jobs.SQLExecutor{nil, typedNil} {
			if err := gate.Check(context.Background(), db); err == nil {
				t.Fatal("nil executor admitted")
			}
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
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("wk03"), postgres.WithUsername("wk03"), postgres.WithPassword("synthetic-wk03"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = container.Terminate(cleanCtx)
		for _, id := range strings.Fields(string(before)) {
			after, _ := exec.CommandContext(cleanCtx, "docker", "ps", "-aq", "--no-trunc").Output()
			if !strings.Contains(string(after), id) {
				t.Errorf("preexisting container removed %s", id)
			}
		}
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
	t.Run("WORK-SCHEMA Goose1 admits and unapplied history reads as zero", func(t *testing.T) {
		if err := goose.UpContext(ctx, migrationDB, migrations); err != nil {
			t.Fatal(err)
		}
		if err := gate.Check(ctx, pool); err != nil {
			t.Fatal(err)
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
		if _, err := tx.Exec(ctx, `UPDATE goose_db_version SET is_applied=false`); err != nil {
			t.Fatal(err)
		}
		wk03Mismatch(t, gate.Check(ctx, tx), 0)
	})
	t.Run("WORK-SCHEMA synthetic version two rejects", func(t *testing.T) {
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
	})
}
