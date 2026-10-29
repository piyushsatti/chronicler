package character

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"reflect"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ProductCommands struct {
	Runner uow.Runner[ProductCommandRepos]
	Clock  product.Clock
	IDs    product.IDGenerator
}

func NewProductCommands(runner uow.Runner[ProductCommandRepos], clock product.Clock, ids product.IDGenerator) (*ProductCommands, error) {
	for _, dependency := range []any{runner, clock, ids} {
		if product.MissingDependency(dependency) {
			return nil, apierr.New(apierr.Internal, "character command dependencies required")
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

func commandRequiredID(value string) (string, error) {
	if err := commandPublicID(&value); err != nil {
		return "", err
	}
	return value, nil
}

func commandNote(note *string) error {
	if note == nil {
		return nil
	}
	return characterQueryText(*note, 2000)
}

func commandExpectedUpdatedAt(at time.Time) error {
	if at.IsZero() {
		return apierr.New(apierr.Invalid, "expected updated at required")
	}
	return nil
}

func runOperationCommand[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	operation auth.Operation,
	opName string,
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
		admission, err := admitCharacterOperation(ctx, repos, actor, operation, opName, meta, fingerprint)
		if err != nil {
			return err
		}
		if admission.claim.Replay {
			if err := restoreCharacterReplay(admission.claim, &result); err != nil {
				return err
			}
			return nil
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = mutate(repos, admission.fresh, at)
		if err != nil {
			return err
		}
		admission.fresh, err = recheckCharacterAuthority(ctx, repos, admission.fresh, admission.request, admission.decision)
		if err != nil {
			return err
		}
		return completeCharacterCommand(ctx, repos, admission, opName, subjectID, result, at)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

type characterCommandAdmission struct {
	fresh    auth.Authority
	request  auth.Request
	decision auth.Decision
	claim    idempotency.Claim
	ownerID  string
}

func admitCharacterOperation(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation, opName string, meta product.CommandMeta, fingerprint string) (characterCommandAdmission, error) {
	var admission characterCommandAdmission
	for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
		if product.MissingDependency(dependency) {
			return admission, apierr.New(apierr.Internal, "character transaction dependencies required")
		}
	}
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return admission, err
	}
	if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
		return admission, apierr.New(apierr.Forbidden, "member authority changed")
	}
	request, err := auth.ForOperation(operation)
	if err != nil {
		return admission, err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return admission, err
	}
	if !decision.Allowed {
		return admission, apierr.New(apierr.Forbidden, "character command forbidden")
	}
	claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, opName, meta.IdempotencyKey, fingerprint)
	if err != nil {
		return admission, err
	}
	fresh, err = recheckCharacterAuthority(ctx, repos, fresh, request, decision)
	if err != nil {
		return admission, err
	}
	return characterCommandAdmission{fresh: fresh, request: request, decision: decision, claim: claim}, nil
}

func recheckCharacterAuthority(ctx context.Context, repos ProductCommandRepos, prior auth.Authority, request auth.Request, original auth.Decision) (auth.Authority, error) {
	current, err := repos.Authority(ctx, prior.Claims().MemberID)
	if err != nil {
		return auth.Authority{}, err
	}
	decision, err := repos.Policy.Decide(ctx, current, request)
	if err != nil {
		return auth.Authority{}, err
	}
	if current.Claims().MemberID != prior.Claims().MemberID || !decision.Allowed || decision.UsedOverride && !original.UsedOverride {
		return auth.Authority{}, apierr.New(apierr.Forbidden, "character authority changed")
	}
	return current, nil
}

func restoreCharacterReplay[T any](claim idempotency.Claim, result *T) error {
	if err := json.Unmarshal(claim.Receipt, result); err != nil {
		return err
	}
	if receipt, ok := any(result).(*product.CommandReceipt); ok {
		receipt.Replayed = true
	}
	return nil
}

func completeCharacterCommand[T any](ctx context.Context, repos ProductCommandRepos, admission characterCommandAdmission, opName, subjectID string, result T, at time.Time) error {
	if admission.decision.UsedOverride {
		if product.MissingDependency(repos.Audit) {
			return apierr.New(apierr.Internal, "override recorder required")
		}
		var err error
		subjectID, err = characterOverrideSubject(opName, result, subjectID)
		if err != nil {
			return err
		}
		if err := repos.Audit.Record(ctx, admission.claim, auth.OverrideFact{
			ActorID: admission.fresh.Claims().MemberID, Operation: admission.request.Operation(), SubjectType: "character",
			SubjectID: subjectID, RuleCode: admission.decision.RuleCode, At: at,
		}); err != nil {
			return err
		}
	}
	receipt, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return repos.Replay.Complete(ctx, admission.claim, receipt)
}

func characterOverrideSubject[T any](opName string, result T, subjectID string) (string, error) {
	switch opName {
	case "upsertCreationCatalogEntry":
		view, ok := any(result).(CreationCatalogEntryView)
		if !ok {
			return "", apierr.New(apierr.Internal, "catalog audit subject required")
		}
		return view.Id, nil
	case "createBackstory", "updateBackstory":
		view, ok := any(result).(BackstoryView)
		if !ok {
			return "", apierr.New(apierr.Internal, "backstory audit subject required")
		}
		return view.Id, nil
	default:
		return subjectID, nil
	}
}

func runOwnedCharacterCommand[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	opName string,
	characterID string,
	spec any,
	meta product.CommandMeta,
	mutate func(ProductCommandRepos, auth.Authority, time.Time) (T, error),
) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		admission, err := admitOwnedCharacterCommand(ctx, repos, actor, opName, characterID, meta, fingerprint)
		if err != nil {
			return err
		}
		if admission.claim.Replay {
			if err := restoreCharacterReplay(admission.claim, &result); err != nil {
				return err
			}
			return nil
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = mutate(repos, admission.fresh, at)
		if err != nil {
			return err
		}
		if err := admitCharacterWrite(ctx, repos, admission.fresh, admission.request.Operation(), characterID, admission.ownerID); err != nil {
			return err
		}
		return completeCharacterCommand(ctx, repos, admission, opName, characterID, result, at)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func admitOwnedCharacterCommand(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, opName, characterID string, meta product.CommandMeta, fingerprint string) (characterCommandAdmission, error) {
	var admission characterCommandAdmission
	for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay, repos.Admissions} {
		if product.MissingDependency(dependency) {
			return admission, apierr.New(apierr.Internal, "character transaction dependencies required")
		}
	}
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return admission, err
	}
	if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
		return admission, apierr.New(apierr.Forbidden, "member authority changed")
	}
	ownerID, err := repos.Admissions.ReadImmutableOwner(ctx, characterID)
	if err != nil {
		return admission, err
	}
	if ownerID != fresh.Claims().MemberID {
		return admission, apierr.New(apierr.Forbidden, "character owner required")
	}
	request, err := auth.ForCharacter(auth.Operation("Mutation."+opName), auth.CharacterFacts{ID: characterID, OwnerID: ownerID})
	if err != nil {
		return admission, err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return admission, err
	}
	if !decision.Allowed {
		return admission, apierr.New(apierr.Forbidden, "character command forbidden")
	}
	claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, opName, meta.IdempotencyKey, fingerprint)
	if err != nil {
		return admission, err
	}
	fresh, err = recheckCharacterAuthority(ctx, repos, fresh, request, decision)
	if err != nil {
		return admission, err
	}
	return characterCommandAdmission{fresh: fresh, request: request, decision: decision, claim: claim, ownerID: ownerID}, nil
}

