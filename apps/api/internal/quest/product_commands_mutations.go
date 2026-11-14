package quest

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func (s ProductCommands) requireQueries() error {
	if s.Queries == nil {
		return apierr.New(apierr.Internal, "quest queries unavailable")
	}
	return nil
}

func (s ProductCommands) previewQuest(ctx context.Context, actor auth.Authority, questID string) (*QuestView, error) {
	if err := s.requireQueries(); err != nil {
		return nil, err
	}
	preview, err := s.Queries.Quest(ctx, actor, QuestSpec{Id: &questID})
	if err != nil {
		return nil, err
	}
	if preview == nil {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if preview.DmId == "" {
		return nil, apierr.New(apierr.Invalid, "quest dm missing")
	}
	return preview, nil
}

func (s ProductCommands) questDMRequest(ctx context.Context, actor auth.Authority, operation auth.Operation, questID string) (auth.Request, *QuestView, error) {
	preview, err := s.previewQuest(ctx, actor, questID)
	if err != nil {
		return auth.Request{}, nil, err
	}
	request, err := auth.ForQuest(operation, auth.QuestFacts{ID: questID, DMID: preview.DmId})
	if err != nil {
		return auth.Request{}, nil, err
	}
	return request, preview, nil
}

func sameQuestAuthority(a, b auth.Authority) bool {
	return a.Claims().MemberID == b.Claims().MemberID && slices.Equal(a.Claims().Roles, b.Claims().Roles) &&
		a.LiveDM() == b.LiveDM() && a.Handle() == b.Handle() && a.IsPlatformOwner() == b.IsPlatformOwner()
}

func admitLockedQuest(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation, questID, expectedDMID, dmID string) error {
	current, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return err
	}
	if current.Claims().MemberID != actor.Claims().MemberID {
		return apierr.New(apierr.Forbidden, "member authority changed")
	}
	request, err := auth.ForQuest(operation, auth.QuestFacts{ID: questID, DMID: dmID})
	if err != nil {
		return err
	}
	decision, err := repos.Policy.Decide(ctx, current, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "quest command forbidden")
	}
	if dmID != expectedDMID || !sameQuestAuthority(actor, current) {
		return apierr.New(apierr.Conflict, "quest admission changed; retry with current authority")
	}
	return nil
}

func validateQuestSignupType(value *string) error {
	if value != nil && *value != "last_game_played" && *value != "dm_pick" {
		return apierr.New(apierr.Invalid, "invalid quest signup type")
	}
	return nil
}

// questKinds is the quest kind vocabulary; it matches the quests_kinds_vocab
// check constraint and schema-v2's quest_kind list.
var questKinds = []string{"standard", "event", "lieutenant", "hexcrawl", "one_shot", "mini_campaign"}

func validateQuestKinds(kinds []string) error {
	if len(kinds) == 0 {
		return apierr.New(apierr.Invalid, "at least one quest kind is required")
	}
	for _, kind := range kinds {
		if !slices.Contains(questKinds, kind) {
			return apierr.New(apierr.Invalid, fmt.Sprintf("unknown quest kind %q; allowed kinds: %s", kind, strings.Join(questKinds, ", ")))
		}
	}
	return nil
}

func recordQuestEvents(ctx context.Context, repos ProductCommandRepos, events []notification.Event) error {
	for _, event := range events {
		if product.MissingDependency(repos.Producer) {
			return apierr.New(apierr.Internal, "quest notification producer required")
		}
		if err := repos.Producer.Record(ctx, repos.Notice, event); err != nil {
			return err
		}
	}
	return nil
}

func (s ProductCommands) CreateQuest(ctx context.Context, actor auth.Authority, spec CreateQuestSpec, meta product.CommandMeta) (QuestView, error) {
	input, title, err := normalizeCreateQuestInput(spec.Input)
	if err != nil {
		return QuestView{}, err
	}
	dmID := actor.Claims().MemberID
	if input.DmId != nil && strings.TrimSpace(*input.DmId) != "" {
		id := strings.TrimSpace(*input.DmId)
		if err := commandPublicID(&id); err != nil {
			return QuestView{}, err
		}
		dmID = id
		input.DmId = &dmID
	}
	spec.Input = input
	request, err := auth.ForQuestCreate(auth.QuestCreateFacts{RequestedDMID: dmID})
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "createQuest", request, spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		return createQuest(ctx, s, repos, fresh, at, spec, input, title, dmID)
	})
}

// normalizeCreateQuestInput validates a new quest's fields and fills the default
// kinds, tags and genres. It returns the trimmed title.
func normalizeCreateQuestInput(input CreateQuestFields) (CreateQuestFields, string, error) {
	if err := validateQuestSignupType(input.SignupType); err != nil {
		return input, "", err
	}
	title := strings.TrimSpace(input.Title)
	if title == "" || utf8.RuneCountInString(title) > 200 {
		return input, "", apierr.New(apierr.Invalid, "invalid quest title")
	}
	if strings.TrimSpace(input.BriefBody) == "" {
		return input, "", apierr.New(apierr.Invalid, "quest brief required")
	}
	if input.SlotsMax <= 0 || input.DurationHours <= 0 || input.ScheduledAt.IsZero() {
		return input, "", apierr.New(apierr.Invalid, "invalid quest schedule")
	}
	if input.Kinds == nil {
		input.Kinds = []string{"standard"}
	}
	if err := validateQuestKinds(input.Kinds); err != nil {
		return input, "", err
	}
	if input.Tags == nil {
		input.Tags = []string{}
	}
	if input.Genres == nil {
		input.Genres = []string{}
	}
	return input, title, nil
}

// questArcForbiddenMessage explains a refusal to place a quest in a series the actor may not use.
const questArcForbiddenMessage = "you can add a quest only to a series you started; an admin may use any series"

