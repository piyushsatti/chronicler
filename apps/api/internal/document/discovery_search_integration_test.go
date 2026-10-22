//go:build integration

package document

import (
	"context"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestSearchDiscoveryUsesOnlyAuthorizedEffectiveBody(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	reader, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	actors := map[string]auth.Authority{"anonymous": {}}
	for _, member := range []struct {
		handle   string
		roles    []auth.Role
		dmStatus string
	}{
		{"author", []auth.Role{auth.Player}, ""},
		{"reader", []auth.Role{auth.Player}, ""},
		{"dm", []auth.Role{auth.Player, auth.DM}, "approved"},
		{"archon", []auth.Role{auth.Player, auth.Role("archon")}, ""},
		{"admin", []auth.Role{auth.Admin}, ""},
	} {
		id := uuid.NewString()
		roles := make([]string, len(member.roles))
		for i, role := range member.roles {
			roles[i] = string(role)
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1,$2,$2,$2,$3,'active')`, id, member.handle, roles); err != nil {
			t.Fatal(err)
		}
		actor, err := auth.NewAuthorityWithHandle(id, member.roles, "active", member.dmStatus, member.handle)
		if err != nil {
			t.Fatal(err)
		}
		actors[member.handle] = actor
	}
	updated := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	insert := func(id, kind, body, visibility string, policy any, author *string) {
		t.Helper()
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,policy,author_id,updated_at) VALUES($1::uuid,$2,$1::text,'Search fixture','published',$3,$4,$5,(SELECT id FROM members WHERE public_id=$6),$7)`, id, kind, visibility, body, policy, author, updated); err != nil {
			t.Fatal(err)
		}
	}
	author := actors["author"].Claims().MemberID
	first, second := "90000000-0000-4000-8000-000000000002", "90000000-0000-4000-8000-000000000001"
	insert(first, "codex_entry", "public lantern running\n> [!dm] obscuraxylophone", "public", nil, &author)
	insert(second, "codex_entry", "public lantern running\n> [!dm] obscuraxylophone", "public", nil, &author)
	named := uuid.NewString()
	insert(named, "rule", "> [!dm:@reader] namedcipher", "public", nil, &author)
	roleOnly := uuid.NewString()
	insert(roleOnly, "community", "guildcipher", "public", `["role:archon"]`, &author)
	legacy := uuid.NewString()
	insert(legacy, "summary", strings.Repeat("界", 241)+" orphanarchive", "public", nil, nil)
	restricted := uuid.NewString()
	insert(restricted, "rule", "readergrantcipher", "restricted", nil, &author)
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_readers(document_id,member_id) SELECT d.id,m.id FROM documents d,members m WHERE d.public_id=$1 AND m.public_id=$2`, restricted, actors["dm"].Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	search := func(actor, query string, kinds []string, limit, offset int32) DiscoveryPage {
		t.Helper()
		page, err := reader.SearchDiscovery(ctx, actors[actor], query, kinds, product.Page{Limit: limit, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		if page.Order != discoverySearchOrder || page.Items == nil {
			t.Fatalf("page=%+v", page)
		}
		return page
	}
	for _, tc := range []struct {
		actor, query string
		total        int32
	}{
		{"anonymous", "obscuraxylophone", 0}, {"reader", "obscuraxylophone", 0},
		{"archon", "obscuraxylophone", 0}, {"dm", "obscuraxylophone", 2},
		{"author", "obscuraxylophone", 2}, {"admin", "obscuraxylophone", 2},
		{"anonymous", "namedcipher", 0}, {"reader", "namedcipher", 1},
		{"dm", "namedcipher", 0}, {"author", "namedcipher", 1}, {"admin", "namedcipher", 1},
		{"reader", "guildcipher", 0}, {"archon", "guildcipher", 1},
		{"reader", "readergrantcipher", 0}, {"dm", "readergrantcipher", 1},
	} {
		t.Run(tc.actor+"/"+tc.query, func(t *testing.T) {
			if got := search(tc.actor, tc.query, nil, 20, 0); got.Total != tc.total {
				t.Fatalf("page=%+v want %d", got, tc.total)
			}
		})
	}
	for _, name := range []string{"dm", "reader"} {
		buckets, err := reader.RecentDiscovery(ctx, actors[name])
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, bucket := range buckets {
			for _, doc := range bucket.Documents {
				found = found || doc.Id == restricted
			}
		}
		if found != (name == "dm") {
			t.Fatalf("recent %s restricted-document presence=%t", name, found)
		}
		counts, err := reader.CountDiscovery(ctx, actors[name])
		if err != nil {
			t.Fatal(err)
		}
		var rules int32
		for _, count := range counts.ByKind {
			if count.Key == "rule" {
				rules = count.Count
			}
		}
		want := int32(1)
		if name == "dm" {
			want = 2
		}
		if rules != want {
			t.Fatalf("%s rule count=%d want %d", name, rules, want)
		}
	}
	before := search("anonymous", "lantern run", []string{"codex_entry"}, 1, 0)
	if before.Total != 2 || len(before.Items) != 1 || before.Items[0].Id != first || strings.Contains(before.Items[0].Snippet, "obscuraxylophone") {
		t.Fatalf("ranked=%+v", before)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET body=$2 WHERE public_id=$1`, second, "public lantern running\n> [!dm] "+strings.Repeat("lantern running obscuraxylophone ", 500)); err != nil {
		t.Fatal(err)
	}
	after := search("anonymous", "lantern run", []string{"codex_entry"}, 1, 0)
	if after.Total != before.Total || len(after.Items) != 1 || after.Items[0].Id != first || after.Items[0].Snippet != before.Items[0].Snippet {
		t.Fatalf("hidden edit changed rank/projection before=%+v after=%+v", before, after)
	}
	secondPage := search("anonymous", "lantern run", []string{"codex_entry"}, 1, 1)
	if secondPage.Total != 2 || len(secondPage.Items) != 1 || secondPage.Items[0].Id != second {
		t.Fatalf("second page=%+v", secondPage)
	}
	beyond := search("anonymous", "lantern", nil, 1, 9)
	if beyond.Total != 2 || len(beyond.Items) != 0 {
		t.Fatalf("beyond=%+v", beyond)
	}
	orphan := search("anonymous", "orphanarchive", nil, 20, 0)
	if orphan.Total != 1 || len(orphan.Items) != 1 || orphan.Items[0].Id != legacy || utf8.RuneCountInString(orphan.Items[0].Snippet) != 240 || orphan.Items[0].Snippet != strings.Repeat("界", 240) {
		t.Fatalf("historical nullable-author hit=%+v", orphan)
	}
	if got := search("anonymous", "lantern", []string{}, 20, 0); got.Total != 0 || len(got.Items) != 0 {
		t.Fatalf("empty kinds=%+v", got)
	}
	if got := search("anonymous", "lantern", []string{"member"}, 20, 0); got.Total != 0 || len(got.Items) != 0 {
		t.Fatalf("member kinds=%+v", got)
	}
	if got := search("anonymous", "lantern", []string{"rule"}, 20, 0); got.Total != 0 {
		t.Fatalf("wrong document kind=%+v", got)
	}
	if got := search("anonymous", "the", nil, 20, 0); got.Total != 0 {
		t.Fatalf("stopword query=%+v", got)
	}
	if got := search("anonymous", "lantern missingterm", nil, 20, 0); got.Total != 0 {
		t.Fatalf("plain full text must require every token=%+v", got)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET body=$2,updated_at=$3 WHERE public_id=$1`, second, strings.Repeat("lantern running ", 20), updated.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if ranked := search("anonymous", "lantern run", nil, 1, 0); len(ranked.Items) != 1 || ranked.Items[0].Id != second {
		t.Fatalf("rank must precede timestamp=%+v", ranked)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET body=$2,updated_at=$3 WHERE public_id=$1`, second, "public lantern running\n> [!dm] obscuraxylophone", updated.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if newest := search("anonymous", "lantern run", nil, 1, 0); len(newest.Items) != 1 || newest.Items[0].Id != second {
		t.Fatalf("equal-rank timestamp ordering=%+v", newest)
	}
}