func admitCharacterWrite(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation, characterID, ownerID string) error {
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return err
	}
	if fresh.Claims().MemberID != actor.Claims().MemberID || fresh.Claims().MemberID != ownerID {
		return apierr.New(apierr.Forbidden, "character owner required")
	}
	request, err := auth.ForCharacter(operation, auth.CharacterFacts{ID: characterID, OwnerID: ownerID})
	if err != nil {
		return err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "character command forbidden")
	}
	return nil
}

func validateCharacterGuild(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, guildID *string) error {
	if guildID == nil {
		return nil
	}
	if product.MissingDependency(repos.Guilds) {
		return apierr.New(apierr.Internal, "guild reader required")
	}
	_, err := repos.Guilds.ValidateGuild(ctx, actor, *guildID)
	return err
}

func validateCreateCharacterInput(spec *CreateCharacterSpec) error {
	if err := characterQueryText(spec.Input.Name, 200); err != nil {
		return err
	}
	if spec.Input.ShortCode != nil {
		if err := characterQueryText(*spec.Input.ShortCode, 64); err != nil {
			return err
		}
	}
	if err := validateCreateCharacterIDs(&spec.Input); err != nil {
		return err
	}
	return validateCreateCharacterDetails(&spec.Input)
}

func validateCreateCharacterIDs(input *CreateCharacterFields) error {
	for _, field := range []*string{input.BackstoryId, input.GuildId, input.RegionId} {
		if err := commandPublicID(field); err != nil {
			return err
		}
	}
	// New characters need a region and a backstory, as both were required
	// selects in the original create form. Legacy rows without them are untouched
	// because only the create path checks this.
	if input.RegionId == nil {
		return apierr.New(apierr.Invalid, "region required")
	}
	if input.BackstoryId == nil {
		return apierr.New(apierr.Invalid, "backstory required")
	}
	for i := range input.CatalogPickIds {
		if err := commandPublicID(&input.CatalogPickIds[i]); err != nil {
			return err
		}
	}
	seen := make(map[string]bool, len(input.CatalogPickIds))
	for _, id := range input.CatalogPickIds {
		if seen[id] {
			return apierr.New(apierr.Invalid, "duplicate creation catalog pick")
		}
		seen[id] = true
	}
	return nil
}

