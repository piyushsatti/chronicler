//go:build integration

package site

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

type siteQueryErrorDB struct {
	dbgen.DBTX
	err error
}

func (db siteQueryErrorDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, db.err
}

func TestProductPostgresReadsSiteSnapshotAndMemberSearch(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	insertMember := func(discordID, handle, display string, roles []string, avatar *string) uuid.UUID {
		t.Helper()
		var publicID uuid.UUID
		if err := fixture.Pool.QueryRow(ctx,
			`INSERT INTO members(discord_id,handle,display_name,roles,avatar_url)
			 VALUES($1,$2,$3,$4,$5) RETURNING public_id`,
			discordID, handle, display, roles, avatar).Scan(&publicID); err != nil {
			t.Fatal(err)
		}
		return publicID
	}
	memberOne := insertMember("site-adapter-one", "adapter-one", "Adapter One", []string{"player", "dm"}, nil)
	memberTwo := insertMember("site-adapter-two", "adapter-two", "Adapter Two", []string{"player"}, ptrString("https://avatar.invalid/two"))
	for i, event := range []struct {
		kind   string
		amount float64
	}{{"voice", 5.5}, {"message", 3}, {"reaction", 2}} {
		if _, err := fixture.Pool.Exec(ctx,
			`INSERT INTO discord_activity_events(event_id,kind,discord_user_id,channel_id,occurred_at,amount)
			 VALUES($1,$2,$3,'site-adapter-channel',now(),$4)`,
			fmt.Sprintf("site-adapter-event-%d", i), event.kind, "site-adapter-one", event.amount); err != nil {
			t.Fatal(err)
		}
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatalf("construct Site Postgres adapter: %v", err)
	}

	snapshot, err := adapter.ReadHomeCommunity(ctx, auth.Authority{}, HomeSpec{})
	if err != nil {
		t.Fatalf("read community snapshot: %v", err)
	}
	roles := map[string]int32{}
	for _, role := range snapshot.MembersByRole {
		roles[role.Key] = role.Count
	}
	if snapshot.TotalMembers < 2 || roles["player"] < 2 || roles["dm"] < 1 {
		t.Fatalf("snapshot totals=%+v roles=%v, want stored members and multi-role membership", snapshot, roles)
	}
	if snapshot.Activity.VoiceMinutes < 5.5 || snapshot.Activity.Messages < 3 || snapshot.Activity.Reactions < 2 {
		t.Fatalf("activity=%+v, want stored event sums", snapshot.Activity)
	}
	stats, err := adapter.ReadSiteStats(ctx, auth.Authority{}, SiteStatsSpec{})
	if err != nil || !reflect.DeepEqual(stats, snapshot) {
		t.Fatalf("site stats=%+v err=%v, want same stored snapshot %+v", stats, err, snapshot)
	}

	page, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "adapter-", Limit: 10, Offset: 0})
	if err != nil {
		t.Fatalf("read member search: %v", err)
	}
	if page.Total != 2 || len(page.Items) != 2 || page.Order != "handle_asc_id_asc" {
		t.Fatalf("page=%+v, want two matches in canonical order", page)
	}
	if page.Items[0].MemberId != memberOne.String() || page.Items[0].AvatarUrl != nil ||
		page.Items[1].MemberId != memberTwo.String() || page.Items[1].AvatarUrl == nil || *page.Items[1].AvatarUrl != "https://avatar.invalid/two" {
		t.Fatalf("search items=%+v, want public IDs and nullable avatars", page.Items)
	}

	latePage, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "adapter-", Limit: 1, Offset: 9})
	if err != nil || latePage.Total != 2 || len(latePage.Items) != 0 {
		t.Fatalf("beyond-end page=%+v err=%v, want empty page with total 2", latePage, err)
	}
	empty, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "no-such-site-adapter-member", Limit: 5})
	if err != nil || empty.Total != 0 || len(empty.Items) != 0 {
		t.Fatalf("empty search=%+v err=%v, want successful zero-result query", empty, err)
	}

	insertMember("site-adapter-unicode-upper", "Éclair", "Unicode upper", []string{"player"}, nil)
	insertMember("site-adapter-unicode-lower", "école", "Unicode lower", []string{"player"}, nil)
	unicode, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "é", Limit: 10})
	if err != nil || unicode.Total != 2 || len(unicode.Items) != 2 {
		t.Fatalf("unicode search=%+v err=%v, want both case-folded prefixes", unicode, err)
	}
	insertMember("site-adapter-wildcard", "%_literal", "Wildcard literal", []string{"player"}, nil)
	wildcard, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "%_", Limit: 10})
	if err != nil || wildcard.Total != 1 || len(wildcard.Items) != 1 || wildcard.Items[0].Handle != "%_literal" {
		t.Fatalf("literal wildcard search=%+v err=%v, want one literal prefix", wildcard, err)
	}
}

func TestProductPostgresPropagatesDatabaseReadFailures(t *testing.T) {
	want := errors.New("database unavailable")
	adapter, err := NewProductPostgres(siteQueryErrorDB{err: want})
	if err != nil {
		t.Fatalf("construct Site Postgres adapter: %v", err)
	}
	if _, err := adapter.ReadHomeCommunity(context.Background(), auth.Authority{}, HomeSpec{}); !errors.Is(err, want) {
		t.Fatalf("community error=%v, want original database error", err)
	}
	if _, err := adapter.ReadMemberSearch(context.Background(), auth.Authority{}, SearchSpec{Query: "x", Limit: 1}); !errors.Is(err, want) {
		t.Fatalf("search error=%v, want original database error", err)
	}
}

func ptrString(value string) *string { return &value }
