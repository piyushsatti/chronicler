package graph

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
)

type searchDiscovery struct {
	calls int
	query string
	kinds []string
	page  product.Page
	out   document.DiscoveryPage
}

func (s *searchDiscovery) SearchDiscovery(_ context.Context, _ auth.Authority, query string, kinds []string, page product.Page) (document.DiscoveryPage, error) {
	s.query, s.kinds, s.page = query, kinds, page
	s.calls++
	return s.out, nil
}
func (*searchDiscovery) RecentDiscovery(context.Context, auth.Authority) ([]document.DiscoveryBucket, error) {
	return nil, nil
}
func (*searchDiscovery) CountDiscovery(context.Context, auth.Authority) (document.DiscoveryCounts, error) {
	return document.DiscoveryCounts{}, nil
}

type searchSiteRepo struct {
	site.SiteReadRepository
	last  site.SearchSpec
	calls int
}

func (r *searchSiteRepo) ReadMemberSearch(_ context.Context, _ auth.Authority, spec site.SearchSpec) (site.MemberDiscoveryPage, error) {
	r.last = spec
	r.calls++
	return site.MemberDiscoveryPage{Items: []member.MemberSearchHitView{{MemberId: "member-id", Handle: "alpha", DisplayName: "Alpha"}}, Total: 3, Order: "handle_asc_id_asc"}, nil
}
func (*searchSiteRepo) ReadSearchableKinds(context.Context, auth.Authority, site.SearchableKindsSpec) ([]site.SearchKindView, error) {
	out := []site.SearchKindView{}
	for _, kind := range site.SearchableKinds() {
		out = append(out, site.SearchKindView{Key: kind.Key, Label: kind.Label, Searchable: kind.Searchable})
	}
	return out, nil
}

type searchAudience struct{}

func (searchAudience) Assess(_ context.Context, _ auth.AudienceContext, refs []auth.DocumentRef) (auth.AudienceAssessment, error) {
	out := make([]auth.AudienceResult, len(refs))
	for i, ref := range refs {
		out[i] = auth.AudienceResult{SubjectID: ref.ID, Outcome: auth.AudienceOrdinary}
	}
	return auth.AudienceAssessment{Results: out}, nil
}
func (searchAudience) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, nil
}
func (searchAudience) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, nil
}
func (searchAudience) HasLieutenant(context.Context, string, string) (bool, error) {
	return false, nil
}
func (searchAudience) HasArchon(context.Context, string, string) (bool, error) {
	return false, nil
}

func testHybridSearchResolver(t *testing.T, repo *searchSiteRepo, discovery *searchDiscovery) *Resolver {
	t.Helper()
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments: searchAudience{}, Audience: searchAudience{}, Identities: searchAudience{}, SummaryRelationships: searchAudience{},
	})
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	queries, err := site.NewProductQueries(site.ProductReadRepos{Site: repo}, policy, time.Now, observer, discovery)
	if err != nil {
		t.Fatal(err)
	}
	return &Resolver{Services: Services{SiteQueries: queries}}
}

