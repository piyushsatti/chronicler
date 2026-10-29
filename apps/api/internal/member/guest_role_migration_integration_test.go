//go:build integration

package member

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/pressly/goose/v3"
)

func TestGuestRoleMigrationPreservesMembersAndRejectsUnsafeDown(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	db, err := sql.Open("pgx", fixture.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	const migrations = "../../db/migrations"
	if err := goose.DownToContext(ctx, db, migrations, 11); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO members(discord_id,handle,display_name,roles) VALUES('existing','existing','Existing',ARRAY['player','admin'])`); err != nil {
		t.Fatal(err)
	}
	var before string
	if err := db.QueryRowContext(ctx, `SELECT row_to_json(m)::text FROM members m WHERE discord_id='existing'`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpToContext(ctx, db, migrations, 12); err != nil {
		t.Fatal(err)
	}
	var after string
	if err := db.QueryRowContext(ctx, `SELECT row_to_json(m)::text FROM members m WHERE discord_id='existing'`).Scan(&after); err != nil || after != before {
		t.Fatalf("existing member changed: before=%s after=%s err=%v", before, after, err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO members(discord_id,handle,display_name,roles) VALUES('guest','guest','Guest',ARRAY['guest'])`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE members SET roles=ARRAY['unknown'] WHERE discord_id='guest'`); err == nil {
		t.Fatal("unknown role admitted")
	}
	if err := goose.DownToContext(ctx, db, migrations, 11); err == nil || !strings.Contains(err.Error(), "cannot remove guest role while members still have guest") {
		t.Fatalf("unsafe down error=%v", err)
	}
	if version, err := goose.GetDBVersionContext(ctx, db); err != nil || version != 12 {
		t.Fatalf("unsafe down changed version=%d err=%v", version, err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE members SET roles=ARRAY['guest','admin'] WHERE discord_id='guest'`); err != nil {
		t.Fatalf("unsafe down partially restored old constraint: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE members SET roles=ARRAY['player','admin'] WHERE discord_id='guest'`); err != nil {
		t.Fatal(err)
	}
	if err := goose.DownToContext(ctx, db, migrations, 11); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE members SET roles=ARRAY['guest'] WHERE discord_id='guest'`); err == nil {
		t.Fatal("safe down retained guest vocabulary")
	}
	var defaultRole string
	if err := db.QueryRowContext(ctx, `INSERT INTO members(discord_id,handle,display_name) VALUES('default','default','Default') RETURNING roles[1]`).Scan(&defaultRole); err != nil || defaultRole != "player" {
		t.Fatalf("default role=%s err=%v", defaultRole, err)
	}
}