// admitQuestArc checks that the actor may place a quest in the series arcID. It uses
// the series rename rule: the series creator, or an actor with current admin (or
// platform owner) authority. An empty or absent arcID needs no check. An unknown
// series stays NotFound.
func admitQuestArc(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, arcID *string) error {
	if arcID == nil || strings.TrimSpace(*arcID) == "" {
		return nil
	}
	id := strings.TrimSpace(*arcID)
	if err := commandPublicID(&id); err != nil {
		return err
	}
	if product.MissingDependency(repos.Arc) || repos.Policy == nil {
		return apierr.New(apierr.Internal, "quest arc dependencies required")
	}
	locked, err := repos.Arc.LockUpsertQuestArc(ctx, UpsertQuestArcSpec{Id: &id})
	if err != nil {
		return err
	}
	if !locked.Exists || locked.Before == nil {
		return apierr.New(apierr.NotFound, "quest arc not found")
	}
	author := locked.Before.CreatedBy
	request, err := auth.ForArc(auth.ArcFacts{ID: &id, AuthorID: &author})
	if err != nil {
		return err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, questArcForbiddenMessage)
	}
	return nil
}

func createQuest(ctx context.Context, s ProductCommands, repos ProductCommandRepos, fresh auth.Authority, at time.Time, spec CreateQuestSpec, input CreateQuestFields, title, dmID string) (QuestView, error) {
	if product.MissingDependency(repos.Brief) {
		return QuestView{}, apierr.New(apierr.Internal, "quest brief writer required")
	}
	target, err := repos.Authority(ctx, dmID)
	if err != nil {
		return QuestView{}, err
	}
	if target.Claims().MemberID != dmID || !target.LiveDM() {
		return QuestView{}, apierr.New(apierr.Forbidden, "quest DM must be active and approved")
	}
	if err := admitQuestArc(ctx, repos, fresh, input.ArcId); err != nil {
		return QuestView{}, err
	}
	questID := s.IDs()
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	locked, err := repos.Quest.LockCreateQuest(ctx, CreateQuestSpec{Input: input, AsOf: at})
	if err != nil {
		return QuestView{}, err
	}
	locked.SubjectID = questID
	brief, err := repos.Brief.CreateBrief(ctx, fresh, document.BriefCreate{
		QuestID:        questID,
		Title:          title,
		Body:           input.BriefBody,
		AdditionalInfo: input.AdditionalInfo,
		DMID:           dmID,
		RegionIDs:      input.RegionIds,
		At:             at,
	})
	if err != nil {
		return QuestView{}, err
	}
	docID := brief.Document.Id
	result, err := repos.Quest.StoreCreateQuest(ctx, CreateQuestWrite{
		ActorID:        fresh.Claims().MemberID,
		At:             at,
		Input:          spec,
		ValidatedInput: CreateQuestSpec{Input: input, AsOf: at},
		Locked:         locked,
		RevisionID:     &docID,
	})
	if err != nil {
		return QuestView{}, err
	}
	if err := recordQuestEvents(ctx, repos, brief.Events); err != nil {
		return QuestView{}, err
	}
	return result, nil
}

func (s ProductCommands) UpdateQuest(ctx context.Context, actor auth.Authority, spec UpdateQuestSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.Id)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.Id = questID
	if spec.Input.SignupType.Set {
		if err := validateQuestSignupType(spec.Input.SignupType.Value); err != nil {
			return QuestView{}, err
		}
	}
	if spec.Input.Kinds.Set && spec.Input.Kinds.Value != nil {
		if err := validateQuestKinds(*spec.Input.Kinds.Value); err != nil {
			return QuestView{}, err
		}
	}
	if spec.Input.SlotsMax.Set && spec.Input.SlotsMax.Value != nil && (*spec.Input.SlotsMax.Value < 1 || *spec.Input.SlotsMax.Value > 100) {
		return QuestView{}, apierr.New(apierr.Invalid, "invalid quest schedule")
	}
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.updateQuest", questID)
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "updateQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		return updateQuest(ctx, repos, fresh, at, spec, questID, request, preview)
	})
}

func updateQuest(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, spec UpdateQuestSpec, questID string, request auth.Request, preview *QuestView) (QuestView, error) {
	locked, err := repos.Quest.LockUpdateQuest(ctx, UpdateQuestSpec{Id: questID, Input: spec.Input, AsOf: at})
	if err != nil {
		return QuestView{}, err
	}
	if !locked.Exists {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
		return QuestView{}, err
	}
	if locked.Before != nil && questEditExceedsSeatCap(spec.Input, *locked.Before) {
		return QuestView{}, apierr.New(apierr.Invalid, "quest capacity exceeded")
	}
	if spec.Input.ArcId.Set {
		if err := admitQuestArc(ctx, repos, fresh, spec.Input.ArcId.Value); err != nil {
			return QuestView{}, err
		}
	}
	briefEvents, err := editQuestBrief(ctx, repos, fresh, at, spec.Input, locked)
	if err != nil {
		return QuestView{}, err
	}
	result, err := repos.Quest.StoreUpdateQuest(ctx, UpdateQuestWrite{
		ActorID: fresh.Claims().MemberID, At: at, Input: spec,
		ValidatedInput: UpdateQuestSpec{Id: questID, Input: spec.Input, AsOf: at}, Locked: locked,
	})
	if err != nil {
		return QuestView{}, err
	}
	if err := recordQuestEvents(ctx, repos, briefEvents); err != nil {
		return QuestView{}, err
	}
	return result, nil
}

// questEditExceedsSeatCap reports whether the signup type and seat count about to be
// saved would put a capped quest over its filled count. DM Pick may stay over slots_max.
func questEditExceedsSeatCap(input QuestEditFields, before QuestView) bool {
	signup := before.SignupType
	if input.SignupType.Set {
		signup = input.SignupType.Value
	}
	slots := before.SlotsMax
	if input.SlotsMax.Set && input.SlotsMax.Value != nil {
		slots = *input.SlotsMax.Value
	}
	if signup != nil && *signup == dmPickSignup {
		return false
	}
	return before.FilledCount > slots
}

