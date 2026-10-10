// Package dbtest starts an ephemeral Postgres for integration tests via
// testcontainers. Tests do not require a pre-running DATABASE_URL; Docker
// must be available. If DATABASE_URL is set, that DSN is used instead (opt-in
// reuse for local iteration).
package dbtest

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

var errNoDocker = fmt.Errorf("Docker is not running. Start Docker Desktop (or Colima), then re-run. Integration tests start Postgres themselves via testcontainers")

func dockerSocket() error {
	if os.Getenv("DOCKER_HOST") != "" {
		return nil
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		"/var/run/docker.sock",
		filepath.Join(home, ".docker", "run", "docker.sock"),
		filepath.Join(home, ".colima", "default", "docker.sock"),
		filepath.Join(home, ".orbstack", "run", "docker.sock"),
	}
	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return nil
		}
	}
	return errNoDocker
}

var (
	startOnce sync.Once
	dsn       string
	startErr  error
)

// DSN returns a migrated+seeded Postgres URL for the test process.
func DSN(t testing.TB) string {
	t.Helper()
	startOnce.Do(func() {
		startErr = start(context.Background())
	})
	if startErr != nil {
		t.Fatalf("postgres for tests: %v", startErr)
	}
	return dsn
}

// Pool returns a connected pool; the caller does not own the container.
func Pool(t testing.TB) *db.Pool {
	t.Helper()
	pool, err := db.Connect(context.Background(), DSN(t))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func start(ctx context.Context) (err error) {
	// testcontainers panics with "rootless Docker not found" when no daemon socket exists.
	defer func() {
		if r := recover(); r != nil {
			err = errNoDocker
		}
	}()

	if override := os.Getenv("DATABASE_URL"); override != "" {
		dsn = override
		return prepare(ctx, dsn)
	}
	if err := dockerSocket(); err != nil {
		return err
	}

	pgCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	container, err := postgres.Run(pgCtx,
		"postgres:16-alpine",
		postgres.WithDatabase("chronicler"),
		postgres.WithUsername("chronicler"),
		postgres.WithPassword("chronicler"),
		testcontainers.WithWaitStrategy(
			wait.ForAll(
				wait.ForListeningPort("5432/tcp"),
				wait.ForLog("database system is ready to accept connections").WithOccurrence(2),
			).WithDeadline(90*time.Second),
		),
	)
	if err != nil {
		return fmt.Errorf("start postgres container (is Docker running?): %w", err)
	}

	url, err := container.ConnectionString(pgCtx, "sslmode=disable")
	if err != nil {
		_ = container.Terminate(context.Background())
		return err
	}
	dsn = url
	return prepare(pgCtx, dsn)
}

func prepare(ctx context.Context, databaseURL string) error {
	root, err := moduleRoot()
	if err != nil {
		return err
	}
	migrations := filepath.Join(root, "db", "migrations")
	seed := filepath.Join(root, "db", "seed", "local.sql")

	sqlDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	deadline := time.Now().Add(30 * time.Second)
	for {
		if err := sqlDB.PingContext(ctx); err == nil {
			break
		} else if time.Now().After(deadline) {
			return fmt.Errorf("ping postgres: %w", err)
		}
		time.Sleep(200 * time.Millisecond)
	}

	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := goose.UpContext(ctx, sqlDB, migrations); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}

	raw, err := os.ReadFile(seed)
	if err != nil {
		return err
	}
	if _, err := sqlDB.ExecContext(ctx, string(raw)); err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	return nil
}

func moduleRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("go.mod not found from %s", dir)
		}
		dir = parent
	}
}
