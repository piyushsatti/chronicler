package document

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) applySummaryAuthoring(ctx context.Context, actor auth.Authority, keys []IDKey, out []product.BatchResult[SummaryDerivedView], positions []int, rows []dbgen.ProductSummaryDerivedQuestFactsRow) error {
	sources := make(map[int]*DocumentView)
	views := make([]*DocumentView, 0, len(keys))
	for _, row := range rows {
		slot := summaryDerivedSlotIndex(positions, row.InputIndex)
		if slot < 0 || !row.SummaryReadable || sources[slot] != nil {
			continue
		}
		view := &DocumentView{Id: keys[slot].ID, Kind: "summary", AuthorId: db.UUIDString(row.SummaryAuthorID)}
		sources[slot] = view
		views = append(views, view)
	}
	if err := p.setDocumentCapabilities(ctx, actor, views); err != nil {
		return err
	}
	for _, row := range rows {
		slot := summaryDerivedSlotIndex(positions, row.InputIndex)
		if slot < 0 || sources[slot] == nil || !sources[slot].CanEditMetadata {
			continue
		}
		view := summaryDerivedSlot(out, positions, row.InputIndex)
		if view == nil || view.Authoring != nil {
			continue
		}
		quests, err := uuidStringsFromAny(row.AuthoringQuestIds)
		if err != nil {
			return err
		}
		if quests == nil {
			quests = []string{}
		}
		characters, err := uuidStringsFromAny(row.AuthoringCharacterIds)
		if err != nil {
			return err
		}
		authoring := &SummaryAuthoringView{Complete: row.AuthoringComplete, QuestIds: quests}
		if len(characters) == 1 {
			authoring.CharacterId = &characters[0]
		} else if len(characters) > 1 {
			authoring.Complete = false
		}
		view.Authoring = authoring
	}
	return nil
}

func applySummaryDerivedQuestFacts(out []product.BatchResult[SummaryDerivedView], positions []int, rows []dbgen.ProductSummaryDerivedQuestFactsRow) {
	for _, row := range rows {
		view := summaryDerivedSlot(out, positions, row.InputIndex)
		if view == nil {
			continue
		}
		if row.QuestID.Valid {
			view.Quests = append(view.Quests, SummaryQuestRefView{Id: db.UUIDString(row.QuestID), ShortCode: row.ShortCode, Title: productTextPointer(row.QuestTitle)})
		}
		if row.DmID.Valid {
			dmID := db.UUIDString(row.DmID)
			seen := false
			for _, existing := range view.Dms {
				if existing.Id == dmID {
					seen = true
					break
				}
			}
			if !seen {
				view.Dms = append(view.Dms, SummaryDmView{Id: dmID, DisplayName: row.DmDisplayName})
			}
		}
		if view.Arc == nil && row.ArcName.Valid && row.ArcName.String != "" {
			name := row.ArcName.String
			view.Arc = &name
		}
		if row.ScheduledAt.Valid {
			at := row.ScheduledAt.Time.UTC()
			if view.OccurredAt == nil || at.Before(*view.OccurredAt) {
				occurred := at
				view.OccurredAt = &occurred
				if row.GameDay.Valid {
					day := row.GameDay.Int32
					view.GameDay = &day
				} else {
					view.GameDay = nil
				}
			}
		}
	}
}

func applySummaryDerivedPlayers(out []product.BatchResult[SummaryDerivedView], positions []int, rows []dbgen.ProductSummaryDerivedPlayersRow) {
	seenBySlot := map[int]map[string]bool{}
	for _, row := range rows {
		slot := summaryDerivedSlotIndex(positions, row.InputIndex)
		if slot < 0 || out[slot].Err != nil || out[slot].Value == nil || !row.CharacterID.Valid {
			continue
		}
		characterID := db.UUIDString(row.CharacterID)
		seen := seenBySlot[slot]
		if seen == nil {
			seen = map[string]bool{}
			seenBySlot[slot] = seen
		}
		if seen[characterID] {
			continue
		}
		seen[characterID] = true
		memberID := ""
		if row.MemberID.Valid {
			memberID = db.UUIDString(row.MemberID)
		}
		out[slot].Value.Players = append(out[slot].Value.Players, SummaryPlayerView{
			CharacterId:        characterID,
			CharacterShortCode: row.CharacterShortCode,
			CharacterName:      row.CharacterName,
			MemberId:           memberID,
			Manual:             row.Manual,
		})
	}
}

func applySummaryDerivedPlaces(out []product.BatchResult[SummaryDerivedView], positions []int, rows []dbgen.ProductSummaryDerivedPlacesRow) {
	seenRegions := map[int]map[string]bool{}
	seenNodes := map[int]map[string]bool{}
	for _, row := range rows {
		view := summaryDerivedSlot(out, positions, row.InputIndex)
		if view == nil || !row.PlaceID.Valid {
			continue
		}
		slot := summaryDerivedSlotIndex(positions, row.InputIndex)
		placeID := db.UUIDString(row.PlaceID)
		switch row.PlaceKind {
		case "region":
			seen := seenRegions[slot]
			if seen == nil {
				seen = map[string]bool{}
				seenRegions[slot] = seen
			}
			if seen[placeID] {
				continue
			}
			seen[placeID] = true
			view.Regions = append(view.Regions, SummaryRegionView{Id: placeID, Name: row.PlaceName})
		case "node":
			seen := seenNodes[slot]
			if seen == nil {
				seen = map[string]bool{}
				seenNodes[slot] = seen
			}
			if seen[placeID] {
				continue
			}
			seen[placeID] = true
			mapID := ""
			if row.MapID.Valid {
				mapID = db.UUIDString(row.MapID)
			}
			name := row.PlaceName
			view.Hexes = append(view.Hexes, SummaryHexView{Id: placeID, MapId: mapID, Hexcode: &name})
		}
	}
}

func summaryDerivedSlot(out []product.BatchResult[SummaryDerivedView], positions []int, inputIndex int32) *SummaryDerivedView {
	slot := summaryDerivedSlotIndex(positions, inputIndex)
	if slot < 0 || out[slot].Err != nil {
		return nil
	}
	return out[slot].Value
}

func summaryDerivedSlotIndex(positions []int, inputIndex int32) int {
	position := int(inputIndex) - 1
	if position < 0 || position >= len(positions) {
		return -1
	}
	return positions[position]
}