func editQuestBrief(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, input QuestEditFields, locked UpdateQuestState) ([]notification.Event, error) {
	if repos.Brief == nil || locked.Before == nil || locked.Before.DocumentId == nil ||
		(!input.Title.Set && !input.BriefBody.Set && !input.AdditionalInfo.Set) {
		return nil, nil
	}
	edit := document.BriefEdit{DocumentID: *locked.Before.DocumentId, At: at}
	if input.Title.Set {
		edit.Title = input.Title
	}
	if input.BriefBody.Set {
		edit.Body = input.BriefBody
	}
	if input.AdditionalInfo.Set {
		edit.AdditionalInfo = input.AdditionalInfo
	}
	result, err := repos.Brief.EditBrief(ctx, fresh, edit)
	if err != nil {
		return nil, err
	}
	return result.Events, nil
}

func (s ProductCommands) TransitionQuestStatus(ctx context.Context, actor auth.Authority, spec TransitionQuestStatusSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.Id)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.Id = questID
	to := strings.TrimSpace(spec.To)
	if to == "" {
		return QuestView{}, apierr.New(apierr.Invalid, "invalid quest status")
	}
	spec.To = to
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.transitionQuestStatus", questID)
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "transitionQuestStatus", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		locked, err := repos.Quest.LockTransitionQuestStatus(ctx, TransitionQuestStatusSpec{Id: questID, To: to, AsOf: at})
		if err != nil {
			return QuestView{}, err
		}
		if !locked.Exists {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
			return QuestView{}, err
		}
		return repos.Quest.StoreTransitionQuestStatus(ctx, TransitionQuestStatusWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: TransitionQuestStatusSpec{Id: questID, To: to, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) CloseQuest(ctx context.Context, actor auth.Authority, spec CloseQuestSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.Id)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.Id = questID
	if err := normalizeQuestClosure(&spec.Input); err != nil {
		return QuestView{}, err
	}
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.closeQuest", questID)
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "closeQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		return closeQuest(ctx, repos, fresh, at, spec, questID, request, preview)
	})
}

func closeQuest(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, spec CloseQuestSpec, questID string, request auth.Request, preview *QuestView) (QuestView, error) {
	if product.MissingDependency(repos.Rewards) {
		return QuestView{}, apierr.New(apierr.Internal, "quest reward writer required")
	}
	characters, err := repos.Rewards.LockQuestRoster(ctx, questID)
	if err != nil {
		return QuestView{}, err
	}
	locked, err := repos.Quest.LockCloseQuest(ctx, CloseQuestSpec{Id: questID, Input: spec.Input, AsOf: at})
	if err != nil {
		return QuestView{}, err
	}
	if !locked.Exists {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
		return QuestView{}, err
	}
	if err := validateQuestClosure(locked, characters, spec.Input); err != nil {
		return QuestView{}, err
	}
	result, err := repos.Quest.StoreCloseQuest(ctx, CloseQuestWrite{
		ActorID: fresh.Claims().MemberID, At: at, Input: spec,
		ValidatedInput: CloseQuestSpec{Id: questID, Input: spec.Input, AsOf: at}, Locked: locked,
	})
	if err != nil {
		return QuestView{}, err
	}
	awards := make([]character.QuestPCXPAward, 0, len(spec.Input.Rewards))
	for _, reward := range spec.Input.Rewards {
		awards = append(awards, character.QuestPCXPAward{CharacterID: reward.CharacterId, Amount: reward.Pcxp, Note: reward.Note})
	}
	if err := repos.Rewards.AwardQuestPCXP(ctx, questID, fresh.Claims().MemberID, awards, at); err != nil {
		return QuestView{}, err
	}
	return result, nil
}

