package quest

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

// lastGamePlayedSignup is the signup type whose waitlist is filled by play history:
// players who have never played come first, then the player whose last played game is oldest.
const lastGamePlayedSignup = "last_game_played"

// dmPickSignup is the signup type where the DM seats waitlisted characters with no seat cap.
const dmPickSignup = "dm_pick"

// waitlistBySeatPriority returns the roster's waitlisted entries in Last Game Played seat order.
func (p *ProductPostgres) waitlistBySeatPriority(ctx context.Context, questID string, roster []QuestParticipantView) ([]QuestParticipantView, error) {
	id, err := questUUID(questID)
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ProductQuestSeatPriority(ctx, id)
	if err != nil {
		return nil, err
	}
	byCharacter := make(map[string]QuestParticipantView, len(roster))
	for _, entry := range roster {
		byCharacter[entry.CharacterId] = entry
	}
	ordered := make([]QuestParticipantView, 0, len(rows))
	for _, row := range rows {
		if entry, ok := byCharacter[db.UUIDString(row.CharacterPublicID)]; ok && row.Status == "waitlisted" && entry.Status == "waitlisted" {
			ordered = append(ordered, entry)
		}
	}
	return ordered, nil
}

// WaitlistedCharacterIDs returns waitlisted characters in seat order without locking the quest.
// The caller locks those characters, then the quest, then fills from a fresh read.
func (p *ProductPostgres) WaitlistedCharacterIDs(ctx context.Context, questID string) ([]string, error) {
	id, err := questUUID(questID)
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ProductQuestSeatPriority(ctx, id)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.Status == "waitlisted" {
			ids = append(ids, db.UUIDString(row.CharacterPublicID))
		}
	}
	return ids, nil
}

func (p *ProductPostgres) lastGamePlayedFill(ctx context.Context, write SelectQuestParticipantsWrite) ([]string, error) {
	if write.Locked.Before == nil || write.Locked.Before.SignupType == nil || *write.Locked.Before.SignupType != lastGamePlayedSignup {
		return nil, apierr.New(apierr.Conflict, "last game played fill is only for last game played quests")
	}
	ordered, err := p.waitlistBySeatPriority(ctx, write.ValidatedInput.QuestId, write.Locked.Roster)
	if err != nil {
		return nil, err
	}
	admitted := make(map[string]character.Admission, len(write.Locked.Candidates))
	for _, admission := range write.Locked.Candidates {
		admitted[admission.ID] = admission
	}
	requested := make(map[string]struct{}, len(write.ValidatedInput.CharacterIds))
	for _, id := range write.ValidatedInput.CharacterIds {
		requested[id] = struct{}{}
	}
	open := int(write.Locked.Before.SlotsMax - write.Locked.Before.FilledCount)
	if open < 0 {
		open = 0
	}
	ids, changed := fillLastGamePlayedSeats(ordered, open, requested, admitted)
	if changed {
		return nil, apierr.New(apierr.Conflict, "waitlist changed; retry")
	}
	return ids, nil
}
