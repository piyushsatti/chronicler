package character

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type QuestPCXPAward struct {
	CharacterID string
	Amount      int32
	Note        *string
}

// QuestRewardWriter borrows the close command's transaction and already locked roster.
type QuestRewardWriter interface {
	LockQuestRoster(context.Context, string) ([]string, error)
	AwardQuestPCXP(context.Context, string, string, []QuestPCXPAward, time.Time) error
}

func (p *ProductPostgres) LockQuestRoster(ctx context.Context, questID string) ([]string, error) {
	id, err := characterProductID(questID)
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().CharacterProductLockQuestRoster(ctx, id)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, db.UUIDString(row))
	}
	return ids, nil
}

func (p *ProductPostgres) AwardQuestPCXP(ctx context.Context, questID, actorID string, awards []QuestPCXPAward, at time.Time) error {
	if len(awards) == 0 {
		return nil
	}
	quest, err := characterProductID(questID)
	if err != nil {
		return err
	}
	actor, err := characterProductID(actorID)
	if err != nil {
		return err
	}
	characterIDs := make([]pgtype.UUID, 0, len(awards))
	amounts := make([]int32, 0, len(awards))
	notes := make([]string, 0, len(awards))
	for _, award := range awards {
		if award.Amount <= 0 {
			return apierr.New(apierr.Invalid, "quest pcxp award must be positive")
		}
		id, err := characterProductID(award.CharacterID)
		if err != nil {
			return err
		}
		characterIDs = append(characterIDs, id)
		amounts = append(amounts, award.Amount)
		if award.Note != nil {
			notes = append(notes, *award.Note)
		} else {
			notes = append(notes, "")
		}
	}
	rows, err := p.queries().CharacterProductAwardQuestPCXP(ctx, dbgen.CharacterProductAwardQuestPCXPParams{
		CharacterIds: characterIDs, QuestID: quest, ActorID: actor, Amounts: amounts, Notes: notes, At: pgTime(at),
	})
	if err != nil {
		return err
	}
	if len(rows) != len(awards) {
		return apierr.New(apierr.Conflict, "quest pcxp award rejected")
	}
	return nil
}

var _ QuestRewardWriter = (*ProductPostgres)(nil)