func (s ProductCommands) DeleteQuest(ctx context.Context, actor auth.Authority, spec DeleteQuestSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return product.CommandReceipt{}, err
	}
	spec.QuestId = questID
	var ownerID string
	requestFor := func(repos ProductCommandRepos, _ auth.Authority) (auth.Request, error) {
		locked, err := repos.Quest.LockRestoreQuest(ctx, RestoreQuestSpec{QuestId: questID})
		if err != nil {
			return auth.Request{}, err
		}
		if locked.OwnerID == "" {
			return auth.Request{}, apierr.New(apierr.NotFound, "quest not found")
		}
		ownerID = locked.OwnerID
		return auth.ForQuest("Mutation.deleteQuest", auth.QuestFacts{ID: questID, DMID: ownerID})
	}
	return runQuestCommandWithRequest(ctx, s, actor, "deleteQuest", requestFor, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		locked, err := repos.Quest.LockDeleteQuest(ctx, DeleteQuestSpec{QuestId: questID, AsOf: at})
		if err != nil {
			return product.CommandReceipt{}, err
		}
		if !locked.Exists {
			return product.CommandReceipt{}, apierr.New(apierr.NotFound, "quest not found")
		}
		if err := admitLockedQuest(ctx, repos, fresh, "Mutation.deleteQuest", questID, ownerID, locked.OwnerID); err != nil {
			return product.CommandReceipt{}, err
		}
		return repos.Quest.StoreDeleteQuest(ctx, DeleteQuestWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: DeleteQuestSpec{QuestId: questID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) RestoreQuest(ctx context.Context, actor auth.Authority, spec RestoreQuestSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.QuestId = questID
	var locked RestoreQuestState
	requestFor := func(repos ProductCommandRepos, fresh auth.Authority) (auth.Request, error) {
		var err error
		locked, err = repos.Quest.LockRestoreQuest(ctx, RestoreQuestSpec{QuestId: questID})
		if err != nil {
			return auth.Request{}, err
		}
		if locked.OwnerID == "" {
			return auth.Request{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return auth.ForQuest("Mutation.restoreQuest", auth.QuestFacts{ID: questID, DMID: locked.OwnerID})
	}
	return runQuestCommandWithRequest(ctx, s, actor, "restoreQuest", requestFor, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		if !locked.Exists {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		if err := admitLockedQuest(ctx, repos, fresh, "Mutation.restoreQuest", questID, locked.OwnerID, locked.OwnerID); err != nil {
			return QuestView{}, err
		}
		return repos.Quest.StoreRestoreQuest(ctx, RestoreQuestWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: RestoreQuestSpec{QuestId: questID, AsOf: at}, Locked: locked})
	})
}

func (s ProductCommands) SignupForQuest(ctx context.Context, actor auth.Authority, spec SignupForQuestSpec, meta product.CommandMeta) (QuestParticipantView, error) {
	questID, characterID := strings.TrimSpace(spec.QuestId), strings.TrimSpace(spec.CharacterId)
	if err := commandPublicID(&questID); err != nil {
		return QuestParticipantView{}, err
	}
	if err := commandPublicID(&characterID); err != nil {
		return QuestParticipantView{}, err
	}
	spec.QuestId, spec.CharacterId = questID, characterID
	requestFor := func(repos ProductCommandRepos, fresh auth.Authority) (auth.Request, error) {
		return ownedQuestCharacterRequest(ctx, repos, fresh, "Mutation.signupForQuest", characterID)
	}
	return runQuestCommandWithRequest(ctx, s, actor, "signupForQuest", requestFor, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestParticipantView, error) {
		locked, err := lockQuestSignup(ctx, repos, fresh, questID, characterID, at)
		if err != nil {
			return QuestParticipantView{}, err
		}
		result, bumpedCharacterID, err := repos.Quest.StoreSignupForQuest(ctx, SignupForQuestWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: SignupForQuestSpec{QuestId: questID, CharacterId: characterID, AsOf: at}, Locked: locked})
		if err != nil {
			return QuestParticipantView{}, err
		}
		var from *string
		if previous := questParticipant(locked.Roster, characterID); previous != nil {
			from = &previous.Status
		}
		key := "quest-signup:" + questID + ":" + characterID + ":" + meta.IdempotencyKey
		if err := recordQuestParticipation(ctx, repos, fresh, notification.QuestSignupConfirmed, key, questID, characterID, from, result.Status, at); err != nil {
			return QuestParticipantView{}, err
		}
		if bumpedCharacterID != "" {
			fromStatus := "signed_up"
			bumpKey := "quest-bump:" + questID + ":" + bumpedCharacterID + ":" + meta.IdempotencyKey
			if err := recordQuestParticipation(ctx, repos, fresh, notification.QuestWaitlistPromoted, bumpKey, questID, bumpedCharacterID, &fromStatus, "waitlisted", at); err != nil {
				return QuestParticipantView{}, err
			}
		}
		return result, nil
	})
}

func lockQuestSignup(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, questID, characterID string, at time.Time) (SignupForQuestState, error) {
	admission, err := repos.Characters.LockAdmission(ctx, characterID)
	if err != nil {
		return SignupForQuestState{}, err
	}
	if admission.OwnerID != actor.Claims().MemberID {
		return SignupForQuestState{}, apierr.New(apierr.Forbidden, "character owner required")
	}
	if !eligibleQuestCharacter(admission) {
		return SignupForQuestState{}, apierr.New(apierr.Conflict, "active approved character required")
	}
	locked, err := repos.Quest.LockSignupForQuest(ctx, SignupForQuestSpec{QuestId: questID, CharacterId: characterID, AsOf: at})
	if err != nil {
		return SignupForQuestState{}, err
	}
	if !locked.Exists {
		return SignupForQuestState{}, apierr.New(apierr.NotFound, "quest not found")
	}
	locked.Character = &admission
	return locked, nil
}

func (s ProductCommands) WithdrawFromQuest(ctx context.Context, actor auth.Authority, spec WithdrawFromQuestSpec, meta product.CommandMeta) (QuestParticipantView, error) {
	questID, characterID := strings.TrimSpace(spec.QuestId), strings.TrimSpace(spec.CharacterId)
	if err := commandPublicID(&questID); err != nil {
		return QuestParticipantView{}, err
	}
	if err := commandPublicID(&characterID); err != nil {
		return QuestParticipantView{}, err
	}
	spec.QuestId, spec.CharacterId = questID, characterID
	requestFor := func(repos ProductCommandRepos, fresh auth.Authority) (auth.Request, error) {
		return ownedQuestCharacterRequest(ctx, repos, fresh, "Mutation.withdrawFromQuest", characterID)
	}
	for range 3 {
		result, err := runQuestCommandWithRequest(ctx, s, actor, "withdrawFromQuest", requestFor, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestParticipantView, error) {
			return withdrawFromQuest(ctx, repos, fresh, at, questID, characterID)
		})
		if !errors.Is(err, character.ErrWithdrawalPlanChanged) {
			return result, err
		}
	}
	return QuestParticipantView{}, apierr.New(apierr.Conflict, "quest roster kept changing during withdrawal")
}

func withdrawFromQuest(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, questID, characterID string) (QuestParticipantView, error) {
	plan, _, own, err := prepareQuestCharacterWithdrawal(ctx, repos, fresh, questID, characterID)
	if err != nil {
		return QuestParticipantView{}, err
	}
	var effects character.WithdrawalEffects
	if len(plan.QuestIDs) != 0 {
		effects, err = repos.Withdrawals.WithdrawOwnedCharacter(ctx, fresh.Claims().MemberID, plan, "withdrawn", at)
		if err != nil {
			return QuestParticipantView{}, err
		}
	}
	locked, err := repos.Quest.LockWithdrawFromQuest(ctx, WithdrawFromQuestSpec{QuestId: questID, CharacterId: characterID, AsOf: at})
	if err != nil {
		return QuestParticipantView{}, err
	}
	if err := admitLockedQuestCharacter(ctx, repos, fresh, "Mutation.withdrawFromQuest", characterID, own.OwnerID); err != nil {
		return QuestParticipantView{}, err
	}
	participant, err := validateQuestWithdrawalState(locked, characterID)
	if err != nil {
		return QuestParticipantView{}, err
	}
	if err := recordQuestEvents(ctx, repos, effects.Events); err != nil {
		return QuestParticipantView{}, err
	}
	return *participant, nil
}

