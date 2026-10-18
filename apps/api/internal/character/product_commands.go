package character

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ProductCommands struct {
	Runner uow.Runner[ProductCommandRepos]
	Clock  product.Clock
	IDs    product.IDGenerator
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
			return nil, apierr.New(apierr.Internal, "character command dependencies required")
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
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "character transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		request, err := auth.ForOperation(operation)
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
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, opName, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			if err := json.Unmarshal(claim.Receipt, &result); err != nil {
				return err
			}
			if receipt, ok := any(&result).(*product.CommandReceipt); ok {
				receipt.Replayed = true
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
				ActorID: fresh.Claims().MemberID, Operation: request.Operation(), SubjectType: "character",
				SubjectID: subjectID, RuleCode: decision.RuleCode, At: at,
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
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay, repos.Admissions} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "character transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		ownerID, err := repos.Admissions.ReadImmutableOwner(ctx, characterID)
		if err != nil {
			return err
		}
		request, err := auth.ForCharacter(auth.Operation("Mutation."+opName), auth.CharacterFacts{ID: characterID, OwnerID: ownerID})
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
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, opName, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			if err := json.Unmarshal(claim.Receipt, &result); err != nil {
				return err
			}
			if receipt, ok := any(&result).(*product.CommandReceipt); ok {
				receipt.Replayed = true
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
				ActorID: fresh.Claims().MemberID, Operation: request.Operation(), SubjectType: "character",
				SubjectID: characterID, RuleCode: decision.RuleCode, At: at,
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

func validateCreateCharacterInput(spec *CreateCharacterSpec) error {
	if err := characterQueryText(spec.Input.Name, 200); err != nil {
		return err
	}
	if spec.Input.ShortCode != nil {
		if err := characterQueryText(*spec.Input.ShortCode, 64); err != nil {
			return err
		}
	}
	for _, field := range []*string{spec.Input.BackstoryId, spec.Input.GuildId, spec.Input.RegionId} {
		if err := commandPublicID(field); err != nil {
			return err
		}
	}
	for i := range spec.Input.CatalogPickIds {
		if err := commandPublicID(&spec.Input.CatalogPickIds[i]); err != nil {
			return err
		}
	}
	if spec.Input.DdbUrl != nil {
		if _, err := canonicalDdbCharacterID(*spec.Input.DdbUrl); err != nil {
			return apierr.New(apierr.Invalid, "invalid DDB character URL")
		}
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
	return runOwnedCharacterCommand(ctx, s, actor, "retireCharacter", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
			locked, err := repos.Character.LockRetireCharacter(ctx, spec)
			if err != nil {
				return CharacterView{}, err
			}
			if !locked.Exists {
				return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
			}
			return repos.Character.StoreRetireCharacter(ctx, RetireCharacterWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
			})
		})
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
			if commandDependencyMissing(repos.Assessments) {
				return member.VerificationView{}, apierr.New(apierr.Internal, "assessment writer required")
			}
			locked, err := repos.Character.LockDecideVerification(ctx, spec)
			if err != nil {
				return member.VerificationView{}, err
			}
			if !locked.Exists {
				return member.VerificationView{}, apierr.New(apierr.NotFound, "character not found")
			}
			id := s.IDs()
			if err := commandPublicID(&id); err != nil {
				return member.VerificationView{}, err
			}
			assessment, err := repos.Assessments.AppendAssessment(ctx, member.AssessmentSpec{
				SubjectType:     "character",
				SubjectID:       spec.CharacterId,
				Verdict:         spec.Verdict,
				ID:              id,
				SubmissionToken: spec.ExpectedSubmittedAt.UTC().Format(time.RFC3339Nano),
				ActorID:         fresh.Claims().MemberID,
				At:              at,
				Note:            spec.Note,
			})
			if err != nil {
				return member.VerificationView{}, err
			}
			return repos.Character.StoreDecideVerification(ctx, DecideVerificationWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked,
				DecisionID: &id, Assessment: assessment,
			})
		})
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
	return runOwnedCharacterCommand(ctx, s, actor, "updateCharacterProfile", spec.CharacterId, spec, meta,
		func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (CharacterView, error) {
			locked, err := repos.Character.LockUpdateCharacterProfile(ctx, spec)
			if err != nil {
				return CharacterView{}, err
			}
			if !locked.Exists {
				return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
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
