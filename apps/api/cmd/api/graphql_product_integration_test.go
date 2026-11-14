//go:build integration

package main

import (
	"context"
	"errors"
	"math"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pressly/goose/v3"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

func TestProductFixtureRejectsExternalDatabase(t *testing.T) {
	if os.Getenv("CHRONICLER_PRODUCT_FIXTURE_REFUSAL_CHILD") == "1" {
		newProductFixture(t)
		t.Fatal("external DATABASE_URL was accepted")
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, executable, "-test.run=^TestProductFixtureRejectsExternalDatabase$")
	for _, variable := range os.Environ() {
		if !strings.HasPrefix(variable, "DATABASE_URL=") && !strings.HasPrefix(variable, "CHRONICLER_PRODUCT_FIXTURE_REFUSAL_CHILD=") {
			command.Env = append(command.Env, variable)
		}
	}
	command.Env = append(command.Env, "DATABASE_URL=postgres://forbidden.invalid/external", "CHRONICLER_PRODUCT_FIXTURE_REFUSAL_CHILD=1")
	output, err := command.CombinedOutput()
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 1 || !strings.Contains(string(output), "product integration fixtures reject external DATABASE_URL") {
		t.Fatalf("external database refusal exit=%v output=%s", err, output)
	}
}

func TestProductFixtureFoundation(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	first := newProductFixture(t)
	second := newProductFixture(t)
	var serverVersion int
	if err := first.pool.QueryRow(ctx, `SELECT current_setting('server_version_num')::int`).Scan(&serverVersion); err != nil || serverVersion < 160000 || serverVersion >= 170000 {
		t.Fatalf("fixture PostgreSQL version=%d err=%v", serverVersion, err)
	}
	var templateConnections int
	var templateAllowsConnections bool
	if err := first.server.admin.QueryRow(ctx, `SELECT datallowconn, (SELECT count(*) FROM pg_stat_activity WHERE datname=$1) FROM pg_database WHERE datname=$1`, productTemplateDatabase).Scan(&templateAllowsConnections, &templateConnections); err != nil || templateAllowsConnections || templateConnections != 0 {
		t.Fatalf("migrated template allows connections=%v active=%d err=%v", templateAllowsConnections, templateConnections, err)
	}
	migrations, err := goose.CollectMigrations("../../db/migrations", 0, math.MaxInt64)
	if err != nil {
		t.Fatal(err)
	}
	want := migrations[len(migrations)-1].Version
	for _, fixture := range []*productFixture{first, second} {
		var version int64
		if err := fixture.pool.QueryRow(ctx, `SELECT max(version_id) FROM goose_db_version WHERE is_applied`).Scan(&version); err != nil || version != want {
			t.Fatalf("product migration version=%d want=%d err=%v", version, want, err)
		}
		rows, err := fixture.pool.Query(ctx, `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'goose_db_version' ORDER BY tablename`)
		if err != nil {
			t.Fatal(err)
		}
		var tables []string
		for rows.Next() {
			var table string
			if err := rows.Scan(&table); err != nil {
				rows.Close()
				t.Fatal(err)
			}
			tables = append(tables, table)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		if len(tables) == 0 {
			t.Fatal("migrations created no product tables")
		}
		for _, table := range tables {
			var count int64
			if err := fixture.pool.QueryRow(ctx, "SELECT count(*) FROM "+pgx.Identifier{table}.Sanitize()).Scan(&count); err != nil || count != 0 {
				t.Fatalf("migrations-only fixture table=%s rows=%d err=%v", table, count, err)
			}
		}
	}
	const publicID = "10000000-0000-4000-8000-000000000001"
	const insert = `INSERT INTO members(public_id,discord_id,handle,display_name) VALUES($1,'fixture-player','fixture-player','Fixture player')`
	runner := db.NewRunner(first.pool, func(tx pgx.Tx) pgx.Tx { return tx })
	if err := runner.Do(ctx, func(tx pgx.Tx) error { _, err := tx.Exec(ctx, insert, publicID); return err }); err != nil {
		t.Fatal(err)
	}
	runtime := wireForTest(ctx, config.Config{DatabaseURL: first.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-product-fixture-key"})
	if runtime.Pool == nil || runtime.Members == nil || runtime.Authority == nil {
		t.Fatal("Wire did not select real PostgreSQL dependencies")
	}
	t.Cleanup(runtime.Pool.Close)
	member, err := runtime.Members.GetByID(ctx, publicID)
	if err != nil || member.ID != publicID || member.Handle != "fixture-player" {
		t.Fatalf("production Wire readback member=%+v err=%v", member, err)
	}
	var count int64
	if err := second.pool.QueryRow(ctx, `SELECT count(*) FROM members`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("independent fixture observed another scenario's commit: rows=%d err=%v", count, err)
	}
	refused := errors.New("rollback fixture scenario")
	if err := runner.Do(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE members SET display_name='must roll back' WHERE public_id=$1`, publicID); err != nil {
			return err
		}
		return refused
	}); !errors.Is(err, refused) {
		t.Fatalf("rollback result=%v", err)
	}
	member, err = runtime.Members.GetByID(ctx, publicID)
	if err != nil || member.DisplayName != "Fixture player" {
		t.Fatalf("committed scenario changed after rollback: member=%+v err=%v", member, err)
	}
	var automaticallyCleanedDatabase string
	t.Run("registered cleanup drops database", func(t *testing.T) {
		automaticallyCleanedDatabase = newProductFixture(t).databaseName
	})
	if err := first.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, automaticallyCleanedDatabase).Scan(&count); err != nil || count != 0 {
		t.Fatalf("subtest cleanup left database: count=%d err=%v", count, err)
	}
	name := second.databaseName
	if err := second.close(); err != nil {
		t.Fatal(err)
	}
	if err := first.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, name).Scan(&count); err != nil || count != 0 {
		t.Fatalf("closed fixture database still exists: count=%d err=%v", count, err)
	}
}