func prepareQuestCharacterWithdrawal(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, questID, characterID string) (character.WithdrawalPlan, []character.Admission, *character.Admission, error) {
	if product.MissingDependency(repos.Withdrawals) {
		return character.WithdrawalPlan{}, nil, nil, apierr.New(apierr.Internal, "character withdrawal writer required")
	}
	plan, err := repos.Withdrawals.PlanOwnedCharacterWithdrawal(ctx, characterID, []string{questID})
	if err != nil {
		return character.WithdrawalPlan{}, nil, nil, err
	}
	admissions, err := repos.Characters.LockAdmissions(ctx, plan.CharacterIDs)
	if err != nil {
		return character.WithdrawalPlan{}, nil, nil, err
	}
	if len(admissions) != len(plan.CharacterIDs) {
		return character.WithdrawalPlan{}, nil, nil, character.ErrWithdrawalPlanChanged
	}
	currentPlan, err := repos.Withdrawals.PlanOwnedCharacterWithdrawal(ctx, characterID, []string{questID})
	if err != nil {
		return character.WithdrawalPlan{}, nil, nil, err
	}
	if !reflect.DeepEqual(plan, currentPlan) {
		return character.WithdrawalPlan{}, nil, nil, character.ErrWithdrawalPlanChanged
	}
	var own *character.Admission
	for i := range admissions {
		if admissions[i].ID == characterID {
			own = &admissions[i]
		}
	}
	if own == nil {
		return character.WithdrawalPlan{}, nil, nil, apierr.New(apierr.NotFound, "character not found")
	}
	if own.OwnerID != fresh.Claims().MemberID {
		return character.WithdrawalPlan{}, nil, nil, apierr.New(apierr.Forbidden, "character owner required")
	}
	return plan, admissions, own, nil
}

func validateQuestWithdrawalState(locked WithdrawFromQuestState, characterID string) (*QuestParticipantView, error) {
	if !locked.Exists || locked.Before == nil {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if locked.Before.Status != "open" && locked.Before.Status != "full" {
		return nil, apierr.New(apierr.Conflict, "quest is not accepting withdrawals")
	}
	participant := questParticipant(locked.Roster, characterID)
	if participant == nil {
		return nil, apierr.New(apierr.NotFound, "participant not found")
	}
	if participant.Status == "signed_up" || participant.Status == "waitlisted" {
		return nil, character.ErrWithdrawalPlanChanged
	}
	if participant.Status != "withdrawn" {
		return nil, apierr.New(apierr.Conflict, "participation is already final")
	}
	return participant, nil
}

func (s ProductCommands) SelectQuestParticipants(ctx context.Context, actor auth.Authority, spec SelectQuestParticipantsSpec, meta product.CommandMeta) ([]QuestParticipantView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return nil, err
	}
	if spec.FillByLastGamePlayed && len(spec.CharacterIds) > 0 {
		return nil, apierr.New(apierr.Invalid, "last game played fill does not take characters")
	}
	if !spec.FillByLastGamePlayed && len(spec.CharacterIds) > 100 {
		return nil, apierr.New(apierr.Invalid, "at most 100 participants may be selected")
	}
	ids := make([]string, 0, len(spec.CharacterIds))
	seen := make(map[string]bool, len(spec.CharacterIds))
	for _, id := range spec.CharacterIds {
		id = strings.TrimSpace(id)
		if err := commandPublicID(&id); err != nil {
			return nil, err
		}
		if seen[id] {
			return nil, apierr.New(apierr.Invalid, "selected characters must be unique")
		}
		seen[id] = true
		ids = append(ids, id)
	}
	spec.QuestId, spec.CharacterIds = questID, ids
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.selectQuestParticipants", questID)
	if err != nil {
		return nil, err
	}
	return runQuestCommand(ctx, s, actor, "selectQuestParticipants", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]QuestParticipantView, error) {
		return selectQuestParticipants(ctx, repos, fresh, at, spec, questID, ids, request, preview, meta.IdempotencyKey)
	})
}

func selectQuestParticipants(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, spec SelectQuestParticipantsSpec, questID string, ids []string, request auth.Request, preview *QuestView, key string) ([]QuestParticipantView, error) {
	if product.MissingDependency(repos.Characters) {
		return nil, apierr.New(apierr.Internal, "character admission reader required")
	}
	if spec.FillByLastGamePlayed {
		var err error
		ids, err = repos.Quest.WaitlistedCharacterIDs(ctx, questID)
		if err != nil {
			return nil, err
		}
	}
	admissions, err := repos.Characters.LockAdmissions(ctx, ids)
	if err != nil {
		return nil, err
	}
	locked, err := repos.Quest.LockSelectQuestParticipants(ctx, SelectQuestParticipantsSpec{QuestId: questID, CharacterIds: ids, AsOf: at})
	if err != nil {
		return nil, err
	}
	if !locked.Exists {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
		return nil, err
	}
	locked.Candidates = admissions
	result, err := repos.Quest.StoreSelectQuestParticipants(ctx, SelectQuestParticipantsWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: SelectQuestParticipantsSpec{QuestId: questID, CharacterIds: ids, AsOf: at, FillByLastGamePlayed: spec.FillByLastGamePlayed}, Locked: locked, DMPicked: !spec.FillByLastGamePlayed})
	if err != nil || len(result) == 0 {
		return result, err
	}
	if _, err := repos.Quest.StoreSyncQuestDiscord(ctx, SyncQuestDiscordWrite{ActorID: fresh.Claims().MemberID, At: at, ValidatedInput: SyncQuestDiscordSpec{QuestId: questID, AsOf: at}, Locked: SyncQuestDiscordState{Exists: true}}); err != nil {
		return nil, err
	}
	if err := recordQuestPromotions(ctx, repos, fresh, at, questID, result, key); err != nil {
		return nil, err
	}
	return result, nil
}

