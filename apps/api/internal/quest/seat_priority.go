package quest

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

// lastGamePlayedSignup is the signup type whose seats go by priority: players who have never
// played come first, then the player whose last played game is oldest. A higher-priority
// player who signs up to a full quest takes the seat of the lowest-priority seated player.
const lastGamePlayedSignup = "last_game_played"

// higherSeatPriority reports whether a ranks strictly above b on play history alone. Signup
// time is left out on purpose: the newer signup never wins a tie, so equal history never bumps.
func higherSeatPriority(a, b dbgen.ProductQuestSeatPriorityRow) bool {
	if !a.LastPlayedAt.Valid || !b.LastPlayedAt.Valid {
		return !a.LastPlayedAt.Valid && b.LastPlayedAt.Valid
	}
	return a.LastPlayedAt.Time.Before(b.LastPlayedAt.Time)
}

// bumpLowestSeat seats the waitlisted newcomer in place of the lowest-priority seated player
// when the newcomer ranks strictly higher. The bumped player drops to the waitlist. Seat counts
// do not change. It returns the bumped character's public ID on a successful bump, or "" when
// no bump happened. The caller holds the quest lock.
func (p *ProductPostgres) bumpLowestSeat(ctx context.Context, questPublicID pgtype.UUID, questID int64, newcomer string, at pgtype.Timestamptz) (string, error) {
	rows, err := p.queries().ProductQuestSeatPriority(ctx, questPublicID)
	if err != nil {
		return "", err
	}
	var entrant, lowest *dbgen.ProductQuestSeatPriorityRow
	for i := range rows {
		row := &rows[i]
		switch {
		case row.Status == "waitlisted" && db.UUIDString(row.CharacterPublicID) == newcomer:
			entrant = row
		case row.Status == "signed_up" && !row.DmPicked:
			lowest = row
		}
	}
	if entrant == nil || lowest == nil || !higherSeatPriority(*entrant, *lowest) {
		return "", nil
	}
	if _, err := p.queries().ProductQuestUpdateParticipant(ctx, dbgen.ProductQuestUpdateParticipantParams{
		Status: "waitlisted", Manual: lowest.Manual, At: at, QuestID: questID, CharacterID: lowest.CharacterID,
	}); err != nil {
		return "", err
	}
	if _, err := p.queries().ProductQuestUpdateParticipant(ctx, dbgen.ProductQuestUpdateParticipantParams{
		Status: "signed_up", Manual: entrant.Manual, At: at, QuestID: questID, CharacterID: entrant.CharacterID,
	}); err != nil {
		return "", err
	}
	return db.UUIDString(lowest.CharacterPublicID), nil
}

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
