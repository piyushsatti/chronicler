package quest

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

func (p *ProductPostgres) readQuestRoster(ctx context.Context, questID string) ([]QuestParticipantView, error) {
	id, err := questUUID(questID)
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ProductQuestReadParticipants(ctx, dbgen.ProductQuestReadParticipantsParams{QuestID: id, Status: ""})
	if err != nil {
		return nil, err
	}
	roster := make([]QuestParticipantView, 0, len(rows))
	for _, row := range rows {
		roster = append(roster, QuestParticipantView{QuestId: row.QuestID, CharacterId: row.CharacterID, MemberId: row.MemberID, CharacterName: row.CharacterName, MemberHandle: row.MemberHandle, MemberDisplayName: row.MemberDisplayName, MemberAvatarUrl: textPtr(row.MemberAvatarUrl), Status: row.Status, Manual: row.Manual, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time})
	}
	return roster, nil
}
