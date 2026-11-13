//go:build integration

package integration_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/piyushsatti/chronicler/apps/api/db/migrations"
)

func TestRevokeDataAPIGrants(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	container, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("chronicler"),
		postgres.WithUsername("postgres"),
		postgres.WithPassword("synthetic-data-api-grants"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)),
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := container.Terminate(ctx); err != nil {
			t.Errorf("terminate owned postgres: %v", err)
		}
	})
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations.FS)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 15); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		CREATE ROLE anon;
		CREATE ROLE authenticated;
		GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
		GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
		ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
		ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
	`); err != nil {
		t.Fatal(err)
	}
	assertGrants := func(want bool) {
		t.Helper()
		for _, role := range []string{"anon", "authenticated"} {
			var tables, sequences bool
			if err := db.QueryRowContext(ctx, `
				SELECT bool_and(has_table_privilege($1, c.oid, p.privilege) = $2)
				FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
				CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(privilege)
				WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
			`, role, want).Scan(&tables); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRowContext(ctx, `
				SELECT bool_and(has_sequence_privilege($1, c.oid, p.privilege) = $2)
				FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
				CROSS JOIN unnest(ARRAY['SELECT', 'UPDATE', 'USAGE']) p(privilege)
				WHERE n.nspname = 'public' AND c.relkind = 'S'
			`, role, want).Scan(&sequences); err != nil {
				t.Fatal(err)
			}
			if !tables || !sequences {
				t.Fatalf("%s: expected every table and sequence privilege to be %t; tables=%t sequences=%t", role, want, tables, sequences)
			}
		}
	}
	assertGrants(true)
	if _, err := provider.UpTo(ctx, 16); err != nil {
		t.Fatal(err)
	}
	assertGrants(false)
	if _, err := db.ExecContext(ctx, `CREATE TABLE public.data_api_grants_probe (id bigserial PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	assertGrants(false)
}
