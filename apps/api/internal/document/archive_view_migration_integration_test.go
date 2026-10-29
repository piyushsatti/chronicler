//go:build integration

package document

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/pressly/goose/v3"
)

func TestArchiveDocumentsViewMigrationAnonymousEligibility(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	db, err := sql.Open("pgx", f.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	const migrations = "../../db/migrations"
	if err := goose.DownToContext(ctx, db, migrations, 14); err != nil {
		t.Fatal(err)
	}
	checkAbsent := func() {
		t.Helper()
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT to_regclass('public.archive_documents_v1') IS NOT NULL`).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if exists {
			t.Fatal("archive_documents_v1 survived down to 0014")
		}
	}
	checkAbsent()
	if _, err := db.ExecContext(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,policy,deleted_at) VALUES
('rule','archive-public','Public','published','public',NULL,NULL),
('summary','archive-summary','Summary','published','public',NULL,NULL),
('rule','archive-draft','Draft','draft','public',NULL,NULL),
('rule','archive-deleted','Deleted','published','public',NULL,clock_timestamp()),
('rule','archive-dm-only','DM only','published','dm_only',NULL,NULL),
('rule','archive-restricted','Restricted','published','restricted',NULL,NULL),
('rule','archive-member-policy','Member policy','published','public','["member:@archive-reader"]'::jsonb,NULL),
('rule','archive-role-policy','Role policy','published','public','["role:player"]'::jsonb,NULL)`); err != nil {
		t.Fatal(err)
	}
	snapshot := func() string {
		t.Helper()
		var value string
		if err := db.QueryRowContext(ctx, `SELECT jsonb_agg(to_jsonb(d) ORDER BY id)::text FROM documents d`).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	before := snapshot()
	checkView := func(want string) {
		t.Helper()
		var columns string
		if err := db.QueryRowContext(ctx, `SELECT COALESCE(string_agg(column_name || ':' || udt_name, ',' ORDER BY ordinal_position),'')
FROM information_schema.columns WHERE table_schema='public' AND table_name='archive_documents_v1'`).Scan(&columns); err != nil {
			t.Fatal(err)
		}
		if columns != "document_id:uuid" {
			t.Fatalf("archive view columns = %q, want document_id:uuid", columns)
		}
		var got string
		if err := db.QueryRowContext(ctx, `SELECT COALESCE(string_agg(d.slug, ',' ORDER BY d.slug),'')
FROM public.archive_documents_v1 a JOIN documents d ON d.public_id=a.document_id`).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("anonymous archive documents = %q, want %q", got, want)
		}
	}
	if err := goose.UpToContext(ctx, db, migrations, 15); err != nil {
		t.Fatal(err)
	}
	checkView("archive-public,archive-summary")
	if after := snapshot(); after != before {
		t.Fatal("archive view migration changed documents")
	}
	if err := goose.DownToContext(ctx, db, migrations, 14); err != nil {
		t.Fatal(err)
	}
	checkAbsent()
	if after := snapshot(); after != before {
		t.Fatal("archive view down migration changed documents")
	}
	if err := goose.UpToContext(ctx, db, migrations, 15); err != nil {
		t.Fatal(err)
	}
	checkView("archive-public,archive-summary")
	if _, err := db.ExecContext(ctx, `UPDATE documents SET policy='["role:player"]'::jsonb WHERE slug='archive-public'`); err != nil {
		t.Fatal(err)
	}
	checkView("archive-summary")
	if _, err := db.ExecContext(ctx, `UPDATE documents SET deleted_at=clock_timestamp() WHERE slug='archive-summary'`); err != nil {
		t.Fatal(err)
	}
	checkView("")
}
