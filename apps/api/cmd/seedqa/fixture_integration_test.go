//go:build integration

package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
)

// Golden-fixture acceptance owns a fresh container and uses no local.sql or
// shared dbtest state. It must never migrate/load an externally supplied URL.
func TestQAFreshPostgresDoubleLoad(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("QA acceptance requires a fresh disposable Postgres; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	container, err := freshQAPostgres(ctx)
	if err != nil {
		t.Fatalf("fresh Postgres: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanupCancel()
		if err := container.Terminate(cleanupCtx); err != nil {
			t.Errorf("terminate QA container: %v", err)
		}
	})
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, sqlDB, "../../db/migrations"); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := checkDatabase(ctx, pool, "../../db/migrations"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile("../../db/seed/qa.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	lines, err := parseJSONL(raw)
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, row := range lines {
		counts[row.Table]++
	}
	var previous map[string]string
	for load := 1; load <= 2; load++ {
		n, err := apply(ctx, pool, lines)
		if err != nil || n != len(lines) {
			t.Fatalf("load %d specifications=%d err=%v", load, n, err)
		}
		snapshot := assertQADatabase(t, ctx, pool, lines, counts)
		if load == 2 && !reflect.DeepEqual(previous, snapshot) {
			t.Fatal("second load changed persisted rows, values, or defaults")
		}
		previous = snapshot
		t.Logf("load %d: %d specifications, all %d application table populations, explicit values and resolved references verified", load, len(lines), len(counts))
	}
	job, question := qaQuestion(t)
	mux := http.NewServeMux()
	agent.New("qa-test-secret", agent.NewPostgresStore(pool), false).Routes(mux)
	base := "/v1/agent/questions"
	id := job.Row["public_id"].(string)
	assertQAResult(t, qaRequest(mux, "GET", base+"/"+id, nil), question.Row["result"])
	// Replay the submitted request and fenced terminal receipt through today's
	// adapters. Existing succeeded data must remain unchanged.
	if w := qaRequest(mux, "POST", base, qaJSON(t, job.Row["payload"])); w.Code != 202 {
		t.Fatalf("seeded submit replay status=%d body=%s", w.Code, w.Body)
	}
	completion := map[string]any{}
	for k, v := range question.Row["result"].(map[string]any) {
		completion[k] = v
	}
	completion["lease_token"] = "1"
	if w := qaRequest(mux, "POST", base+"/"+id+"/complete", qaJSON(t, completion)); w.Code != 204 {
		t.Fatalf("seeded completion replay status=%d body=%s", w.Code, w.Body)
	}
	assertQAResult(t, qaRequest(mux, "GET", base+"/"+id, nil), question.Row["result"])
	if got := assertQADatabase(t, ctx, pool, lines, counts); !reflect.DeepEqual(previous, got) {
		t.Fatal("poll or idempotent protocol replay mutated seeded rows")
	}
	t.Log("seeded answered question polled through Postgres-backed HTTP adapter; submit/completion replay preserved every row")
}

func freshQAPostgres(ctx context.Context) (container *postgres.PostgresContainer, err error) {
	// testcontainers' Docker host discovery can panic on an unavailable or
	// denied socket. Preserve this as a failing setup receipt, never a skip.
	defer func() {
		if failure := recover(); failure != nil {
			err = fmt.Errorf("Docker initialization: %v", failure)
		}
	}()
	return postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("qa_acceptance"), postgres.WithUsername("qa"), postgres.WithPassword("synthetic-qa"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)),
	)
}

func assertQADatabase(t *testing.T, ctx context.Context, pool *pgxpool.Pool, lines []line, counts map[string]int) map[string]string {
	t.Helper()
	rows, err := pool.Query(ctx, `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'goose_db_version' ORDER BY tablename`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, table)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	fixtureTables := []string{"character_catalog_picks", "member_unlocks", "role_changes", "unlockables"}
	for table := range counts {
		fixtureTables = append(fixtureTables, table)
	}
	sort.Strings(fixtureTables)
	if !reflect.DeepEqual(tables, fixtureTables) {
		t.Fatalf("schema tables=%v fixture tables=%v", tables, fixtureTables)
	}
	snapshot := map[string]string{}
	for _, table := range tables {
		if !ident.MatchString(table) {
			t.Fatalf("invalid application table %q", table)
		}
		var count int
		var data string
		query := fmt.Sprintf(`SELECT count(*), COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]'::jsonb)::text FROM %s r`, table)
		if err := pool.QueryRow(ctx, query).Scan(&count, &data); err != nil {
			t.Fatal(err)
		}
		if count != counts[table] {
			t.Fatalf("%s population=%d want=%d", table, count, counts[table])
		}
		snapshot[table] = data
	}
	for i, row := range lines {
		// PostgreSQL's composite decoder converts expected JSON into actual
		// column types (arrays, JSONB, timestamptz, UUID, numeric and boolean).
		// Compare every explicit value and every resolved FK, not just counts.
		expected := map[string]any{}
		for col, value := range row.Row {
			expected[col] = value
		}
		for col, ref := range row.Refs {
			var id int64
			query := fmt.Sprintf("SELECT id FROM %s WHERE public_id=$1::uuid", ref.Table)
			if err := pool.QueryRow(ctx, query, ref.PublicID).Scan(&id); err != nil {
				t.Fatalf("specification %d reference %s: %v", i+1, col, err)
			}
			expected[col] = id
		}
		cols := make([]string, 0, len(expected))
		for col := range expected {
			cols = append(cols, col)
		}
		sort.Strings(cols)
		var checks []string
		for _, col := range cols {
			checks = append(checks, fmt.Sprintf("r.%s IS NOT DISTINCT FROM e.%s", col, col))
		}
		query := fmt.Sprintf("SELECT count(*) FROM %s r CROSS JOIN jsonb_populate_record(NULL::%s, $1::jsonb) e WHERE %s", row.Table, row.Table, strings.Join(checks, " AND "))
		var matches int
		if err := pool.QueryRow(ctx, query, string(qaJSON(t, expected))).Scan(&matches); err != nil || matches != 1 {
			t.Fatalf("specification %d %s explicit values/references matches=%d err=%v", i+1, row.Table, matches, err)
		}
	}
	return snapshot
}
