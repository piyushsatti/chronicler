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

func TestDiscordActivityLookupIndexMigrationUpDown(t *testing.T) {
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
	if err := goose.DownToContext(ctx, db, migrations, 13); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO discord_activity_events(event_id,kind,discord_user_id,channel_id,occurred_at,amount)
		SELECT 'activity-index-'||i, CASE i%3 WHEN 0 THEN 'voice' WHEN 1 THEN 'message' ELSE 'reaction' END,
		       'member-'||(i%128), 'channel', '2026-10-29T00:00:00Z'::timestamptz-i*interval '1 hour', 1
		FROM generate_series(1,4096) AS input(i)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `ANALYZE discord_activity_events`); err != nil {
		t.Fatal(err)
	}
	snapshot := func() string {
		t.Helper()
		var rows string
		if err := db.QueryRowContext(ctx, `SELECT jsonb_agg(to_jsonb(e) ORDER BY event_id)::text FROM discord_activity_events e`).Scan(&rows); err != nil {
			t.Fatal(err)
		}
		return rows
	}
	before := snapshot()
	check := func(present bool) {
		t.Helper()
		var definition string
		err := db.QueryRowContext(ctx, `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='discord_activity_events_member_kind_time_idx'`).Scan(&definition)
		if present {
			if err != nil || !strings.Contains(definition, "(discord_user_id, kind, occurred_at DESC)") {
				t.Fatalf("activity index=%s err=%v", definition, err)
			}
		} else if err != sql.ErrNoRows {
			t.Fatalf("activity index survived down: %s err=%v", definition, err)
		}
		if after := snapshot(); after != before {
			t.Fatal("activity index migration changed stored events")
		}
	}
	explain := func(stage string) {
		t.Helper()
		rows, err := db.QueryContext(ctx, `EXPLAIN (COSTS OFF) SELECT sum(amount) FROM discord_activity_events
			WHERE discord_user_id='member-17' AND kind='message' AND occurred_at>='2026-01-01T00:00:00Z'`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var lines []string
		for rows.Next() {
			var line string
			if err := rows.Scan(&line); err != nil {
				t.Fatal(err)
			}
			lines = append(lines, line)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		t.Logf("%s representative activity lookup plan:\n%s", stage, strings.Join(lines, "\n"))
	}
	check(false)
	explain("before index")
	if err := goose.UpToContext(ctx, db, migrations, 14); err != nil {
		t.Fatal(err)
	}
	check(true)
	explain("after index")
	if err := goose.DownToContext(ctx, db, migrations, 13); err != nil {
		t.Fatal(err)
	}
	check(false)
	if err := goose.UpToContext(ctx, db, migrations, 14); err != nil {
		t.Fatal(err)
	}
	check(true)
}
