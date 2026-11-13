package site

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

func TestMapAdminCommunityStats(t *testing.T) {
	total, classes, err := mapAdminCharacterClasses([]dbgen.SiteAdminCharacterClassesRow{
		{TotalCharacters: 3, ClassName: "Wizard", ClassCount: 2},
		{TotalCharacters: 3, ClassName: "Fighter", ClassCount: 1},
		{TotalCharacters: 3, ClassName: "", ClassCount: 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || len(classes) != 3 || classes[0] != (ClassCount{Name: "Wizard", Count: 2}) || classes[2].Name != "" {
		t.Fatalf("classes=%+v total=%d", classes, total)
	}

	total, classes, err = mapAdminCharacterClasses([]dbgen.SiteAdminCharacterClassesRow{
		{TotalCharacters: 0, ClassName: "", ClassCount: 0},
	})
	if err != nil || total != 0 || len(classes) != 0 {
		t.Fatalf("empty total=%d classes=%+v err=%v", total, classes, err)
	}

	_, _, err = mapAdminCharacterClasses([]dbgen.SiteAdminCharacterClassesRow{
		{TotalCharacters: 2, ClassName: "Wizard", ClassCount: 2},
		{TotalCharacters: 1, ClassName: "Fighter", ClassCount: 1},
	})
	if err == nil {
		t.Fatal("mismatched totals were accepted")
	}

	hexes := mapAdminQuestHexes([]dbgen.SiteAdminQuestHexCountsRow{{
		HexID: "11111111-1111-4111-8111-111111111111", HexName: "Ashfall", MapName: "Lightfall", QuestCount: 3,
	}})
	if len(hexes) != 1 || hexes[0].Name != "Ashfall" || hexes[0].QuestCount != 3 || hexes[0].MapName != "Lightfall" {
		t.Fatalf("hexes=%+v", hexes)
	}
}