func recordQuestPromotions(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, questID string, participants []QuestParticipantView, key string) error {
	from := "waitlisted"
	for _, participant := range participants {
		idempotencyKey := "quest-selection:" + questID + ":" + participant.CharacterId + ":" + key
		if err := recordQuestParticipation(ctx, repos, fresh, notification.QuestWaitlistPromoted, idempotencyKey, questID, participant.CharacterId, &from, "signed_up", at); err != nil {
			return err
		}
	}
	return nil
}

func (s ProductCommands) AddQuestParticipant(ctx context.Context, actor auth.Authority, spec CorrectQuestRosterSpec, meta product.CommandMeta) (QuestParticipantView, error) {
	return s.correctQuestRoster(ctx, actor, spec, meta, "add", "addQuestParticipant", "Mutation.addQuestParticipant")
}

func (s ProductCommands) RemoveQuestParticipant(ctx context.Context, actor auth.Authority, spec CorrectQuestRosterSpec, meta product.CommandMeta) (QuestParticipantView, error) {
	return s.correctQuestRoster(ctx, actor, spec, meta, "remove", "removeQuestParticipant", "Mutation.removeQuestParticipant")
}

func (s ProductCommands) correctQuestRoster(ctx context.Context, actor auth.Authority, spec CorrectQuestRosterSpec, meta product.CommandMeta, action, operation, policyOperation string) (QuestParticipantView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	characterID := strings.TrimSpace(spec.CharacterId)
	if err := commandPublicID(&questID); err != nil {
		return QuestParticipantView{}, err
	}
	if err := commandPublicID(&characterID); err != nil {
		return QuestParticipantView{}, err
	}
	spec.QuestId, spec.CharacterId, spec.Action = questID, characterID, action
	request, preview, err := s.questDMRequest(ctx, actor, auth.Operation(policyOperation), questID)
	if err != nil {
		return QuestParticipantView{}, err
	}
	return runQuestCommand(ctx, s, actor, operation, request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestParticipantView, error) {
		return applyQuestRosterCorrection(ctx, repos, fresh, at, spec, request, preview)
	})
}

func applyQuestRosterCorrection(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, spec CorrectQuestRosterSpec, request auth.Request, preview *QuestView) (QuestParticipantView, error) {
	if product.MissingDependency(repos.Characters) {
		return QuestParticipantView{}, apierr.New(apierr.Internal, "character admission reader required")
	}
	admissions, err := repos.Characters.LockAdmissions(ctx, []string{spec.CharacterId})
	if err != nil {
		return QuestParticipantView{}, err
	}
	locked, err := repos.Quest.LockSelectQuestParticipants(ctx, SelectQuestParticipantsSpec{QuestId: spec.QuestId, CharacterIds: []string{spec.CharacterId}, AsOf: at})
	if err != nil {
		return QuestParticipantView{}, err
	}
	if !locked.Exists || locked.Before == nil {
		return QuestParticipantView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), spec.QuestId, preview.DmId, locked.OwnerID); err != nil {
		return QuestParticipantView{}, err
	}
	view, skipped, err := repos.Quest.StoreCorrectQuestRoster(ctx, CorrectQuestRosterWrite{
		At: at, ValidatedInput: spec, Quest: locked.Before, Roster: locked.Roster, Candidates: admissions,
		Staff: fresh.Claims().Has(auth.Admin) || fresh.IsPlatformOwner(), QuestRowID: locked.QuestRowID,
	})
	if err != nil || skipped {
		return view, err
	}
	if _, err := repos.Quest.StoreSyncQuestDiscord(ctx, SyncQuestDiscordWrite{
		ActorID: fresh.Claims().MemberID, At: at,
		ValidatedInput: SyncQuestDiscordSpec{QuestId: spec.QuestId, AsOf: at},
		Locked:         SyncQuestDiscordState{Exists: true},
	}); err != nil {
		return QuestParticipantView{}, err
	}
	return view, nil
}

func (s ProductCommands) AttestQuestParticipation(ctx context.Context, actor auth.Authority, spec AttestQuestParticipationSpec, meta product.CommandMeta) ([]QuestParticipantView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return nil, err
	}
	entries := make([]ParticipationAttestationFields, 0, len(spec.Entries))
	seen := make(map[string]bool, len(spec.Entries))
	for _, entry := range spec.Entries {
		characterID := strings.TrimSpace(entry.CharacterId)
		if err := commandPublicID(&characterID); err != nil {
			return nil, err
		}
		if seen[characterID] {
			return nil, apierr.New(apierr.Invalid, "attendance requires unique characters and played or no_show status")
		}
		seen[characterID] = true
		entries = append(entries, ParticipationAttestationFields{CharacterId: characterID, Status: strings.TrimSpace(entry.Status)})
	}
	spec.QuestId, spec.Entries = questID, entries
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.attestQuestParticipation", questID)
	if err != nil {
		return nil, err
	}
	return runQuestCommand(ctx, s, actor, "attestQuestParticipation", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]QuestParticipantView, error) {
		locked, err := repos.Quest.LockAttestQuestParticipation(ctx, AttestQuestParticipationSpec{QuestId: questID, Entries: entries, AsOf: at})
		if err != nil {
			return nil, err
		}
		if !locked.Exists {
			return nil, apierr.New(apierr.NotFound, "quest not found")
		}
		if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
			return nil, err
		}
		return repos.Quest.StoreAttestQuestParticipation(ctx, AttestQuestParticipationWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: AttestQuestParticipationSpec{QuestId: questID, Entries: entries, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) SetQuestHexes(ctx context.Context, actor auth.Authority, spec SetQuestHexesSpec, meta product.CommandMeta) ([]QuestHexView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return nil, err
	}
	hexes, candidates, err := normalizeQuestHexes(spec.Hexes)
	if err != nil {
		return nil, err
	}
	spec.QuestId, spec.Hexes = questID, hexes
	preview, err := s.previewQuest(ctx, actor, questID)
	if err != nil {
		return nil, err
	}
	requestFor := func(repos ProductCommandRepos, fresh auth.Authority) (auth.Request, error) {
		return questHexRequest(ctx, repos, fresh, spec, questID, preview, candidates)
	}
	return runQuestCommandWithRequest(ctx, s, actor, "setQuestPointcrawlLinks", requestFor, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]QuestHexView, error) {
		return storeQuestHexes(ctx, repos, fresh, at, spec, questID, preview, hexes)
	})
}

