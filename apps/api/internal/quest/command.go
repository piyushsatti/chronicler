package quest

import (
	"context"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type Commands struct {
	tx  uow.Runner[Repository]
	now func() time.Time
}

func NewCommands(tx uow.Runner[Repository], now func() time.Time) Commands {
	return Commands{tx: tx, now: now}
}

func (c Commands) Create(ctx context.Context, actor auth.Claims, spec CreateSpec) (Quest, error) {
	if actor.Anonymous() {
		return Quest{}, apierr.New(apierr.Unauthenticated, "sign in required")
	}
	var result Quest
	err := c.tx.Do(ctx, func(repo Repository) error {
		q, err := repo.Create(ctx, actor.MemberID, spec)
		if err != nil {
			return err
		}
		if err := repo.RecordDesiredRevision(ctx, q.ID); err != nil {
			return err
		}
		result = q
		return nil
	})
	return result, err
}

func (c Commands) TransitionStatus(ctx context.Context, actor auth.Claims, id string, to Status) (Quest, error) {
	var result Quest
	err := c.tx.Do(ctx, func(repo Repository) error {
		q, err := repo.Get(ctx, id)
		if err != nil {
			return err
		}
		if q.DMID != actor.MemberID && !actor.Has(auth.Admin) {
			return ErrNotQuestDM
		}
		next, err := q.Transition(to, c.now())
		if err != nil {
			return err
		}
		if err := repo.Save(ctx, next); err != nil {
			return err
		}
		if err := repo.RecordDesiredRevision(ctx, next.ID); err != nil {
			return err
		}
		result = next
		return nil
	})
	return result, err
}

func (c Commands) Close(ctx context.Context, actor auth.Claims, id string) (Quest, error) {
	var result Quest
	err := c.tx.Do(ctx, func(repo Repository) error {
		q, err := repo.Get(ctx, id)
		if err != nil {
			return err
		}
		if q.DMID != actor.MemberID && !actor.Has(auth.Admin) {
			return ErrNotQuestDM
		}
		if q.Status == Closed {
			return ErrIllegalTransition
		}
		q.Status = Closed
		if err := repo.Save(ctx, q); err != nil {
			return err
		}
		if err := repo.RecordDesiredRevision(ctx, q.ID); err != nil {
			return err
		}
		result = q
		return nil
	})
	return result, err
}

func (c Commands) SignUp(ctx context.Context, actor auth.Claims, questID, characterID string) error {
	if actor.Anonymous() {
		return apierr.New(apierr.Unauthenticated, "sign in required")
	}
	return c.tx.Do(ctx, func(repo Repository) error {
		if err := repo.SignUp(ctx, questID, actor.MemberID, characterID); err != nil {
			return err
		}
		return repo.RecordDesiredRevision(ctx, questID)
	})
}

// SyncDiscord bumps the desired revision without changing quest status.
func (c Commands) SyncDiscord(ctx context.Context, actor auth.Claims, id string) error {
	return c.tx.Do(ctx, func(repo Repository) error {
		q, err := repo.Get(ctx, id)
		if err != nil {
			return err
		}
		if q.DMID != actor.MemberID && !actor.Has(auth.Admin) {
			return ErrNotQuestDM
		}
		return repo.RecordDesiredRevision(ctx, q.ID)
	})
}
