package document

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestApplySummaryDerivedQuestFactsAggregatesEarliestAndUniqueDMs(t *testing.T) {
	out := []product.BatchResult[SummaryDerivedView]{
		{Value: &SummaryDerivedView{}},
		{Value: &SummaryDerivedView{}},
	}
	positions := []int{0, 1}
	early := time.Date(2026, 10, 12, 12, 0, 0, 0, time.UTC)
	late := early.Add(2 * time.Hour)
	dmA := db.MustUUID("10000000-0000-4000-8000-000000000003")
	dmB := db.MustUUID("10000000-0000-4000-8000-000000000004")
	rows := []dbgen.ProductSummaryDerivedQuestFactsRow{
		{
			InputIndex: 1, DmID: dmA, DmDisplayName: "Dee",
			ScheduledAt: pgtype.Timestamptz{Time: late, Valid: true},
			GameDay:     pgtype.Int4{Int32: 200, Valid: true},
			ArcName:     pgtype.Text{String: "River arc", Valid: true},
		},
		{
			InputIndex: 1, DmID: dmA, DmDisplayName: "Dee",
			ScheduledAt: pgtype.Timestamptz{Time: early, Valid: true},
			GameDay:     pgtype.Int4{Int32: 112, Valid: true},
		},
		{
			InputIndex: 1, DmID: dmB, DmDisplayName: "Bo",
			ScheduledAt: pgtype.Timestamptz{Time: late, Valid: true},
			GameDay:     pgtype.Int4{Int32: 200, Valid: true},
		},
		{
			InputIndex: 2, DmID: dmB, DmDisplayName: "Bo",
			ScheduledAt: pgtype.Timestamptz{Time: late, Valid: true},
			GameDay:     pgtype.Int4{Int32: 200, Valid: true},
		},
	}
	applySummaryDerivedQuestFacts(out, positions, rows)
	if got := out[0].Value; got.OccurredAt == nil || !got.OccurredAt.Equal(early) || got.GameDay == nil || *got.GameDay != 112 {
		t.Fatalf("slot0 occurred/gameDay = %v/%v", got.OccurredAt, got.GameDay)
	}
	if got := out[0].Value; got.Arc == nil || *got.Arc != "River arc" || len(got.Dms) != 2 {
		t.Fatalf("slot0 arc/dms = %v/%v", got.Arc, got.Dms)
	}
	if got := out[1].Value; len(got.Dms) != 1 || got.Dms[0].DisplayName != "Bo" {
		t.Fatalf("slot1 dms = %+v", got.Dms)
	}
}

func TestApplySummaryDerivedPlayersDedupesCharacters(t *testing.T) {
	out := []product.BatchResult[SummaryDerivedView]{{Value: &SummaryDerivedView{Players: []SummaryPlayerView{}}}}
	positions := []int{0}
	character := db.MustUUID("10000000-0000-4000-8000-000000000030")
	member := db.MustUUID("10000000-0000-4000-8000-000000000001")
	rows := []dbgen.ProductSummaryDerivedPlayersRow{
		{InputIndex: 1, CharacterID: character, CharacterShortCode: "C-AVA", CharacterName: "Ava Scout", MemberID: member, Manual: false},
		{InputIndex: 1, CharacterID: character, CharacterShortCode: "C-AVA", CharacterName: "Ava Scout", MemberID: member, Manual: true},
	}
	applySummaryDerivedPlayers(out, positions, rows)
	if len(out[0].Value.Players) != 1 || out[0].Value.Players[0].Manual {
		t.Fatalf("players = %+v", out[0].Value.Players)
	}
}

func TestApplySummaryDerivedPlacesUnionsRegionsAndNodes(t *testing.T) {
	out := []product.BatchResult[SummaryDerivedView]{{Value: &SummaryDerivedView{
		Regions: []SummaryRegionView{},
		Hexes:   []SummaryHexView{},
	}}}
	positions := []int{0}
	region := db.MustUUID("10000000-0000-4000-8000-000000000021")
	node := db.MustUUID("10000000-0000-4000-8000-000000000026")
	mapID := db.MustUUID("10000000-0000-4000-8000-000000000024")
	rows := []dbgen.ProductSummaryDerivedPlacesRow{
		{InputIndex: 1, PlaceKind: "region", PlaceID: region, PlaceName: "South"},
		{InputIndex: 1, PlaceKind: "region", PlaceID: region, PlaceName: "South"},
		{InputIndex: 1, PlaceKind: "node", PlaceID: node, PlaceName: "NORTH:0:0", MapID: mapID},
	}
	applySummaryDerivedPlaces(out, positions, rows)
	view := out[0].Value
	if len(view.Regions) != 1 || view.Regions[0].Name != "South" {
		t.Fatalf("regions = %+v", view.Regions)
	}
	if len(view.Hexes) != 1 || view.Hexes[0].Hexcode == nil || *view.Hexes[0].Hexcode != "NORTH:0:0" {
		t.Fatalf("hexes = %+v", view.Hexes)
	}
}

func TestReadBatchReaderIdsEmptyKeys(t *testing.T) {
	p := &ProductPostgres{}
	out, err := p.ReadBatchReaderIds(t.Context(), auth.Authority{}, nil)
	if err != nil || len(out) != 0 {
		t.Fatalf("empty keys out=%v err=%v", out, err)
	}
}

func TestReadBatchSummaryDerivedEmptyKeys(t *testing.T) {
	p := &ProductPostgres{}
	out, err := p.ReadBatchSummaryDerived(t.Context(), auth.Authority{}, nil)
	if err != nil || len(out) != 0 {
		t.Fatalf("empty keys out=%v err=%v", out, err)
	}
}
