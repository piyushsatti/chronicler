//go:build integration

package document

import (
	"context"
	"database/sql"
	"os"
	"reflect"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestDocumentVersionFloorMigrationLiftsZeroVersions(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("versionfloor"), postgres.WithUsername("versionfloor"), postgres.WithPassword("synthetic-versionfloor"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if err := container.Terminate(cleanup); err != nil {
			t.Errorf("terminate owned PostgreSQL: %v", err)
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
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	const migrations = "../../db/migrations"
	columnDefault := func() string {
		t.Helper()
		var value string
		if err := db.QueryRowContext(ctx, `SELECT column_default FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'version'`).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	if err := goose.UpToContext(ctx, db, migrations, 9); err != nil {
		t.Fatal(err)
	}
	if got := columnDefault(); got != "0" {
		t.Fatalf("documents.version default before 0010 = %q, want 0", got)
	}
	for _, q := range []string{
		`INSERT INTO documents(id,kind,slug,title) VALUES (41,'rule','vf-default','Default')`,
		`INSERT INTO documents(id,kind,slug,title,version) VALUES (42,'codex_entry','vf-zero','Zero',0),(43,'codex_entry','vf-edited','Edited',3)`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("SQL %s: %v", q, err)
		}
	}
	if err := goose.UpToContext(ctx, db, migrations, 10); err != nil {
		t.Fatal(err)
	}
	rows, err := db.QueryContext(ctx, `SELECT id, version FROM documents ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type doc struct{ ID, Version int64 }
	var got []doc
	for rows.Next() {
		var d doc
		if err := rows.Scan(&d.ID, &d.Version); err != nil {
			t.Fatal(err)
		}
		got = append(got, d)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	want := []doc{{41, 1}, {42, 1}, {43, 3}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("documents.version after 0010 = %+v, want %+v", got, want)
	}
	if got := columnDefault(); got != "1" {
		t.Fatalf("documents.version default after 0010 = %q, want 1", got)
	}
	if err := goose.DownToContext(ctx, db, migrations, 9); err != nil {
		t.Fatal(err)
	}
	if got := columnDefault(); got != "0" {
		t.Fatalf("documents.version default after down to 0009 = %q, want 0", got)
	}
}
