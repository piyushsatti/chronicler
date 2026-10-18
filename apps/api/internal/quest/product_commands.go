package quest

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ProductCommands struct {
	Runner  uow.Runner[ProductCommandRepos]
	Clock   product.Clock
	IDs     product.IDGenerator
	Queries *ProductQueries
}

func commandDependencyMissing(value any) bool {
	if value == nil {
		return true
	}
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
		return v.IsNil()
	}
	return false
}

func NewProductCommands(runner uow.Runner[ProductCommandRepos], clock product.Clock, ids product.IDGenerator) (*ProductCommands, error) {
	for _, dependency := range []any{runner, clock, ids} {
		if commandDependencyMissing(dependency) {
			return nil, apierr.New(apierr.Internal, "quest command dependencies required")
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock, IDs: ids}, nil
}

func commandPublicID(value *string) error {
	if value == nil {
		return nil
	}
	parsed, err := uuid.Parse(*value)
	if err != nil || parsed == uuid.Nil || !strings.EqualFold(parsed.String(), *value) {
		return apierr.New(apierr.Invalid, "invalid public id")
	}
	*value = parsed.String()
	return nil
}

func questArcName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if !utf8.ValidString(trimmed) || trimmed == "" || utf8.RuneCountInString(trimmed) > 200 {
		return "", apierr.New(apierr.Invalid, "invalid quest arc name")
	}
	return trimmed, nil
}

func runQuestCommand[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	operation string,
	request auth.Request,
	spec any,
	meta product.CommandMeta,
	subjectID string,
	mutate func(ProductCommandRepos, auth.Authority, time.Time) (T, error),
) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "quest transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "quest command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, operation, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			if err := json.Unmarshal(claim.Receipt, &result); err != nil {
				return err
			}
			return nil
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = mutate(repos, fresh, at)
		if err != nil {
			return err
		}
		if decision.UsedOverride {
			if commandDependencyMissing(repos.Audit) {
				return apierr.New(apierr.Internal, "override recorder required")
			}
			if err := repos.Audit.Record(ctx, auth.OverrideFact{
				ActorID:     fresh.Claims().MemberID,
				Operation:   request.Operation(),
				SubjectType: "quest",
				SubjectID:   subjectID,
				RuleCode:    decision.RuleCode,
				At:          at,
			}); err != nil {
				return err
			}
		}
		receipt, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return repos.Replay.Complete(ctx, claim, receipt)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func (s ProductCommands) UpsertQuestArc(ctx context.Context, actor auth.Authority, spec UpsertQuestArcSpec, meta product.CommandMeta) (QuestArcView, error) {
	if s.Queries == nil {
		return QuestArcView{}, apierr.New(apierr.Internal, "quest queries unavailable")
	}
	name, err := questArcName(spec.Name)
	if err != nil {
		return QuestArcView{}, err
	}
	spec.Name = name
	if spec.Id != nil {
		id := *spec.Id
		if err := commandPublicID(&id); err != nil {
			return QuestArcView{}, err
		}
		spec.Id = &id
	}
	facts := auth.ArcFacts{}
	if spec.Id != nil {
		existing, err := s.Queries.QuestArc(ctx, actor, QuestArcSpec{Id: *spec.Id})
		if err != nil {
			return QuestArcView{}, err
		}
		if existing == nil {
			return QuestArcView{}, apierr.New(apierr.NotFound, "quest arc not found")
		}
		facts.ID = spec.Id
		facts.AuthorID = &existing.CreatedBy
	}
	request, err := auth.ForArc(facts)
	if err != nil {
		return QuestArcView{}, err
	}
	subject := actor.Claims().MemberID
	if spec.Id != nil {
		subject = *spec.Id
	}
	return runQuestCommand(ctx, s, actor, "upsertQuestArc", request, spec, meta, subject, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestArcView, error) {
		locked, err := repos.Arc.LockUpsertQuestArc(ctx, spec)
		if err != nil {
			return QuestArcView{}, err
		}
		if spec.Id != nil && !locked.Exists {
			return QuestArcView{}, apierr.New(apierr.NotFound, "quest arc not found")
		}
		return repos.Arc.StoreUpsertQuestArc(ctx, UpsertQuestArcWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) RemoveQuestFromArc(ctx context.Context, actor auth.Authority, spec RemoveQuestFromArcSpec, meta product.CommandMeta) (QuestView, error) {
	if s.Queries == nil {
		return QuestView{}, apierr.New(apierr.Internal, "quest queries unavailable")
	}
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.QuestId = questID
	preview, err := s.Queries.Quest(ctx, actor, QuestSpec{Id: &questID})
	if err != nil {
		return QuestView{}, err
	}
	if preview == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if preview.DmId == "" {
		return QuestView{}, apierr.New(apierr.Invalid, "quest dm missing")
	}
	request, err := auth.ForQuest("Mutation.removeQuestFromArc", auth.QuestFacts{ID: questID, DMID: preview.DmId})
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "removeQuestFromArc", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		locked, err := repos.Quest.LockRemoveQuestFromArc(ctx, RemoveQuestFromArcSpec{QuestId: questID, AsOf: at})
		if err != nil {
			return QuestView{}, err
		}
		if !locked.Exists {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreRemoveQuestFromArc(ctx, RemoveQuestFromArcWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: RemoveQuestFromArcSpec{QuestId: questID, AsOf: at},
			Locked:         locked,
		})
	})
}
