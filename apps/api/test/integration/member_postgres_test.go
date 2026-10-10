//go:build integration

package integration_test

import (
	"context"
	"os"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

func TestMemberUpsertAndLoad(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	store := member.NewPostgresStore(pool.Pool)
	id, _, _, _, err := store.EnsureFromDiscord(ctx, "integration-test-user", "Integration", "")
	if err != nil {
		t.Fatalf("ensure: %v", err)
	}
	got, err := store.GetByID(ctx, id)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.DisplayName != "Integration" {
		t.Fatalf("display name = %q", got.DisplayName)
	}
}
