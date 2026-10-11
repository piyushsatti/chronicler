//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMemberUpsertAndLoad(t *testing.T) {
	ctx := context.Background()
	pool := memberFixturePool(t)

	store := member.NewPostgresStore(pool.Pool)
	discordID := "integration-" + uuid.NewString()
	cleanupMember(t, pool, discordID)
	id, roles, _, _, err := store.EnsureFromDiscord(ctx, discordID, "Integration", "")
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
	if !reflect.DeepEqual(roles, []auth.Role{auth.Player}) {
		t.Fatalf("new member roles=%v", roles)
	}
}

func memberFixturePool(t *testing.T) *db.Pool {
	t.Helper()
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("member persistence proof requires ephemeral Postgres; omit DATABASE_URL")
	}
	return dbtest.Pool(t)
}

func cleanupMember(t *testing.T, pool *db.Pool, discordID string) {
	t.Helper()
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM members WHERE discord_id=$1`, discordID); err != nil {
			t.Errorf("fixture cleanup: %v", err)
		}
	})
}

func TestMemberRepeatLoginPreservesUUIDStatusHandleAndFlatRoles(t *testing.T) {
	for _, status := range []string{"active", "inactive", "banned"} {
		t.Run(status, func(t *testing.T) {
			ctx := context.Background()
			pool := memberFixturePool(t)
			store := member.NewPostgresStore(pool.Pool)
			discordID := "repeat-" + uuid.NewString()
			cleanupMember(t, pool, discordID)
			id, _, _, _, err := store.EnsureFromDiscord(ctx, discordID, "First", "https://fixture.invalid/first.png")
			if err != nil {
				t.Fatal(err)
			}
			custom := "custom-" + uuid.NewString()
			wantRoles := []string{"dm", "archon", "admin"}
			if _, err := pool.Exec(ctx, `UPDATE members SET handle=$2,roles=$3,status=$4 WHERE public_id=$1::uuid`, id, custom, wantRoles, status); err != nil {
				t.Fatal(err)
			}
			again, roles, _, _, err := store.EnsureFromDiscord(ctx, discordID, "Fresh Display", "https://fixture.invalid/fresh.png")
			if err != nil || again != id || !reflect.DeepEqual(roles, []auth.Role{auth.DM, auth.Role("archon"), auth.Admin}) {
				t.Fatalf("repeat id=%q roles=%v err=%v", again, roles, err)
			}
			got, err := store.GetByID(ctx, id)
			if err != nil {
				t.Fatal(err)
			}
			var avatar string
			var count, ledger int
			if err := pool.QueryRow(ctx, `SELECT avatar_url FROM members WHERE public_id=$1::uuid`, id).Scan(&avatar); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM members WHERE discord_id=$1`, discordID).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM role_changes WHERE member_id=(SELECT id FROM members WHERE public_id=$1::uuid)`, id).Scan(&ledger); err != nil {
				t.Fatal(err)
			}
			if got.ID != id || got.DiscordID != discordID || got.Handle != custom || string(got.Status) != status || !reflect.DeepEqual(got.Roles, wantRoles) || got.DisplayName != "Fresh Display" || avatar != "https://fixture.invalid/fresh.png" || count != 1 || ledger != 0 {
				t.Fatalf("preservation=%+v avatar=%s rows=%d rolechanges=%d", got, avatar, count, ledger)
			}
			// Missing custom avatar is a real profile refresh, not an old URL fallback.
			if _, _, _, _, err := store.EnsureFromDiscord(ctx, discordID, "No Avatar", ""); err != nil {
				t.Fatal(err)
			}
			var missing bool
			if err := pool.QueryRow(ctx, `SELECT avatar_url IS NULL FROM members WHERE public_id=$1::uuid`, id).Scan(&missing); err != nil || !missing {
				t.Fatalf("avatar clear=%v err=%v", missing, err)
			}
		})
	}
}

func TestMemberConcurrentLoginsConvergeWithoutAuthorityReset(t *testing.T) {
	for _, existing := range []bool{false, true} {
		t.Run(fmt.Sprintf("existing=%v", existing), func(t *testing.T) {
			ctx := context.Background()
			pool := memberFixturePool(t)
			store := member.NewPostgresStore(pool.Pool)
			discordID := "concurrent-" + uuid.NewString()
			cleanupMember(t, pool, discordID)
			id, custom := "", ""
			wantRoles := []auth.Role{auth.Player}
			wantStatus := "active"
			if existing {
				var err error
				id, _, _, _, err = store.EnsureFromDiscord(ctx, discordID, "First", "")
				if err != nil {
					t.Fatal(err)
				}
				custom = "custom-" + uuid.NewString()
				wantRoles = []auth.Role{auth.DM, auth.Admin}
				wantStatus = "inactive"
				if _, err := pool.Exec(ctx, `UPDATE members SET handle=$2,roles=ARRAY['dm','admin'],status='inactive' WHERE public_id=$1::uuid`, id, custom); err != nil {
					t.Fatal(err)
				}
			}
			type result struct {
				id    string
				roles []auth.Role
				err   error
			}
			results := make(chan result, 8)
			start := make(chan struct{})
			var group sync.WaitGroup
			for i := 0; i < 8; i++ {
				group.Add(1)
				go func(i int) {
					defer group.Done()
					<-start
					got, roles, _, _, err := store.EnsureFromDiscord(ctx, discordID, fmt.Sprintf("Display %d", i), fmt.Sprintf("https://fixture.invalid/%d.png", i))
					results <- result{got, roles, err}
				}(i)
			}
			close(start)
			group.Wait()
			close(results)
			for got := range results {
				if got.err != nil {
					t.Fatal(got.err)
				}
				if id == "" {
					id = got.id
				}
				if got.id != id || !reflect.DeepEqual(got.roles, wantRoles) {
					t.Fatalf("concurrent result=%+v expected id=%s roles=%v", got, id, wantRoles)
				}
			}
			got, err := store.GetByID(ctx, id)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := uuid.Parse(id); err != nil {
				t.Fatalf("public ID=%s err=%v", id, err)
			}
			var avatar string
			var count int
			if err := pool.QueryRow(ctx, `SELECT avatar_url FROM members WHERE public_id=$1::uuid`, id).Scan(&avatar); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM members WHERE discord_id=$1`, discordID).Scan(&count); err != nil {
				t.Fatal(err)
			}
			var writer int
			if _, err := fmt.Sscanf(got.DisplayName, "Display %d", &writer); err != nil || writer < 0 || writer >= 8 {
				t.Fatalf("display=%s err=%v", got.DisplayName, err)
			}
			if string(got.Status) != wantStatus || avatar != fmt.Sprintf("https://fixture.invalid/%d.png", writer) || count != 1 {
				t.Fatalf("concurrent preservation=%+v avatar=%s count=%d", got, avatar, count)
			}
			if existing && got.Handle != custom {
				t.Fatal("custom handle reset")
			}
			if !existing && got.Handle != discordID[:32] {
				t.Fatal("new member handle convention changed")
			}
			if strings.Contains(avatar, "discord.com") {
				t.Fatal("synthetic persistence proof must not require provider transport")
			}
		})
	}
}
