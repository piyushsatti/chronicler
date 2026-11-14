//go:build integration

package integration_test

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestStatementTimeoutRuntimeParam(t *testing.T) {
	ctx := context.Background()
	dsn := dbtest.DSN(t)

	production, err := db.Connect(ctx, dsn, db.ConnectOptions(string(config.EnvProduction))...)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(production.Close)

	var productionTimeout string
	if err := production.QueryRow(ctx, "SHOW statement_timeout").Scan(&productionTimeout); err != nil {
		t.Fatal(err)
	}
	if productionTimeout != "10s" {
		t.Fatalf("production statement_timeout=%q want=10s", productionTimeout)
	}

	plain, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(plain.Close)

	var serverDefault string
	if err := plain.QueryRow(ctx, "SHOW statement_timeout").Scan(&serverDefault); err != nil {
		t.Fatal(err)
	}

	nonProduction, err := db.Connect(ctx, dsn, db.ConnectOptions(string(config.EnvTest))...)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(nonProduction.Close)

	var nonProductionTimeout string
	if err := nonProduction.QueryRow(ctx, "SHOW statement_timeout").Scan(&nonProductionTimeout); err != nil {
		t.Fatal(err)
	}
	if nonProductionTimeout != serverDefault {
		t.Fatalf("non-production statement_timeout=%q want server default %q", nonProductionTimeout, serverDefault)
	}

	fixture := dbtest.Pool(t)
	var fixtureTimeout string
	if err := fixture.QueryRow(ctx, "SHOW statement_timeout").Scan(&fixtureTimeout); err != nil {
		t.Fatal(err)
	}
	if fixtureTimeout != serverDefault {
		t.Fatalf("fixture statement_timeout=%q want server default %q", fixtureTimeout, serverDefault)
	}
}
