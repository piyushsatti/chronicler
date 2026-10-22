package quest

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

func questViewPointers(items []QuestView) []*QuestView {
	views := make([]*QuestView, len(items))
	for i := range items {
		views[i] = &items[i]
	}
	return views
}

func (p *ProductPostgres) fillQuestRegionIDs(ctx context.Context, views ...*QuestView) error {
	ids := make([]pgtype.UUID, 0, len(views))
	byID := make(map[string][]*QuestView, len(views))
	for _, view := range views {
		if view == nil {
			continue
		}
		view.Regions = []string{}
		if len(byID[view.Id]) == 0 {
			id, err := questUUID(view.Id)
			if err != nil {
				return err
			}
			ids = append(ids, id)
		}
		byID[view.Id] = append(byID[view.Id], view)
	}
	if len(ids) == 0 {
		return nil
	}
	rows, err := p.queries().ProductQuestReadRegionIDs(ctx, ids)
	if err != nil {
		return err
	}
	for _, row := range rows {
		for _, view := range byID[db.UUIDString(row.QuestID)] {
			view.Regions = append(view.Regions, db.UUIDString(row.RegionID))
		}
	}
	return nil
}
