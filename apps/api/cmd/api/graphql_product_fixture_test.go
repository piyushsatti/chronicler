//go:build integration

package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
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

// cmdAPIDdbTransport panics so a swallowed fetch error still fails the test that dialed.
type cmdAPIDdbTransport struct{}

func (cmdAPIDdbTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	panic("blocked D&D Beyond host " + req.URL.Hostname())
}

func TestMain(m *testing.M) {
	app.UseTestDdbClient(cmdAPIDdb{})
	character.UseDdbHTTPTransportForTests(cmdAPIDdbTransport{})
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, "product fixture process cleanup:", err)
		code = 1
	}
	os.Exit(code)
}

func TestCmdAPIBlocksDdbHTTP(t *testing.T) {
	client, err := character.NewProductionDdbHTTPClient()
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodGet, "https://character-service.dndbeyond.com/character/v5/character/1", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		message, _ := recover().(string)
		if !strings.Contains(message, "blocked D&D Beyond host character-service.dndbeyond.com") {
			t.Fatalf("D&D Beyond call was not blocked: %q", message)
		}
	}()
	resp, err := client.Do(req)
	if resp != nil {
		resp.Body.Close()
	}
	t.Fatalf("production client returned from D&D Beyond: resp=%v err=%v", resp, err)
}
func newProductFixture(t *testing.T) *productFixture {
	t.Helper()
	actual := dbtest.NewProductFixture(t)
	fixture := &productFixture{ProductFixture: actual, pool: actual.Pool, databaseURL: actual.DatabaseURL, databaseName: actual.DatabaseName}
	fixture.server.admin = actual.Admin
	return fixture
}
func (f *productFixture) close() error { return f.Close() }