func validateCreateCharacterDetails(input *CreateCharacterFields) error {
	for _, value := range []struct {
		text  *string
		limit int
	}{{input.Description, 4000}, {input.BackgroundText, 8000}} {
		if value.text != nil {
			if err := characterQueryText(*value.text, value.limit); err != nil {
				return err
			}
		}
	}
	// D4: new characters need a D&D Beyond sheet; legacy rows without one are
	// untouched because only the create path checks this.
	if input.DdbUrl == nil || strings.TrimSpace(*input.DdbUrl) == "" {
		return apierr.New(apierr.Invalid, "D&D Beyond character URL required")
	}
	if _, err := canonicalDdbCharacterID(*input.DdbUrl); err != nil {
		return apierr.New(apierr.Invalid, "invalid DDB character URL")
	}
	if input.ImageUrl != nil {
		if err := validateCharacterImageURL(*input.ImageUrl); err != nil {
			return err
		}
	}
	return nil
}

// validateCharacterImageURL mirrors characters_image_url_check (D5): an absolute
// https URL of at most 2048 characters, with a host and no credentials.
func validateCharacterImageURL(raw string) error {
	invalid := apierr.New(apierr.Invalid, "invalid character image URL")
	if !utf8.ValidString(raw) || !strings.HasPrefix(raw, "https://") || utf8.RuneCountInString(raw) > 2048 {
		return invalid
	}
	for _, r := range raw {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return invalid
		}
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Opaque != "" {
		return invalid
	}
	return nil
}

func validateBackstoryInput(input *BackstoryFields) error {
	if err := characterQueryText(input.Name, 200); err != nil {
		return err
	}
	if err := characterQueryText(input.Lore, 8000); err != nil {
		return err
	}
	if err := characterQueryText(input.Cohort, 200); err != nil {
		return err
	}
	return commandPublicID(input.SourceRegionId)
}

func validateDowntimeInput(input *DowntimeFields) error {
	if err := characterQueryText(input.Name, 200); err != nil {
		return err
	}
	if err := characterQueryText(input.Status, 64); err != nil {
		return err
	}
	if input.Status != "active" && input.Status != "completed" && input.Status != "abandoned" || input.Progress < 0 || input.Target != nil && *input.Target <= 0 {
		return apierr.New(apierr.Invalid, "invalid downtime project")
	}
	if input.Goal != nil {
		if err := characterQueryText(*input.Goal, 2000); err != nil {
			return err
		}
	}
	if input.Notes != nil {
		if err := characterQueryText(*input.Notes, 2000); err != nil {
			return err
		}
	}
	return commandPublicID(input.Id)
}

