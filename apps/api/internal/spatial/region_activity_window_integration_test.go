//go:build integration

package spatial

import (
	"context"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestRegionActivityExcludesEndedOpenQuests(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	asOf := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	var memberID, regionID, documentID int64
	if err := f.Pool.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles)
		VALUES('activity-window-dm','activity-window-dm','Activity DM',ARRAY['dm']) RETURNING id`).Scan(&memberID); err != nil {
		t.Fatal(err)
	}
	if err := f.Pool.QueryRow(ctx, `INSERT INTO regions(name,kind)
		VALUES('Activity window region','server') RETURNING id`).Scan(&regionID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO maps(name,atlas_code,map_kind,region_id)
		VALUES('Activity window map','activity-window','pointcrawl',$1)`, regionID); err != nil {
		t.Fatal(err)
	}
	if err := f.Pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,author_id)
		VALUES('quest_brief','activity-window-brief','Activity brief','published','public',$1) RETURNING id`, memberID).Scan(&documentID); err != nil {
		t.Fatal(err)
	}
	for _, quest := range []struct {
		code   string
		start  time.Time
		status string
		filled int32
	}{
		{"ACT-ENDED", asOf.Add(-24 * time.Hour), "open", 1},
		{"ACT-EXACT-END", asOf.Add(-2 * time.Hour), "open", 1},
		{"ACT-UPCOMING", asOf.Add(time.Hour), "open", 1},
		{"ACT-SCHEDULED", asOf.Add(time.Hour), "full", 5},
		{"ACT-LIVE", asOf.Add(-2*time.Hour + time.Microsecond), "open", 1},
	} {
		var questID int64
		if err := f.Pool.QueryRow(ctx, `INSERT INTO quests(short_code,kinds,dm_id,scheduled_at,
			duration_hours,status,filled_count,document_id,created_by)
			VALUES($1,ARRAY['standard'],$2,$3,2,$4,$5,$6,$2) RETURNING id`,
			quest.code, memberID, quest.start, quest.status, quest.filled, documentID).Scan(&questID); err != nil {
			t.Fatal(err)
		}
		if _, err := f.Pool.Exec(ctx, `INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)`, questID, regionID); err != nil {
			t.Fatal(err)
		}
	}
	queries := dbgen.New(f.Pool)
	rows, err := queries.ReadProductRegionActivity(ctx, dbgen.ReadProductRegionActivityParams{
		AtlasCode: "activity-window", AsOf: pgTimestamptz(asOf),
	})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"ACT-UPCOMING": "filling", "ACT-SCHEDULED": "scheduled", "ACT-LIVE": "live"}
	if len(rows) != len(want) {
		t.Fatalf("activity rows=%+v, want only upcoming and live quests", rows)
	}
	for _, row := range rows {
		status, ok := want[row.ShortCode.String]
		if !ok || !row.QuestID.Valid || row.DisplayStatus.String != status || row.FillingCount != 1 || row.ScheduledCount != 1 || row.LiveCount != 1 {
			t.Fatalf("activity row=%+v, want upcoming/live IDs and one quest in each count", row)
		}
		delete(want, row.ShortCode.String)
	}
	if len(want) != 0 {
		t.Fatalf("activity omitted quests=%v", want)
	}
	rows, err = queries.ReadProductRegionActivity(ctx, dbgen.ReadProductRegionActivityParams{
		AtlasCode: "activity-window", AsOf: pgTimestamptz(asOf.Add(4 * time.Hour)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].QuestID.Valid || rows[0].FillingCount != 0 || rows[0].ScheduledCount != 0 || rows[0].LiveCount != 0 {
		t.Fatalf("ended region activity=%+v, want region with zero counts and no quest", rows)
	}
}
