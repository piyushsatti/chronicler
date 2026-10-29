//go:build integration

package jobs_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/pressly/goose/v3"
)

func TestOperationalLookupIndexesMigrationUpDown(t *testing.T) {
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
	const migrations = "../../../db/migrations"
	if err := goose.DownToContext(ctx, db, migrations, 12); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		`INSERT INTO background_jobs(job_key,kind,lane,state,payload)
SELECT 'operational-index:' || i,
       CASE i%3 WHEN 0 THEN 'quest_discord_delivery' WHEN 1 THEN 'quest_discord' ELSE 'gametime_fill' END,
       'discord',
       CASE i%4 WHEN 0 THEN 'queued' WHEN 1 THEN 'succeeded' WHEN 2 THEN 'dead' ELSE 'repair_required' END,
       jsonb_build_object('public_id',md5((i%128)::text)::uuid)
FROM generate_series(1,4096) AS input(i)`,
		`INSERT INTO background_jobs(job_key,kind,lane,state,question_deadline_at)
VALUES('operational-agent','agent_question','agent','dead',clock_timestamp())`,
		`INSERT INTO bot_heartbeats(payload,received_at)
SELECT jsonb_build_object('sample',i), clock_timestamp()-i*interval '1 hour'
FROM generate_series(1,1024) AS input(i)`,
		`ANALYZE background_jobs; ANALYZE bot_heartbeats`,
	} {
		if _, err := db.ExecContext(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	snapshot := func() string {
		t.Helper()
		var result string
		if err := db.QueryRowContext(ctx, `SELECT jsonb_build_object(
  'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM background_jobs j),
  'heartbeats',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM bot_heartbeats h)
)::text`).Scan(&result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	before := snapshot()
	checkIndexes := func(present bool) {
		t.Helper()
		for _, index := range []struct {
			name, table string
			parts       []string
		}{
			{"bot_heartbeats_received_at_idx", "bot_heartbeats", []string{"(received_at DESC)"}},
			{"background_jobs_quest_delivery_idx", "background_jobs", []string{"payload ->> 'public_id'", "updated_at DESC, public_id DESC", "WHERE", "quest_discord_delivery", "quest_discord"}},
		} {
			var definition string
			err := db.QueryRowContext(ctx, `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1 AND indexname=$2`, index.table, index.name).Scan(&definition)
			if !present {
				if err != sql.ErrNoRows {
					t.Fatalf("index %s survived down: definition=%s error=%v", index.name, definition, err)
				}
				continue
			}
			if err != nil {
				t.Fatalf("index %s missing: %v", index.name, err)
			}
			for _, part := range index.parts {
				if !strings.Contains(definition, part) {
					t.Fatalf("index %s missing %q: %s", index.name, part, definition)
				}
			}
		}
		if after := snapshot(); after != before {
			t.Fatal("index migration changed background jobs or heartbeat data")
		}
	}
	explain := func(stage string) {
		t.Helper()
		for _, query := range []string{
			`EXPLAIN (COSTS OFF) SELECT b.public_id,b.state,b.next_run_at,b.safe_error_code,b.error_message
FROM background_jobs b
WHERE b.kind IN ('quest_discord_delivery','quest_discord')
  AND b.payload->>'public_id'=md5('17')::uuid::text
ORDER BY b.updated_at DESC,b.public_id DESC LIMIT 1`,
			`EXPLAIN (COSTS OFF) SELECT max(received_at) FROM bot_heartbeats`,
		} {
			rows, err := db.QueryContext(ctx, query)
			if err != nil {
				t.Fatal(err)
			}
			var lines []string
			for rows.Next() {
				var line string
				if err := rows.Scan(&line); err != nil {
					rows.Close()
					t.Fatal(err)
				}
				lines = append(lines, line)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				t.Fatal(err)
			}
			t.Logf("%s representative lookup plan:\n%s", stage, strings.Join(lines, "\n"))
		}
	}
	checkIndexes(false)
	explain("before indexes")
	if err := goose.UpToContext(ctx, db, migrations, 13); err != nil {
		t.Fatal(err)
	}
	checkIndexes(true)
	explain("after indexes")
	if err := goose.DownToContext(ctx, db, migrations, 12); err != nil {
		t.Fatal(err)
	}
	checkIndexes(false)
	if err := goose.UpToContext(ctx, db, migrations, 13); err != nil {
		t.Fatal(err)
	}
	checkIndexes(true)
}
