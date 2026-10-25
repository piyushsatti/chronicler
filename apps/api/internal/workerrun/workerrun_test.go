package workerrun

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

func TestRequireDatabaseRefusesMemoryFallback(t *testing.T) {
	cfg := config.Config{DatabaseURL: "postgres://x:y@127.0.0.1:1/z?sslmode=disable", RequireDatabase: true}
	if _, err := configureWorker(context.Background(), cfg); err == nil {
		t.Fatal("expected error when postgres unavailable and database required")
	}
}
