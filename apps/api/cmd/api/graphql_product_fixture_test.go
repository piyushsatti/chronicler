//go:build integration

package main

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

const productTemplateDatabase = "product_template"

type productFixture struct {
	*dbtest.ProductFixture
	pool         *db.Pool
	databaseURL  string
	databaseName string
	server       struct{ admin *db.Pool }
}

// cmdAPIDdb is the process sheet source. It fails closed, like fixtureDdbSource with no double.
type cmdAPIDdb struct{}

func (cmdAPIDdb) Fetch(context.Context, string) (character.DdbSnapshot, character.DdbProvenance, error) {
	return character.DdbSnapshot{}, character.DdbProvenance{}, character.DdbError{Code: character.DdbErrorUnavailable}
}

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, "product fixture process cleanup:", err)
		code = 1
	}
	os.Exit(code)
}

func wireForTest(ctx context.Context, cfg config.Config) app.API {
	return app.Wire(ctx, cfg, app.WithDdbClient(cmdAPIDdb{}))
}

func newProductFixture(t *testing.T) *productFixture {
	t.Helper()
	actual := dbtest.NewProductFixture(t)
	fixture := &productFixture{ProductFixture: actual, pool: actual.Pool, databaseURL: actual.DatabaseURL, databaseName: actual.DatabaseName}
	fixture.server.admin = actual.Admin
	return fixture
}
func (f *productFixture) close() error { return f.Close() }