func normalizeQuestHexes(input []QuestHexFields) ([]QuestHexFields, []spatial.QuestPointcrawlCandidate, error) {
	hexes := make([]QuestHexFields, 0, len(input))
	candidates := make([]spatial.QuestPointcrawlCandidate, 0, len(input))
	for _, link := range input {
		nodeID := strings.TrimSpace(link.HexId)
		if err := commandPublicID(&nodeID); err != nil {
			return nil, nil, err
		}
		role := strings.TrimSpace(link.Role)
		if role != "expected" && role != "visited" {
			return nil, nil, apierr.New(apierr.Invalid, "invalid pointcrawl link role")
		}
		hexes = append(hexes, QuestHexFields{HexId: nodeID, Role: role})
		candidates = append(candidates, spatial.QuestPointcrawlCandidate{ID: nodeID, Role: role})
	}
	return hexes, candidates, nil
}

func questHexRequest(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, spec SetQuestHexesSpec, questID string, preview *QuestView, candidates []spatial.QuestPointcrawlCandidate) (auth.Request, error) {
	if product.MissingDependency(repos.Places) {
		return auth.Request{}, apierr.New(apierr.Internal, "pointcrawl admission reader required")
	}
	if _, err := repos.Places.ResolveQuestPointcrawlNodes(ctx, fresh, candidates); err != nil {
		return auth.Request{}, err
	}
	locked, err := repos.Quest.LockSetQuestHexes(ctx, spec)
	if err != nil {
		return auth.Request{}, err
	}
	if !locked.Exists {
		return auth.Request{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if err := admitLockedQuest(ctx, repos, fresh, "Mutation.setQuestPointcrawlLinks", questID, preview.DmId, locked.OwnerID); err != nil {
		return auth.Request{}, err
	}
	admissions, err := repos.Places.ResolveQuestPointcrawlNodes(ctx, fresh, candidates)
	if err != nil {
		return auth.Request{}, err
	}
	facts := make([]auth.QuestHexFacts, 0, len(admissions))
	for _, node := range admissions {
		facts = append(facts, auth.QuestHexFacts{ID: node.ID, Role: node.Role, RegionID: node.RegionID, AdminOverride: node.AdminOverride})
	}
	return auth.ForQuest("Mutation.setQuestPointcrawlLinks", auth.QuestFacts{ID: questID, DMID: locked.OwnerID, Hexes: facts})
}

func storeQuestHexes(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, spec SetQuestHexesSpec, questID string, preview *QuestView, hexes []QuestHexFields) ([]QuestHexView, error) {
	locked, err := repos.Quest.LockSetQuestHexes(ctx, SetQuestHexesSpec{QuestId: questID, Hexes: hexes, AsOf: at})
	if err != nil {
		return nil, err
	}
	if !locked.Exists {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if err := admitLockedQuest(ctx, repos, fresh, "Mutation.setQuestPointcrawlLinks", questID, preview.DmId, locked.OwnerID); err != nil {
		return nil, err
	}
	return repos.Quest.StoreSetQuestHexes(ctx, SetQuestHexesWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: SetQuestHexesSpec{QuestId: questID, Hexes: hexes, AsOf: at}, Locked: locked})
}

func (s ProductCommands) SetQuestPointcrawlLinks(ctx context.Context, actor auth.Authority, spec SetQuestHexesSpec, meta product.CommandMeta) ([]QuestHexView, error) {
	return s.SetQuestHexes(ctx, actor, spec, meta)
}

func (s ProductCommands) SyncQuestDiscord(ctx context.Context, actor auth.Authority, spec SyncQuestDiscordSpec, meta product.CommandMeta) (DeliveryReceipt, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return DeliveryReceipt{}, err
	}
	spec.QuestId = questID
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.syncQuestDiscord", questID)
	if err != nil {
		return DeliveryReceipt{}, err
	}
	return runQuestCommand(ctx, s, actor, "syncQuestDiscord", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DeliveryReceipt, error) {
		locked, err := repos.Quest.LockSyncQuestDiscord(ctx, SyncQuestDiscordSpec{QuestId: questID, AsOf: at})
		if err != nil {
			return DeliveryReceipt{}, err
		}
		if !locked.Exists {
			return DeliveryReceipt{}, apierr.New(apierr.NotFound, "quest not found")
		}
		if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
			return DeliveryReceipt{}, err
		}
		return repos.Quest.StoreSyncQuestDiscord(ctx, SyncQuestDiscordWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: SyncQuestDiscordSpec{QuestId: questID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) PublishQuestPlayerList(ctx context.Context, actor auth.Authority, spec PublishQuestPlayerListSpec, meta product.CommandMeta) (DeliveryReceipt, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return DeliveryReceipt{}, err
	}
	spec.QuestId = questID
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.publishQuestPlayerList", questID)
	if err != nil {
		return DeliveryReceipt{}, err
	}
	return runQuestCommand(ctx, s, actor, "publishQuestPlayerList", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DeliveryReceipt, error) {
		locked, err := repos.Quest.LockPublishQuestPlayerList(ctx, PublishQuestPlayerListSpec{QuestId: questID, AsOf: at})
		if err != nil {
			return DeliveryReceipt{}, err
		}
		if !locked.Exists {
			return DeliveryReceipt{}, apierr.New(apierr.NotFound, "quest not found")
		}
		if err := admitLockedQuest(ctx, repos, fresh, request.Operation(), questID, preview.DmId, locked.OwnerID); err != nil {
			return DeliveryReceipt{}, err
		}
		return repos.Quest.StorePublishQuestPlayerList(ctx, PublishQuestPlayerListWrite{
			ActorID: fresh.Claims().MemberID, At: at,
			ValidatedInput: PublishQuestPlayerListSpec{QuestId: questID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) UpsertQuestSummary(ctx context.Context, actor auth.Authority, spec UpsertQuestSummarySpec, meta product.CommandMeta) (document.DocumentView, error) {
	spec, questIDs, facts, subject, err := prepareQuestSummary(spec)
	if err != nil {
		return document.DocumentView{}, err
	}
	requestFor := func(repos ProductCommandRepos, fresh auth.Authority) (auth.Request, error) {
		return questSummaryRequest(ctx, repos, fresh, spec, facts)
	}
	return runQuestCommandWithRequest(ctx, s, actor, "upsertQuestSummary", requestFor, spec, meta, subject, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (document.DocumentView, error) {
		return storeQuestSummary(ctx, repos, fresh, at, spec, questIDs)
	})
}

func prepareQuestSummary(spec UpsertQuestSummarySpec) (UpsertQuestSummarySpec, []string, auth.SummaryFacts, string, error) {
	if len(spec.Input.QuestIds) == 0 {
		return spec, nil, auth.SummaryFacts{}, "", apierr.New(apierr.Invalid, "quest ids required")
	}
	questIDs := make([]string, 0, len(spec.Input.QuestIds))
	for _, id := range spec.Input.QuestIds {
		trimmed := strings.TrimSpace(id)
		if err := commandPublicID(&trimmed); err != nil {
			return spec, nil, auth.SummaryFacts{}, "", err
		}
		questIDs = append(questIDs, trimmed)
	}
	spec.Input.QuestIds = questIDs
	if spec.Input.DocumentId != nil {
		docID := strings.TrimSpace(*spec.Input.DocumentId)
		if err := commandPublicID(&docID); err != nil {
			return spec, nil, auth.SummaryFacts{}, "", err
		}
		spec.Input.DocumentId = &docID
		if spec.Input.ExpectedRevision == nil || *spec.Input.ExpectedRevision <= 0 {
			return spec, nil, auth.SummaryFacts{}, "", apierr.New(apierr.Invalid, "expected revision required for summary update")
		}
	} else if spec.Input.ExpectedRevision != nil {
		return spec, nil, auth.SummaryFacts{}, "", apierr.New(apierr.Invalid, "new summary must omit expected revision")
	}
	facts := auth.SummaryFacts{QuestIDs: questIDs}
	if spec.Input.DocumentId != nil {
		facts.DocumentID = spec.Input.DocumentId
	}
	if spec.Input.CharacterId != nil {
		characterID := strings.TrimSpace(*spec.Input.CharacterId)
		if err := commandPublicID(&characterID); err != nil {
			return spec, nil, auth.SummaryFacts{}, "", err
		}
		spec.Input.CharacterId = &characterID
		facts.CharacterID = &characterID
	}
	subject := questIDs[0]
	return spec, questIDs, facts, subject, nil
}

func questSummaryRequest(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, spec UpsertQuestSummarySpec, facts auth.SummaryFacts) (auth.Request, error) {
	if spec.Input.DocumentId != nil {
		if product.MissingDependency(repos.SummaryDocuments) {
			return auth.Request{}, apierr.New(apierr.Internal, "summary document reader required")
		}
		existing, err := repos.SummaryDocuments.ReadDocumentById(ctx, fresh, document.DocumentByIdSpec{Id: *spec.Input.DocumentId})
		if err != nil {
			return auth.Request{}, err
		}
		if existing == nil {
			return auth.Request{}, apierr.New(apierr.NotFound, "summary document not found")
		}
		if existing.Kind != "summary" {
			return auth.Request{}, apierr.New(apierr.Invalid, "summary document required")
		}
		facts.AuthorID = &existing.AuthorId
	}
	return auth.ForSummary(facts)
}

func storeQuestSummary(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time, spec UpsertQuestSummarySpec, questIDs []string) (document.DocumentView, error) {
	if product.MissingDependency(repos.Summaries) {
		return document.DocumentView{}, apierr.New(apierr.Internal, "summary writer required")
	}
	locked, err := repos.Quest.LockUpsertQuestSummary(ctx, UpsertQuestSummarySpec{Input: spec.Input, AsOf: at})
	if err != nil {
		return document.DocumentView{}, err
	}
	result, err := repos.Summaries.WriteSummary(ctx, fresh, document.SummaryWrite{
		DocumentID: spec.Input.DocumentId, ExpectedRevision: spec.Input.ExpectedRevision,
		QuestIDs: questIDs, CharacterID: spec.Input.CharacterId, Title: spec.Input.Title,
		Body: spec.Input.Body, Visibility: spec.Input.Visibility, Frontmatter: spec.Input.Frontmatter, At: at,
	})
	if err != nil {
		return document.DocumentView{}, err
	}
	docID := result.Document.Id
	spec.Input.DocumentId = &docID
	if _, err := repos.Quest.StoreUpsertQuestSummary(ctx, UpsertQuestSummaryWrite{
		ActorID: fresh.Claims().MemberID, At: at, Input: spec,
		ValidatedInput: UpsertQuestSummarySpec{Input: spec.Input, AsOf: at}, Locked: locked,
	}); err != nil {
		return document.DocumentView{}, err
	}
	if err := recordQuestEvents(ctx, repos, result.Events); err != nil {
		return document.DocumentView{}, err
	}
	return result.Document, nil
}
