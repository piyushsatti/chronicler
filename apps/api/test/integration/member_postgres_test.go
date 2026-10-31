//go:build integration

package integration_test

import (
	"bytes"
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
	id, roles, _, _, err := store.EnsureFromDiscord(ctx, discordID, "Integration", "https://fixture.invalid/initial.png")
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
	if !reflect.DeepEqual(roles, []auth.Role{auth.Guest}) {
		t.Fatalf("new member roles=%v", roles)
	}
	var initialized bool
	if err := pool.QueryRow(ctx, `SELECT display_name='Integration' AND avatar_url='https://fixture.invalid/initial.png' AND handle=$2 AND status='active' AND roles=ARRAY['guest']::text[] FROM members WHERE public_id=$1`, id, discordID[:32]).Scan(&initialized); err != nil || !initialized {
		t.Fatalf("first-login initialization=%v err=%v", initialized, err)
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
			for _, localAvatar := range []any{"https://fixture.invalid/local.png", nil} {
				if _, err := pool.Exec(ctx, `UPDATE members SET handle=$2,roles=$3,status=$4,display_name='Locally edited name',avatar_url=$5,updated_at=now()-interval '1 day' WHERE public_id=$1::uuid`, id, custom, wantRoles, status, localAvatar); err != nil {
					t.Fatal(err)
				}
				var before []byte
				if err := pool.QueryRow(ctx, `SELECT to_jsonb(m) FROM members m WHERE public_id=$1::uuid`, id).Scan(&before); err != nil {
					t.Fatal(err)
				}
				for _, discord := range [][2]string{{"Fresh Discord Display", "https://fixture.invalid/fresh.png"}, {"", ""}} {
					again, roles, _, _, err := store.EnsureFromDiscord(ctx, discordID, discord[0], discord[1])
					if err != nil || again != id || !reflect.DeepEqual(roles, []auth.Role{auth.DM, auth.Role("archon"), auth.Admin}) {
						t.Fatalf("repeat id=%q roles=%v err=%v", again, roles, err)
					}
					got, err := store.GetByID(ctx, id)
					if err != nil {
						t.Fatal(err)
					}
					var after []byte
					if err := pool.QueryRow(ctx, `SELECT to_jsonb(m) FROM members m WHERE public_id=$1::uuid`, id).Scan(&after); err != nil {
						t.Fatal(err)
					}
					if !bytes.Equal(before, after) || got.ID != id || got.DiscordID != discordID || got.Handle != custom || string(got.Status) != status || !reflect.DeepEqual(got.Roles, wantRoles) || got.DisplayName != "Locally edited name" {
						t.Fatalf("repeat login changed stored local profile/authority: before=%s after=%s member=%+v", before, after, got)
					}
				}
			}
			var count, ledger int
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM members WHERE discord_id=$1`, discordID).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM role_changes WHERE member_id=(SELECT id FROM members WHERE public_id=$1::uuid)`, id).Scan(&ledger); err != nil {
				t.Fatal(err)
			}
			if count != 1 || ledger != 0 {
				t.Fatalf("repeat rows=%d rolechanges=%d", count, ledger)
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
			wantRoles := []auth.Role{auth.Guest}
			wantStatus := "active"
			var before []byte
			if existing {
				var err error
				id, _, _, _, err = store.EnsureFromDiscord(ctx, discordID, "First", "")
				if err != nil {
					t.Fatal(err)
				}
				custom = "custom-" + uuid.NewString()
				wantRoles = []auth.Role{auth.DM, auth.Admin}
				wantStatus = "inactive"
				if _, err := pool.Exec(ctx, `UPDATE members SET handle=$2,roles=ARRAY['dm','admin'],status='inactive',display_name='Local concurrent profile',avatar_url=NULL,updated_at=now()-interval '1 day' WHERE public_id=$1::uuid`, id, custom); err != nil {
					t.Fatal(err)
				}
				if err := pool.QueryRow(ctx, `SELECT to_jsonb(m) FROM members m WHERE public_id=$1::uuid`, id).Scan(&before); err != nil {
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
			if err := pool.QueryRow(ctx, `SELECT COALESCE(avatar_url,'') FROM members WHERE public_id=$1::uuid`, id).Scan(&avatar); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM members WHERE discord_id=$1`, discordID).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if existing {
				var after []byte
				if err := pool.QueryRow(ctx, `SELECT to_jsonb(m) FROM members m WHERE public_id=$1::uuid`, id).Scan(&after); err != nil || !bytes.Equal(before, after) {
					t.Fatalf("concurrent login changed stored local row: before=%s after=%s err=%v", before, after, err)
				}
			} else {
				var writer int
				if _, err := fmt.Sscanf(got.DisplayName, "Display %d", &writer); err != nil || writer < 0 || writer >= 8 || avatar != fmt.Sprintf("https://fixture.invalid/%d.png", writer) {
					t.Fatalf("first-login profile pair=%+v avatar=%s err=%v", got, avatar, err)
				}
			}
			if string(got.Status) != wantStatus || count != 1 {
				t.Fatalf("concurrent preservation=%+v avatar=%s count=%d", got, avatar, count)
			}
			if existing && got.Handle != custom {
				t.Fatal("custom handle reset")
			}
			if !existing && got.Handle != discordID[:32] {
				t.Fatal("new member handle convention changed")
			}
			var settled, repeated []byte
			if err := pool.QueryRow(ctx, `SELECT to_jsonb(m) FROM members m WHERE public_id=$1::uuid`, id).Scan(&settled); err != nil {
				t.Fatal(err)
			}
			again, roles, _, _, err := store.EnsureFromDiscord(ctx, discordID, "After concurrent login", "")
			if err != nil || again != id || !reflect.DeepEqual(roles, wantRoles) {
				t.Fatalf("after concurrency id=%s roles=%v err=%v", again, roles, err)
			}
			if err := pool.QueryRow(ctx, `SELECT to_jsonb(m) FROM members m WHERE public_id=$1::uuid`, id).Scan(&repeated); err != nil || !bytes.Equal(settled, repeated) {
				t.Fatalf("repeat changed settled concurrent profile: before=%s after=%s err=%v", settled, repeated, err)
			}
			if strings.Contains(avatar, "discord.com") {
				t.Fatal("synthetic persistence proof must not require provider transport")
			}
		})
	}
}
