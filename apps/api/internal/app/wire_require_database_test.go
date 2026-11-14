package app

import (
	"context"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

func TestWirePanicsWhenDatabaseRequiredAndUnreachable(t *testing.T) {
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected panic")
		}
		msg, ok := r.(string)
		if !ok || !strings.HasPrefix(msg, "database required:") {
			t.Fatalf("panic = %#v, want string starting with database required:", r)
		}
	}()
	Wire(context.Background(), config.Config{
		DatabaseURL:     "postgres://x:y@127.0.0.1:1/z?sslmode=disable",
		RequireDatabase: true,
	})
}
