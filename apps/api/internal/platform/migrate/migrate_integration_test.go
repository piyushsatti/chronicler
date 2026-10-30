//go:build integration

package migrate

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

// The deployed DATABASE_URL carries pgxpool settings; migrate must not send them to Postgres.
func TestUpAcceptsPoolDSN(t *testing.T) {
	dsn := dbtest.DSN(t)
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	if err := Up(context.Background(), dsn+sep+"pool_max_conns=10", io.Discard); err != nil {
		t.Fatal(err)
	}
}