func anonymousSearchContext(t *testing.T) context.Context {
	t.Helper()
	state, err := NewRequestState(auth.Claims{}, func(context.Context, string) (auth.Authority, error) {
		t.Fatal("anonymous request unexpectedly resolved member authority")
		return auth.Authority{}, nil
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return WithRequestState(context.Background(), state)
}

func TestSearchUsesBothProductDiscoveryFamilies(t *testing.T) {
	cat, shortCode := "lore", "Q12"
	discovery := &searchDiscovery{out: document.DiscoveryPage{
		Total: 7, Order: "rank_desc_updated_at_desc_id_desc",
		Items: []document.DocumentSearchHitView{{Id: "doc-id", Kind: "quest_brief", Category: &cat, Slug: "alpha", Title: "Alpha", Snippet: "Safe body", QuestShortCode: &shortCode}},
	}}
	repo := &searchSiteRepo{}
	r := testHybridSearchResolver(t, repo, discovery)
	got, err := r.Query().Search(anonymousSearchContext(t), "Alpha", nil, 2, 2)
	if err != nil {
		t.Fatal(err)
	}
	if discovery.query != "Alpha" || discovery.kinds != nil || discovery.page != (product.Page{Limit: 2, Offset: 2}) || repo.last.Limit != 2 || repo.last.Offset != 2 {
		t.Fatalf("family paging docs=%+v members=%+v", discovery, repo.last)
	}
	if got.Query != "Alpha" || got.DocumentTotal != 7 || got.MemberTotal != 3 || got.DocumentOrder != "rank_desc_updated_at_desc_id_desc" || got.MemberOrder != "handle_asc_id_asc" {
		t.Fatalf("meta=%+v", got)
	}
	if len(got.Documents) != 1 || got.Documents[0].Snippet != "Safe body" || got.Documents[0].QuestShortCode == nil || *got.Documents[0].QuestShortCode != "Q12" || len(got.Members) != 1 || got.Members[0].Handle != "alpha" {
		t.Fatalf("hits=%+v members=%+v", got.Documents, got.Members)
	}
}

func TestSearchKindsAndPages(t *testing.T) {
	for _, tc := range []struct {
		name                        string
		kinds                       []string
		limit, offset               int
		invalid, documents, members bool
	}{
		{name: "empty none", kinds: []string{}, limit: 1},
		{name: "member only", kinds: []string{"member"}, limit: 1, members: true},
		{name: "document only", kinds: []string{"rule"}, limit: 1, documents: true},
		{name: "unknown rejected", kinds: []string{"hex"}, limit: 1, invalid: true},
		{name: "zero limit", limit: 0, invalid: true},
		{name: "negative offset", limit: 1, offset: -1, invalid: true},
		{name: "overflow limit", limit: 1 << 32, invalid: true},
		{name: "overflow offset", limit: 1, offset: 1 << 32, invalid: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo, discovery := &searchSiteRepo{}, &searchDiscovery{out: document.DiscoveryPage{Items: []document.DocumentSearchHitView{}, Order: "rank_desc_updated_at_desc_id_desc"}}
			r := testHybridSearchResolver(t, repo, discovery)
			got, err := r.Query().Search(anonymousSearchContext(t), "needle", tc.kinds, tc.limit, tc.offset)
			if tc.invalid {
				failure, ok := errors.AsType[*apierr.Error](err)
				if !ok || failure.Code != apierr.Invalid {
					t.Fatalf("error=%v", err)
				}
				if repo.calls != 0 || discovery.calls != 0 {
					t.Fatal("invalid request reached a reader")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if (discovery.query != "") != tc.documents || (repo.calls != 0) != tc.members || got.Documents == nil || got.Members == nil {
				t.Fatalf("family selection=%+v / %+v / %+v", discovery, repo, got)
			}
		})
	}
}

func TestSearchRejectsInvalidQueryAndKindsBeforeReaders(t *testing.T) {
	for _, tc := range []struct {
		name    string
		query   string
		kinds   []string
		invalid bool
	}{
		{name: "empty query", query: "", invalid: true},
		{name: "one Unicode character", query: "界"},
		{name: "200 Unicode characters", query: strings.Repeat("😀", 200)},
		{name: "201 Unicode characters", query: strings.Repeat("😀", 201), invalid: true},
		{name: "mixed Unicode boundary", query: strings.Repeat("a", 199) + "界"},
		{name: "mixed Unicode overflow", query: strings.Repeat("a", 200) + "界", invalid: true},
		{name: "100 kinds", query: "needle", kinds: slices.Repeat([]string{"rule", "member"}, 50)},
		{name: "101 kinds", query: "needle", kinds: slices.Repeat([]string{"member"}, 101), invalid: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &searchSiteRepo{}
			discovery := &searchDiscovery{out: document.DiscoveryPage{Items: []document.DocumentSearchHitView{}, Order: "rank_desc_updated_at_desc_id_desc"}}
			r := testHybridSearchResolver(t, repo, discovery)
			got, err := r.Query().Search(anonymousSearchContext(t), tc.query, tc.kinds, 101, 0)
			if tc.invalid {
				failure, ok := errors.AsType[*apierr.Error](err)
				if !ok || failure.Code != apierr.Invalid {
					t.Fatalf("error=%v, want INVALID", err)
				}
				if repo.calls != 0 || discovery.calls != 0 {
					t.Fatal("invalid request reached a reader")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if repo.calls != 1 || discovery.calls != 1 || discovery.query != tc.query || repo.last.Query != tc.query || got.Query != tc.query || discovery.page.Limit != 101 || repo.last.Limit != 101 {
				t.Fatalf("valid boundary not forwarded unchanged docs=%+v members=%+v result=%+v", discovery, repo, got)
			}
		})
	}
}

func TestSearchableKindsUsesAcceptedVocabulary(t *testing.T) {
	r := testHybridSearchResolver(t, &searchSiteRepo{}, &searchDiscovery{})
	got, err := r.Query().SearchableKinds(anonymousSearchContext(t))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"codex_entry", "rule", "summary", "quest_brief", "community", "member"}
	if len(got) != len(want) {
		t.Fatalf("kinds=%+v", got)
	}
	for i, kind := range got {
		if kind.Key != want[i] || !kind.Searchable {
			t.Fatalf("kind=%+v want %s", kind, want[i])
		}
	}
}
