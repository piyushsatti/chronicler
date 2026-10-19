package document

import (
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func applySummaryDerivedQuestFacts(out []product.BatchResult[SummaryDerivedView], positions []int, rows []dbgen.ProductSummaryDerivedQuestFactsRow) {
	for _, row := range rows {
		view := summaryDerivedSlot(out, positions, row.InputIndex)
		if view == nil {
			continue
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
