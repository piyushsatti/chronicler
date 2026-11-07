package site

import (
	"context"
	"fmt"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type ClassCount struct {
	Name  string
	Count int32
}

type QuestHexCount struct {
	ID         string
	Name       string
	MapName    string
	QuestCount int32
}

type AdminCommunityStats struct {
	TotalCharacters int32
	Classes         []ClassCount
	QuestHexes      []QuestHexCount
}

func (p *ProductPostgres) ReadAdminCommunityStats(ctx context.Context, _ auth.Authority) (AdminCommunityStats, error) {
	classRows, err := p.queries().SiteAdminCharacterClasses(ctx)
	if err != nil {
		return AdminCommunityStats{}, err
	}
	total, classes, err := mapAdminCharacterClasses(classRows)
	if err != nil {
		return AdminCommunityStats{}, err
	}
	hexRows, err := p.queries().SiteAdminQuestHexCounts(ctx)
	if err != nil {
		return AdminCommunityStats{}, err
	}
	return AdminCommunityStats{
		TotalCharacters: total,
		Classes:         classes,
		QuestHexes:      mapAdminQuestHexes(hexRows),
	}, nil
}

func mapAdminCharacterClasses(rows []dbgen.SiteAdminCharacterClassesRow) (int32, []ClassCount, error) {
	if len(rows) == 0 {
		return 0, nil, fmt.Errorf("site admin character classes returned no totals row")
	}
	total := rows[0].TotalCharacters
	classes := make([]ClassCount, 0, len(rows))
	for _, row := range rows {
		if row.TotalCharacters != total {
			return 0, nil, fmt.Errorf("site admin character classes totals differ across rows")
		}
		if row.ClassName == "" && row.ClassCount == 0 {
			continue
		}
		classes = append(classes, ClassCount{Name: row.ClassName, Count: row.ClassCount})
	}
	return total, classes, nil
}

func mapAdminQuestHexes(rows []dbgen.SiteAdminQuestHexCountsRow) []QuestHexCount {
	out := make([]QuestHexCount, 0, len(rows))
	for _, row := range rows {
		out = append(out, QuestHexCount{
			ID: row.HexID, Name: row.HexName, MapName: row.MapName, QuestCount: row.QuestCount,
		})
	}
	return out
}
