//go:build integration

package integration_test

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMemberUpsertAndLoad(t *testing.T) {
	ctx := context.Background()
	pool := dbtest.Pool(t)

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
