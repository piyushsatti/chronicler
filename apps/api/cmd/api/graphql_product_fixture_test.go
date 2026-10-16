//go:build integration

package main

import (
	"fmt"
	"os"
	"testing"

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

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, "product fixture process cleanup:", err)
		code = 1
	}
	os.Exit(code)
}
func newProductFixture(t *testing.T) *productFixture {
	t.Helper()
	actual := dbtest.NewProductFixture(t)
	fixture := &productFixture{ProductFixture: actual, pool: actual.Pool, databaseURL: actual.DatabaseURL, databaseName: actual.DatabaseName}
	fixture.server.admin = actual.Admin
	return fixture
}
func (f *productFixture) close() error { return f.Close() }
