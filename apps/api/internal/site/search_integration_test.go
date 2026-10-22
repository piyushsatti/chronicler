//go:build integration

package site

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestHybridSearchPagesEachCompleteFamily(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	for _, handle := range []string{"needle-c", "needle-a", "needle-b", "%_literal", "%x_other"} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1,$2,$2,$2,ARRAY['player'],'active')`, uuid.NewString(), handle); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"90000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000003", "90000000-0000-4000-8000-000000000002"} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,updated_at) VALUES($1::uuid,'codex_entry',$1::text,'Needle','published','public','Safe body','2026-10-20T00:00:00Z')`, id); err != nil {
			t.Fatal(err)
		}
	}
	siteReader, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	docReader, err := document.NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPoolPolicy(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	queries, err := NewProductQueries(ProductReadRepos{Site: siteReader}, policy, time.Now, observer, docReader)
	if err != nil {
		t.Fatal(err)
	}
	search := func(query string, kinds []string, offset int32) SearchResultView {
		t.Helper()
		result, err := queries.Search(ctx, auth.Authority{}, SearchSpec{Query: query, Kinds: kinds, Limit: 1, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	second := search("needle", nil, 1)
	if second.DocumentTotal != 3 || second.MemberTotal != 3 || len(second.Documents) != 1 || second.Documents[0].Id != "90000000-0000-4000-8000-000000000002" || len(second.Members) != 1 || second.Members[0].Handle != "needle-b" || second.DocumentOrder != "rank_desc_updated_at_desc_id_desc" || second.MemberOrder != "handle_asc_id_asc" {
		t.Fatalf("second page=%+v", second)
	}
	beyond := search("needle", nil, 9)
	if beyond.DocumentTotal != 3 || beyond.MemberTotal != 3 || len(beyond.Documents) != 0 || len(beyond.Members) != 0 {
		t.Fatalf("beyond page=%+v", beyond)
	}
	none := search("needle", []string{}, 0)
	if none.DocumentTotal != 0 || none.MemberTotal != 0 || len(none.Documents) != 0 || len(none.Members) != 0 {
		t.Fatalf("empty kinds=%+v", none)
	}
	onlyMembers := search("needle", []string{"member"}, 0)
	if onlyMembers.DocumentTotal != 0 || onlyMembers.MemberTotal != 3 || len(onlyMembers.Documents) != 0 || len(onlyMembers.Members) != 1 {
		t.Fatalf("members=%+v", onlyMembers)
	}
	onlyDocs := search("needle", []string{"codex_entry"}, 0)
	if onlyDocs.DocumentTotal != 3 || onlyDocs.MemberTotal != 0 || len(onlyDocs.Documents) != 1 || len(onlyDocs.Members) != 0 {
		t.Fatalf("documents=%+v", onlyDocs)
	}
	wildcard := search("%_", []string{"member"}, 0)
	if wildcard.MemberTotal != 1 || len(wildcard.Members) != 1 || wildcard.Members[0].Handle != "%_literal" {
		t.Fatalf("literal prefix=%+v", wildcard)
	}
	_, err = queries.Search(ctx, auth.Authority{}, SearchSpec{Query: "needle", Kinds: []string{"member", "hex"}, Limit: 1})
	invalid, ok := errors.AsType[*apierr.Error](err)
	if !ok || invalid.Code != apierr.Invalid {
		t.Fatalf("unknown kind error=%v", err)
	}
}