func TestSearchDiscoveryQuestIdentityComesFromAuthorizedBrief(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	authorID := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1,'quest-search-author','quest-search-author','Quest Author',ARRAY['dm'],'active')`, authorID); err != nil {
		t.Fatal(err)
	}
	for _, brief := range []struct{ code, visibility string }{{"Q-SAFE", "public"}, {"Q-PRIVATE", "dm_only"}} {
		id := uuid.NewString()
		if _, err := fixture.Pool.Exec(ctx, `WITH brief AS (
		 INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id)
		 VALUES($1::uuid,'quest_brief',$1::text,'Quest brief','published',$2,'questlinkcipher',(SELECT id FROM members WHERE public_id=$3)) RETURNING id,author_id)
		 INSERT INTO quests(public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by)
		 SELECT $4,$5,ARRAY['standard'],author_id,now()+interval '1 day',id,author_id FROM brief`, id, brief.visibility, authorID, uuid.NewString(), brief.code); err != nil {
			t.Fatal(err)
		}
	}
	reader, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	page, err := reader.SearchDiscovery(ctx, auth.Authority{}, "questlinkcipher", nil, product.Page{Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].QuestShortCode == nil || *page.Items[0].QuestShortCode != "Q-SAFE" {
		t.Fatalf("authorized association=%+v", page)
	}
}
