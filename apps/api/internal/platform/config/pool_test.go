package config

import (
	"net/url"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDefaultDatabasePoolBoundPreservesExplicitDSN(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	defaultDSN := FromEnv().DatabaseURL
	parsed, err := url.Parse(defaultDSN)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Query().Get("pool_max_conns") != "10" {
		t.Fatal("default DSN must explicitly set pool_max_conns=10")
	}
	cfg, err := pgxpool.ParseConfig(defaultDSN)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.MaxConns != 10 {
		t.Fatalf("default pool max=%d, want 10", cfg.MaxConns)
	}
	const explicit = "postgres://test:test@localhost/test?sslmode=disable&pool_max_conns=3"
	t.Setenv("DATABASE_URL", explicit)
	if got := FromEnv().DatabaseURL; got != explicit {
		t.Fatalf("explicit DATABASE_URL was changed")
	}
}
