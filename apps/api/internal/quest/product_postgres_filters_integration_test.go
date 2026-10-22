//go:build integration

package quest

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestProductQuestListOptionalFilters(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	const dmID = "10000000-0000-4000-8000-000000000001"
	const arcID = "10000000-0000-4000-8000-000000000002"
	const regionID = "10000000-0000-4000-8000-000000000003"
	const missingID = "10000000-0000-4000-8000-000000000099"
	const firstCode = `Q_%\MATCH`
	for _, statement := range []string{
		`INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES ('` + dmID + `','filters-dm','filters-dm','Filters DM',ARRAY['dm'])`,
		`INSERT INTO quest_arcs(public_id,name,created_by) SELECT '` + arcID + `','Filter arc',id FROM members`,
		`INSERT INTO regions(public_id,name,kind) VALUES ('` + regionID + `','Filter region','archon')`,
		`INSERT INTO documents(kind,slug,title,status,visibility,body,author_id) SELECT 'quest_brief','filters-brief','Filter brief','published','public','',id FROM members`,
		`INSERT INTO quests(short_code,kinds,status,dm_id,arc_id,scheduled_at,document_id,tags,genres,created_by)
		 SELECT 'Q_%\MATCH',ARRAY['standard'],'open',m.id,a.id,'2030-01-01T00:00:00Z',d.id,ARRAY['north'],ARRAY['mystery'],m.id
		 FROM members m CROSS JOIN quest_arcs a CROSS JOIN documents d`,
		`INSERT INTO quests(short_code,kinds,status,dm_id,scheduled_at,document_id,created_by)
		 SELECT 'Q-OTHER',ARRAY['event'],'closed',m.id,'2030-01-02T00:00:00Z',d.id,m.id FROM members m CROSS JOIN documents d`,
		`INSERT INTO quest_regions(quest_id,region_id) SELECT q.id,r.id FROM quests q CROSS JOIN regions r WHERE q.short_code='Q_%\MATCH'`,
	} {
		if _, err := fixture.Pool.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	text := func(value string) *string { return &value }
	at := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	nextDay := at.Add(24 * time.Hour)
	both := []string{firstCode, "Q-OTHER"}
	first := []string{firstCode}
	cases := []struct {
		name string
		spec QuestsSpec
		want []string
	}{
		{name: "omitted", want: both},
		{name: "empty filters", spec: QuestsSpec{Filters: &QuestFiltersFields{}}, want: both},
		{name: "status", spec: QuestsSpec{Filters: &QuestFiltersFields{Status: text("open")}}, want: first},
		{name: "display status", spec: QuestsSpec{Filters: &QuestFiltersFields{DisplayStatus: text("open")}}, want: first},
		{name: "kind", spec: QuestsSpec{Filters: &QuestFiltersFields{Kind: text("standard")}}, want: first},
		{name: "all text filters", spec: QuestsSpec{Filters: &QuestFiltersFields{Status: text("open"), DisplayStatus: text("open"), Kind: text("standard"), Search: text(firstCode)}}, want: first},
		{name: "empty status is supplied", spec: QuestsSpec{Filters: &QuestFiltersFields{Status: text("")}}},
		{name: "empty display status is supplied", spec: QuestsSpec{Filters: &QuestFiltersFields{DisplayStatus: text("")}}},
		{name: "empty kind is supplied", spec: QuestsSpec{Filters: &QuestFiltersFields{Kind: text("")}}},
		{name: "empty search matches all", spec: QuestsSpec{Filters: &QuestFiltersFields{Search: text("")}}, want: both},
		{name: "dm", spec: QuestsSpec{Filters: &QuestFiltersFields{DmId: text(dmID)}}, want: both},
		{name: "missing dm", spec: QuestsSpec{Filters: &QuestFiltersFields{DmId: text(missingID)}}},
		{name: "arc", spec: QuestsSpec{Filters: &QuestFiltersFields{ArcId: text(arcID)}}, want: first},
		{name: "missing arc", spec: QuestsSpec{Filters: &QuestFiltersFields{ArcId: text(missingID)}}},
		{name: "region", spec: QuestsSpec{Filters: &QuestFiltersFields{RegionId: text(regionID)}}, want: first},
		{name: "missing region", spec: QuestsSpec{Filters: &QuestFiltersFields{RegionId: text(missingID)}}},
		{name: "tag", spec: QuestsSpec{TagFilterSet: true, TagVariants: []string{"north"}}, want: first},
		{name: "missing tag", spec: QuestsSpec{TagFilterSet: true, TagVariants: []string{"south"}}},
		{name: "genre", spec: QuestsSpec{GenreFilterSet: true, GenreVariants: []string{"mystery"}}, want: first},
		{name: "missing genre", spec: QuestsSpec{GenreFilterSet: true, GenreVariants: []string{"horror"}}},
		{name: "short codes", spec: QuestsSpec{Filters: &QuestFiltersFields{ShortCodes: first}}, want: first},
		{name: "missing short code", spec: QuestsSpec{Filters: &QuestFiltersFields{ShortCodes: []string{"absent"}}}},
		{name: "from inclusive", spec: QuestsSpec{Filters: &QuestFiltersFields{ScheduledFrom: &at}}, want: both},
		{name: "to exclusive", spec: QuestsSpec{Filters: &QuestFiltersFields{ScheduledTo: &nextDay}}, want: first},
		{name: "home upcoming interval", spec: QuestsSpec{Filters: &QuestFiltersFields{ScheduledFrom: &at, ScheduledTo: &nextDay}}, want: first},
		{name: "literal percent", spec: QuestsSpec{Filters: &QuestFiltersFields{Search: text("%")}}, want: first},
		{name: "literal underscore", spec: QuestsSpec{Filters: &QuestFiltersFields{Search: text("_")}}, want: first},
		{name: "literal backslash", spec: QuestsSpec{Filters: &QuestFiltersFields{Search: text(`\`)}}, want: first},
		{name: "search insensitive", spec: QuestsSpec{Filters: &QuestFiltersFields{Search: text("match")}}, want: first},
		{name: "missing search", spec: QuestsSpec{Filters: &QuestFiltersFields{Search: text("absent")}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := tc.spec
			spec.AsOf, spec.Limit = at.Add(-time.Hour), 10
			for _, offset := range []int32{0, 1, 10} {
				spec.Offset = offset
				page, err := adapter.ReadQuests(ctx, auth.Authority{}, spec)
				if err != nil {
					t.Fatal(err)
				}
				if page.Total != int32(len(tc.want)) {
					t.Fatalf("offset %d total = %d, want %d", offset, page.Total, len(tc.want))
				}
				var codes []string
				for _, item := range page.Items {
					codes = append(codes, item.ShortCode)
				}
				start := min(int(offset), len(tc.want))
				if !slices.Equal(codes, tc.want[start:]) {
					t.Fatalf("offset %d codes = %v, want %v", offset, codes, tc.want[start:])
				}
			}
		})
	}
	for _, limit := range []int32{0, 1} {
		page, err := adapter.ReadQuests(ctx, auth.Authority{}, QuestsSpec{AsOf: at.Add(-time.Hour), Limit: limit})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != 2 || len(page.Items) != int(limit) {
			t.Fatalf("limit %d total/items = %d/%d, want 2/%d", limit, page.Total, len(page.Items), limit)
		}
		if limit == 1 && page.Items[0].ShortCode != firstCode {
			t.Fatalf("first quest = %q, want %q", page.Items[0].ShortCode, firstCode)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE quests SET status='full',filled_count=slots_max WHERE short_code='Q-OTHER'`); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		status string
		asOf   time.Time
	}{
		{status: "scheduled", asOf: at.Add(-time.Hour)},
		{status: "live", asOf: nextDay.Add(time.Hour)},
	} {
		page, err := adapter.ReadQuests(ctx, auth.Authority{}, QuestsSpec{
			Filters: &QuestFiltersFields{DisplayStatus: &tc.status}, AsOf: tc.asOf, Limit: 10,
		})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ShortCode != "Q-OTHER" {
			t.Fatalf("%s board = %+v, want Q-OTHER only", tc.status, page)
		}
	}
}
