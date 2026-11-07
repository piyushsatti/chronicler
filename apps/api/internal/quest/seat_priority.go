package quest

import (
	"context"

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
