package character

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
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
	quest, err := characterProductID(questID)
	if err != nil {
		return err
	}
	actor, err := characterProductID(actorID)
	if err != nil {
		return err
	}
	for _, award := range awards {
		id, err := characterProductID(award.CharacterID)
		if err != nil {
			return err
		}
		if award.Amount <= 0 {
			return apierr.New(apierr.Invalid, "quest pcxp award must be positive")
		}
		_, err = p.queries().CharacterProductAwardQuestPCXP(ctx, dbgen.CharacterProductAwardQuestPCXPParams{
			CharacterID: id, QuestID: quest, ActorID: actor, Amount: award.Amount,
			Note: optionalCharacterText(award.Note), At: pgTime(at),
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.Conflict, "quest pcxp award rejected")
		}
		if err != nil {
			return err
		}
	}
	return nil
}

var _ QuestRewardWriter = (*ProductPostgres)(nil)