func (s ProductCommands) CreateCharacter(ctx context.Context, actor auth.Authority, spec CreateCharacterSpec, meta product.CommandMeta) (CharacterView, error) {
	if err := validateCreateCharacterInput(&spec); err != nil {
		return CharacterView{}, err
	}
	return runOperationCommand(ctx, s, actor, "Mutation.createCharacter", "createCharacter", spec, meta, actor.Claims().MemberID,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
			if err := validateCharacterGuild(ctx, repos, fresh, spec.Input.GuildId); err != nil {
				return CharacterView{}, err
			}
			locked, err := repos.Character.LockCreateCharacter(ctx, spec)
			if err != nil {
				return CharacterView{}, err
			}
			id := s.IDs()
			if err := commandPublicID(&id); err != nil {
				return CharacterView{}, err
			}
			return repos.Character.StoreCreateCharacter(ctx, CreateCharacterWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, HistoryID: &id,
			})
		})
}

func (s ProductCommands) AdjustPcxp(ctx context.Context, actor auth.Authority, spec AdjustPcxpSpec, meta product.CommandMeta) (ProgressionEntryView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return ProgressionEntryView{}, err
	}
	if err := characterQueryText(spec.Note, 2000); err != nil {
		return ProgressionEntryView{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "adjustPcxp", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (ProgressionEntryView, error) {
			locked, err := repos.Character.LockAdjustPcxp(ctx, spec)
			if err != nil {
				return ProgressionEntryView{}, err
			}
			if !locked.Exists {
				return ProgressionEntryView{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.adjustPcxp", spec.CharacterId, locked.OwnerID); err != nil {
				return ProgressionEntryView{}, err
			}
			return repos.Character.StoreAdjustPcxp(ctx, AdjustPcxpWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) SubmitForVerification(ctx context.Context, actor auth.Authority, spec SubmitForVerificationSpec, meta product.CommandMeta) (CharacterView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return CharacterView{}, err
	}
	if err := commandExpectedUpdatedAt(spec.ExpectedUpdatedAt); err != nil {
		return CharacterView{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "submitForVerification", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
			locked, err := repos.Character.LockSubmitForVerification(ctx, spec)
			if err != nil {
				return CharacterView{}, err
			}
			if !locked.Exists {
				return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.submitForVerification", spec.CharacterId, locked.OwnerID); err != nil {
				return CharacterView{}, err
			}
			return repos.Character.StoreSubmitForVerification(ctx, SubmitForVerificationWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) RetireCharacter(ctx context.Context, actor auth.Authority, spec RetireCharacterSpec, meta product.CommandMeta) (CharacterView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return CharacterView{}, err
	}
	if err := commandExpectedUpdatedAt(spec.ExpectedUpdatedAt); err != nil {
		return CharacterView{}, err
	}
	for range 3 {
		result, err := runOwnedCharacterCommand(ctx, s, actor, "retireCharacter", spec.CharacterId, spec, meta,
			func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
				return retireCharacterInTransaction(ctx, repos, fresh, spec, at)
			})
		if !errors.Is(err, ErrWithdrawalPlanChanged) {
			return result, err
		}
	}
	return CharacterView{}, apierr.New(apierr.Conflict, "quest roster kept changing during retirement")
}

func retireCharacterInTransaction(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, spec RetireCharacterSpec, at time.Time) (CharacterView, error) {
	if product.MissingDependency(repos.Withdrawals) || product.MissingDependency(repos.Producer) {
		return CharacterView{}, apierr.New(apierr.Internal, "character withdrawal dependencies required")
	}
	plan, err := lockCharacterRetirementPlan(ctx, repos, spec.CharacterId)
	if err != nil {
		return CharacterView{}, err
	}
	locked, err := repos.Character.LockRetireCharacter(ctx, spec)
	if err != nil {
		return CharacterView{}, err
	}
	if !locked.Exists {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
	}
	if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.retireCharacter", spec.CharacterId, locked.OwnerID); err != nil {
		return CharacterView{}, err
	}
	if locked.UpdatedAt == nil || !locked.UpdatedAt.Equal(spec.ExpectedUpdatedAt) || locked.Before.Status == "dead" || locked.Before.Status == "retired" {
		return CharacterView{}, apierr.New(apierr.Conflict, "character retire rejected")
	}
	effects, err := repos.Withdrawals.WithdrawOwnedCharacter(ctx, fresh.Claims().MemberID, plan, "retired", at)
	if err != nil {
		return CharacterView{}, err
	}
	if err := recordRetirementEvents(ctx, repos, effects.Events); err != nil {
		return CharacterView{}, err
	}
	return repos.Character.StoreRetireCharacter(ctx, RetireCharacterWrite{
		ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
	})
}

func lockCharacterRetirementPlan(ctx context.Context, repos ProductCommandRepos, characterID string) (WithdrawalPlan, error) {
	plan, err := repos.Withdrawals.PlanOwnedCharacterWithdrawal(ctx, characterID, nil)
	if err != nil {
		return WithdrawalPlan{}, err
	}
	admissions, err := repos.Admissions.LockAdmissions(ctx, plan.CharacterIDs)
	if err != nil {
		return WithdrawalPlan{}, err
	}
	if len(admissions) != len(plan.CharacterIDs) {
		return WithdrawalPlan{}, ErrWithdrawalPlanChanged
	}
	currentPlan, err := repos.Withdrawals.PlanOwnedCharacterWithdrawal(ctx, characterID, nil)
	if err != nil {
		return WithdrawalPlan{}, err
	}
	if !reflect.DeepEqual(plan, currentPlan) {
		return WithdrawalPlan{}, ErrWithdrawalPlanChanged
	}
	return plan, nil
}

func recordRetirementEvents(ctx context.Context, repos ProductCommandRepos, events []notification.Event) error {
	for _, event := range events {
		if err := repos.Producer.Record(ctx, repos.Notice, event); err != nil {
			return err
		}
	}
	return nil
}

func (s ProductCommands) DecideVerification(ctx context.Context, actor auth.Authority, spec DecideVerificationSpec, meta product.CommandMeta) (member.VerificationView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return member.VerificationView{}, err
	}
	if err := commandExpectedUpdatedAt(spec.ExpectedSubmittedAt); err != nil {
		return member.VerificationView{}, err
	}
	if spec.Verdict != member.VerificationVerdictApproved && spec.Verdict != member.VerificationVerdictRejected {
		return member.VerificationView{}, apierr.New(apierr.Invalid, "invalid verification verdict")
	}
	if err := commandNote(spec.Note); err != nil {
		return member.VerificationView{}, err
	}
	return runOperationCommand(ctx, s, actor, "Mutation.decideVerification", "decideVerification", spec, meta, spec.CharacterId,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (member.VerificationView, error) {
			return decideCharacterVerification(ctx, repos, fresh, spec, at, s.IDs)
		})
}

func decideCharacterVerification(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, spec DecideVerificationSpec, at time.Time, ids product.IDGenerator) (member.VerificationView, error) {
	if product.MissingDependency(repos.Assessments) {
		return member.VerificationView{}, apierr.New(apierr.Internal, "assessment writer required")
	}
	locked, err := repos.Character.LockDecideVerification(ctx, spec)
	if err != nil {
		return member.VerificationView{}, err
	}
	if !locked.Exists {
		return member.VerificationView{}, apierr.New(apierr.NotFound, "character not found")
	}
	current, err := repos.Authority(ctx, fresh.Claims().MemberID)
	if err != nil {
		return member.VerificationView{}, err
	}
	request, err := auth.ForOperation("Mutation.decideVerification")
	if err != nil {
		return member.VerificationView{}, err
	}
	decision, err := repos.Policy.Decide(ctx, current, request)
	if err != nil {
		return member.VerificationView{}, err
	}
	if current.Claims().MemberID != fresh.Claims().MemberID || !decision.Allowed {
		return member.VerificationView{}, apierr.New(apierr.Forbidden, "character verification forbidden")
	}
	id := ids()
	if err := commandPublicID(&id); err != nil {
		return member.VerificationView{}, err
	}
	var historyID *string
	if spec.Verdict == member.VerificationVerdictApproved {
		value := ids()
		if err := commandPublicID(&value); err != nil {
			return member.VerificationView{}, err
		}
		historyID = &value
	}
	assessment, err := repos.Assessments.AppendAssessment(ctx, member.AssessmentSpec{
		SubjectType: "character", SubjectID: spec.CharacterId, Verdict: spec.Verdict, ID: id,
		SubmissionToken: spec.ExpectedSubmittedAt.UTC().Format(time.RFC3339Nano), ActorID: fresh.Claims().MemberID,
		At: at, Note: spec.Note,
	})
	if err != nil {
		return member.VerificationView{}, err
	}
	result, err := repos.Character.StoreDecideVerification(ctx, DecideVerificationWrite{
		ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
		DecisionID: &id, HistoryID: historyID, Assessment: assessment,
	})
	if err != nil {
		return member.VerificationView{}, err
	}
	if product.MissingDependency(repos.Producer) {
		return member.VerificationView{}, apierr.New(apierr.Internal, "character notification producer required")
	}
	if err := repos.Producer.Record(ctx, repos.Notice, notification.Event{
		Key: "character-verification:" + assessment.Id, Kind: notification.CharacterVerificationDecided,
		SubjectType: "character", SubjectID: spec.CharacterId, ActorID: fresh.Claims().MemberID, OccurredAt: at,
		Facts: notification.Facts{Version: 1, EventKind: notification.CharacterVerificationDecided, CharacterID: &spec.CharacterId, VerificationID: &assessment.Id, Verdict: &assessment.Verdict},
	}); err != nil {
		return member.VerificationView{}, err
	}
	return result, nil
}

func (s ProductCommands) SetCharacterGuild(ctx context.Context, actor auth.Authority, spec SetCharacterGuildSpec, meta product.CommandMeta) (CharacterView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return CharacterView{}, err
	}
	if err := commandPublicID(spec.GuildId); err != nil {
		return CharacterView{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "setCharacterGuild", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
			locked, err := repos.Character.LockSetCharacterGuild(ctx, spec)
			if err != nil {
				return CharacterView{}, err
			}
			if !locked.Exists {
				return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.setCharacterGuild", spec.CharacterId, locked.OwnerID); err != nil {
				return CharacterView{}, err
			}
			if err := validateCharacterGuild(ctx, repos, fresh, spec.GuildId); err != nil {
				return CharacterView{}, err
			}
			return repos.Character.StoreSetCharacterGuild(ctx, SetCharacterGuildWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) UpdateCharacterProfile(ctx context.Context, actor auth.Authority, spec UpdateCharacterProfileSpec, meta product.CommandMeta) (CharacterView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return CharacterView{}, err
	}
	if spec.Input.Description.Set && spec.Input.Description.Value != nil {
		if err := characterQueryText(*spec.Input.Description.Value, 4000); err != nil {
			return CharacterView{}, err
		}
	}
	if spec.Input.BackgroundText.Set && spec.Input.BackgroundText.Value != nil {
		if err := characterQueryText(*spec.Input.BackgroundText.Value, 8000); err != nil {
			return CharacterView{}, err
		}
	}
	if spec.Input.ImageUrl.Set && spec.Input.ImageUrl.Value != nil {
		if err := validateCharacterImageURL(*spec.Input.ImageUrl.Value); err != nil {
			return CharacterView{}, err
		}
	}
	return runOwnedCharacterCommand(ctx, s, actor, "updateCharacterProfile", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
			locked, err := repos.Character.LockUpdateCharacterProfile(ctx, spec)
			if err != nil {
				return CharacterView{}, err
			}
			if !locked.Exists {
				return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.updateCharacterProfile", spec.CharacterId, locked.OwnerID); err != nil {
				return CharacterView{}, err
			}
			return repos.Character.StoreUpdateCharacterProfile(ctx, UpdateCharacterProfileWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) SyncCharacterDdb(ctx context.Context, actor auth.Authority, spec SyncCharacterDdbSpec, meta product.CommandMeta) (DdbSyncReceipt, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return DdbSyncReceipt{}, err
	}
	canonical, err := canonicalDdbCharacterID(spec.DdbUrl)
	if err != nil {
		return DdbSyncReceipt{}, apierr.New(apierr.Invalid, "invalid DDB character URL")
	}
	spec.DdbUrl = "https://www.dndbeyond.com/characters/" + canonical
	return runOwnedCharacterCommand(ctx, s, actor, "syncCharacterDdb", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DdbSyncReceipt, error) {
			locked, err := repos.Character.LockSyncCharacterDdb(ctx, spec)
			if err != nil {
				return DdbSyncReceipt{}, err
			}
			if !locked.Exists {
				return DdbSyncReceipt{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.syncCharacterDdb", spec.CharacterId, locked.OwnerID); err != nil {
				return DdbSyncReceipt{}, err
			}
			return repos.Character.StoreSyncCharacterDdb(ctx, SyncCharacterDdbWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) LogCharacterEvent(ctx context.Context, actor auth.Authority, spec LogCharacterEventSpec, meta product.CommandMeta) (CharacterLogView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return CharacterLogView{}, err
	}
	if err := characterQueryText(spec.Body, 8000); err != nil {
		return CharacterLogView{}, err
	}
	if err := commandPublicID(spec.QuestId); err != nil {
		return CharacterLogView{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "logCharacterEvent", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterLogView, error) {
			locked, err := repos.Character.LockLogCharacterEvent(ctx, spec)
			if err != nil {
				return CharacterLogView{}, err
			}
			if !locked.Exists {
				return CharacterLogView{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.logCharacterEvent", spec.CharacterId, locked.OwnerID); err != nil {
				return CharacterLogView{}, err
			}
			id := s.IDs()
			if err := commandPublicID(&id); err != nil {
				return CharacterLogView{}, err
			}
			return repos.Character.StoreLogCharacterEvent(ctx, LogCharacterEventWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, HistoryID: &id,
			})
		})
}

func (s ProductCommands) UpsertDowntimeProject(ctx context.Context, actor auth.Authority, spec UpsertDowntimeProjectSpec, meta product.CommandMeta) (DowntimeProjectView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return DowntimeProjectView{}, err
	}
	if err := validateDowntimeInput(&spec.Input); err != nil {
		return DowntimeProjectView{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "upsertDowntimeProject", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DowntimeProjectView, error) {
			locked, err := repos.Character.LockUpsertDowntimeProject(ctx, spec)
			if err != nil {
				return DowntimeProjectView{}, err
			}
			if !locked.Exists {
				return DowntimeProjectView{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.upsertDowntimeProject", spec.CharacterId, locked.OwnerID); err != nil {
				return DowntimeProjectView{}, err
			}
			return repos.Character.StoreUpsertDowntimeProject(ctx, UpsertDowntimeProjectWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) UpsertCreationCatalogEntry(ctx context.Context, actor auth.Authority, spec UpsertCreationCatalogEntrySpec, meta product.CommandMeta) (CreationCatalogEntryView, error) {
	in := spec.Input
	if err := characterQueryText(in.Name, 200); err != nil {
		return CreationCatalogEntryView{}, err
	}
	if err := characterQueryText(in.Kind, 64); err != nil {
		return CreationCatalogEntryView{}, err
	}
	if err := commandPublicID(in.OptionId); err != nil {
		return CreationCatalogEntryView{}, err
	}
	if err := commandPublicID(in.IntroducedByRegionId); err != nil {
		return CreationCatalogEntryView{}, err
	}
	if in.Description != nil {
		if err := characterQueryText(*in.Description, 2000); err != nil {
			return CreationCatalogEntryView{}, err
		}
	}
	subjectID := actor.Claims().MemberID
	if in.OptionId != nil {
		subjectID = *in.OptionId
	}
	return runOperationCommand(ctx, s, actor, "Mutation.upsertCreationCatalogEntry", "upsertCreationCatalogEntry", spec, meta, subjectID,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CreationCatalogEntryView, error) {
			locked, err := repos.Reference.LockUpsertCreationCatalogEntry(ctx, spec)
			if err != nil {
				return CreationCatalogEntryView{}, err
			}
			return repos.Reference.StoreUpsertCreationCatalogEntry(ctx, UpsertCreationCatalogEntryWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) CreateBackstory(ctx context.Context, actor auth.Authority, spec CreateBackstorySpec, meta product.CommandMeta) (BackstoryView, error) {
	if err := validateBackstoryInput(&spec.Input); err != nil {
		return BackstoryView{}, err
	}
	return runOperationCommand(ctx, s, actor, "Mutation.createBackstory", "createBackstory", spec, meta, actor.Claims().MemberID,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (BackstoryView, error) {
			locked, err := repos.Reference.LockCreateBackstory(ctx, spec)
			if err != nil {
				return BackstoryView{}, err
			}
			id := s.IDs()
			if err := commandPublicID(&id); err != nil {
				return BackstoryView{}, err
			}
			return repos.Reference.StoreCreateBackstory(ctx, CreateBackstoryWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, HistoryID: &id,
			})
		})
}

func (s ProductCommands) UpdateBackstory(ctx context.Context, actor auth.Authority, spec UpdateBackstorySpec, meta product.CommandMeta) (BackstoryView, error) {
	if _, err := commandRequiredID(spec.Id); err != nil {
		return BackstoryView{}, err
	}
	if err := validateBackstoryInput(&spec.Input); err != nil {
		return BackstoryView{}, err
	}
	return runOperationCommand(ctx, s, actor, "Mutation.updateBackstory", "updateBackstory", spec, meta, spec.Id,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (BackstoryView, error) {
			locked, err := repos.Reference.LockUpdateBackstory(ctx, spec)
			if err != nil {
				return BackstoryView{}, err
			}
			if !locked.Exists {
				return BackstoryView{}, apierr.New(apierr.NotFound, "backstory not found")
			}
			return repos.Reference.StoreUpdateBackstory(ctx, UpdateBackstoryWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) DeleteCharacterLog(ctx context.Context, actor auth.Authority, spec DeleteCharacterLogSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return product.CommandReceipt{}, err
	}
	if _, err := commandRequiredID(spec.LogId); err != nil {
		return product.CommandReceipt{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "deleteCharacterLog", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
			locked, err := repos.Character.LockDeleteCharacterLog(ctx, spec)
			if err != nil {
				return product.CommandReceipt{}, err
			}
			if !locked.Exists {
				return product.CommandReceipt{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.deleteCharacterLog", spec.CharacterId, locked.OwnerID); err != nil {
				return product.CommandReceipt{}, err
			}
			return repos.Character.StoreDeleteCharacterLog(ctx, DeleteCharacterLogWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) DeleteCharacter(ctx context.Context, actor auth.Authority, spec DeleteCharacterSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return product.CommandReceipt{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "deleteCharacter", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
			locked, err := repos.Character.LockDeleteCharacter(ctx, spec)
			if err != nil {
				return product.CommandReceipt{}, err
			}
			if !locked.Exists {
				return product.CommandReceipt{}, apierr.New(apierr.NotFound, "character not found")
			}
			if err := admitCharacterWrite(ctx, repos, fresh, "Mutation.deleteCharacter", spec.CharacterId, locked.OwnerID); err != nil {
				return product.CommandReceipt{}, err
			}
			return repos.Character.StoreDeleteCharacter(ctx, DeleteCharacterWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}

func (s ProductCommands) RestoreCharacter(ctx context.Context, actor auth.Authority, spec RestoreCharacterSpec, meta product.CommandMeta) (CharacterView, error) {
	if _, err := commandRequiredID(spec.CharacterId); err != nil {
		return CharacterView{}, err
	}
	return runOwnedCharacterCommand(ctx, s, actor, "restoreCharacter", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
			locked, err := repos.Character.LockRestoreCharacter(ctx, spec)
			if err != nil {
				return CharacterView{}, err
			}
			if !locked.Exists {
				return CharacterView{}, apierr.New(apierr.NotFound, "character not deleted")
			}
			return repos.Character.StoreRestoreCharacter(ctx, RestoreCharacterWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
}
