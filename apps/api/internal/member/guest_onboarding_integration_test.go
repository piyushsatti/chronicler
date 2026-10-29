//go:build integration

package member

import (
	"context"
	"reflect"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestNewDiscordMemberStartsGuestAndExistingRolesRemain(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	store, err := NewFromDBTX(fixture.Pool, "")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	id, roles, _, _, err := store.EnsureFromDiscord(ctx, "guest-discord", "New member", "")
	if err != nil || !reflect.DeepEqual(roles, []auth.Role{auth.Role("guest")}) {
		t.Fatalf("new roles=%v err=%v", roles, err)
	}
	for _, want := range [][]auth.Role{{auth.Role("guest")}, {auth.Player}, {auth.Player, auth.DM, auth.Admin}} {
		stored := make([]string, len(want))
		for i, role := range want {
			stored[i] = string(role)
		}
		if _, err := fixture.Pool.Exec(ctx, `UPDATE members SET roles=$2::text[] WHERE public_id=$1::uuid`, id, stored); err != nil {
			t.Fatal(err)
		}
		again, roles, _, _, err := store.EnsureFromDiscord(ctx, "guest-discord", "Changed profile", "")
		if err != nil || again != id || !reflect.DeepEqual(roles, want) {
			t.Fatalf("returning id=%s roles=%v want=%v err=%v", again, roles, want, err)
		}
	}
}
