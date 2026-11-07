package quest

import (
	"context"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ProductCommands struct {
	Runner  uow.Runner[ProductCommandRepos]
	Clock   product.Clock
	IDs     product.IDGenerator
	Queries *ProductQueries
}

func NewProductCommands(runner uow.Runner[ProductCommandRepos], clock product.Clock, ids product.IDGenerator) (*ProductCommands, error) {
	for _, dependency := range []any{runner, clock, ids} {
		if product.MissingDependency(dependency) {
			return nil, apierr.New(apierr.Internal, "quest command dependencies required")
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock, IDs: ids}, nil
}

func commandPublicID(value *string) error {
	if value == nil {
		return nil
	}
	canonical, ok := product.CanonicalPublicID(*value)
	if !ok {
		return apierr.New(apierr.Invalid, "invalid public id")
	}
	*value = canonical
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
	return runQuestCommandWithRequest(ctx, s, actor, operation, func(ProductCommandRepos, auth.Authority) (auth.Request, error) { return request, nil }, spec, meta, subjectID, mutate)
}

func runQuestCommandWithRequest[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	operation string,
	requestFor func(ProductCommandRepos, auth.Authority) (auth.Request, error),
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
		fresh, request, decision, err := admitQuestCommand(ctx, repos, actor, requestFor)
		if err != nil {
			return err
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, operation, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			result, err = replayQuestCommand[T](ctx, repos, actor, fresh, decision, claim, requestFor, operation, subjectID)
			return err
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		if operation == "setQuestPointcrawlLinks" {
			fresh, request, decision, err = reauthorizeQuestPointcrawl(ctx, repos, actor, fresh, decision, requestFor)
			if err != nil {
				return err
			}
		}
		result, err = mutate(repos, fresh, at)
		if err != nil {
			return err
		}
		return completeQuestCommand(ctx, repos, claim, result, fresh, request, decision, operation, subjectID, at)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func admitQuestCommand(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, requestFor func(ProductCommandRepos, auth.Authority) (auth.Request, error)) (auth.Authority, auth.Request, auth.Decision, error) {
	var zero auth.Decision
	for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
		if product.MissingDependency(dependency) {
			return auth.Authority{}, auth.Request{}, zero, apierr.New(apierr.Internal, "quest transaction dependencies required")
		}
	}
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return auth.Authority{}, auth.Request{}, zero, err
	}
	if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
		return auth.Authority{}, auth.Request{}, zero, apierr.New(apierr.Forbidden, "member authority changed")
	}
	request, err := requestFor(repos, fresh)
	if err != nil {
		return auth.Authority{}, auth.Request{}, zero, err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return auth.Authority{}, auth.Request{}, zero, err
	}
	if !decision.Allowed {
		return auth.Authority{}, auth.Request{}, zero, apierr.New(apierr.Forbidden, "quest command forbidden")
	}
	return fresh, request, decision, nil
}

func replayQuestCommand[T any](ctx context.Context, repos ProductCommandRepos, actor, fresh auth.Authority, decision auth.Decision, claim idempotency.Claim, requestFor func(ProductCommandRepos, auth.Authority) (auth.Request, error), operation, subjectID string) (T, error) {
	current, currentRequest, _, err := reauthorizeQuestReplay(ctx, repos, actor, fresh, decision, requestFor)
	if err != nil {
		var zero T
		return zero, err
	}
	if err := admitLockedQuestReplay(ctx, repos, current, currentRequest, decision, subjectID); err != nil {
		var zero T
		return zero, err
	}
	var result T
	if err := json.Unmarshal(claim.Receipt, &result); err != nil {
		return result, err
	}
	if operation == "upsertQuestSummary" {
		result, err = readQuestSummaryReplay(ctx, repos, current, result)
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

func reauthorizeQuestReplay(ctx context.Context, repos ProductCommandRepos, actor, fresh auth.Authority, decision auth.Decision, requestFor func(ProductCommandRepos, auth.Authority) (auth.Request, error)) (auth.Authority, auth.Request, auth.Decision, error) {
	current, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	request, err := requestFor(repos, current)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	currentDecision, err := repos.Policy.Decide(ctx, current, request)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	if !currentDecision.Allowed {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, apierr.New(apierr.Forbidden, "quest command forbidden")
	}
	if !sameQuestAuthority(fresh, current) || currentDecision.UsedOverride && !decision.UsedOverride {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, apierr.New(apierr.Conflict, "quest admission changed; retry with current authority")
	}
	return current, request, currentDecision, nil
}

func admitLockedQuestReplay(ctx context.Context, repos ProductCommandRepos, current auth.Authority, request auth.Request, decision auth.Decision, subjectID string) error {
	switch request.Operation() {
	case "Mutation.updateQuest", "Mutation.transitionQuestStatus", "Mutation.closeQuest", "Mutation.deleteQuest", "Mutation.restoreQuest", "Mutation.selectQuestParticipants", "Mutation.addQuestParticipant", "Mutation.removeQuestParticipant", "Mutation.attestQuestParticipation", "Mutation.setQuestPointcrawlLinks", "Mutation.syncQuestDiscord", "Mutation.publishQuestPlayerList", "Mutation.removeQuestFromArc":
		locked, err := repos.Quest.LockRestoreQuest(ctx, RestoreQuestSpec{QuestId: subjectID})
		if err != nil {
			return err
		}
		if locked.OwnerID == "" {
			return apierr.New(apierr.NotFound, "quest not found")
		}
		lockedRequest, err := auth.ForQuest(request.Operation(), auth.QuestFacts{ID: subjectID, DMID: locked.OwnerID})
		if err != nil {
			return err
		}
		lockedDecision, err := repos.Policy.Decide(ctx, current, lockedRequest)
		if err != nil {
			return err
		}
		if !lockedDecision.Allowed {
			return apierr.New(apierr.Forbidden, "quest command forbidden")
		}
		if lockedDecision.UsedOverride && !decision.UsedOverride {
			return apierr.New(apierr.Conflict, "quest admission changed; retry with current authority")
		}
		return admitLockedQuest(ctx, repos, current, request.Operation(), subjectID, locked.OwnerID, locked.OwnerID)
	}
	return nil
}

func readQuestSummaryReplay[T any](ctx context.Context, repos ProductCommandRepos, actor auth.Authority, result T) (T, error) {
	stored, ok := any(result).(document.DocumentView)
	if !ok || product.MissingDependency(repos.SummaryDocuments) {
		return result, apierr.New(apierr.Internal, "summary replay reader required")
	}
	current, err := repos.SummaryDocuments.ReadDocumentById(ctx, actor, document.DocumentByIdSpec{Id: stored.Id})
	if err != nil {
		return result, err
	}
	if current == nil {
		return result, apierr.New(apierr.NotFound, "summary document not found")
	}
	return any(*current).(T), nil
}

func reauthorizeQuestPointcrawl(ctx context.Context, repos ProductCommandRepos, actor, fresh auth.Authority, decision auth.Decision, requestFor func(ProductCommandRepos, auth.Authority) (auth.Request, error)) (auth.Authority, auth.Request, auth.Decision, error) {
	current, currentRequest, currentDecision, err := reauthorizeQuestReplay(ctx, repos, actor, fresh, decision, requestFor)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	return current, currentRequest, currentDecision, nil
}

func completeQuestCommand[T any](ctx context.Context, repos ProductCommandRepos, claim idempotency.Claim, result T, actor auth.Authority, request auth.Request, decision auth.Decision, operation, subjectID string, at time.Time) error {
	if decision.UsedOverride {
		if product.MissingDependency(repos.Audit) {
			return apierr.New(apierr.Internal, "override recorder required")
		}
		id, err := questAuditSubject(operation, result, subjectID)
		if err != nil {
			return err
		}
		if err := repos.Audit.Record(ctx, claim, auth.OverrideFact{ActorID: actor.Claims().MemberID, Operation: request.Operation(), SubjectType: "quest", SubjectID: id, RuleCode: decision.RuleCode, At: at}); err != nil {
			return err
		}
	}
	receipt, err := json.Marshal(result)
	if err != nil {
		return err
	}
	if operation == "closeQuest" {
		var closed map[string]json.RawMessage
		if err := json.Unmarshal(receipt, &closed); err != nil {
			return err
		}
		closed["rewardCoverage"] = json.RawMessage(`"COMPLETE"`)
		receipt, err = json.Marshal(closed)
		if err != nil {
			return err
		}
	}
	return repos.Replay.Complete(ctx, claim, receipt)
}

func questAuditSubject[T any](operation string, result T, subjectID string) (string, error) {
	switch operation {
	case "createQuest":
		view, ok := any(result).(QuestView)
		if !ok {
			return "", apierr.New(apierr.Internal, "quest audit subject required")
		}
		return view.Id, nil
	case "upsertQuestArc":
		view, ok := any(result).(QuestArcView)
		if !ok {
			return "", apierr.New(apierr.Internal, "arc audit subject required")
		}
		return view.Id, nil
	case "upsertQuestSummary":
		view, ok := any(result).(document.DocumentView)
		if !ok {
			return "", apierr.New(apierr.Internal, "summary audit subject required")
		}
		return view.Id, nil
	default:
		return subjectID, nil
	}
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
		if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
			return QuestView{}, err
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
