package member

import (
	"context"
	"encoding/json"
	"net/url"
	"reflect"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

// ProductCommands follows CQRS. The runner owns the only transaction.
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
			return nil, apierr.New(apierr.Internal, "member command dependencies required")
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock, IDs: ids}, nil
}

func commandID(value *string) error {
	parsed, err := uuid.Parse(*value)
	if err != nil || parsed == uuid.Nil || !strings.EqualFold(parsed.String(), *value) {
		return apierr.New(apierr.Invalid, "invalid public id")
	}
	*value = parsed.String()
	return nil
}

func commandRoles(roles []string) ([]string, error) {
	out := slices.Clone(roles)
	for _, role := range out {
		if err := queryRole(&role); err != nil {
			return nil, err
		}
	}
	slices.Sort(out)
	return slices.Compact(out), nil
}

func commandNote(note *string) error {
	if note == nil {
		return nil
	}
	return queryText(*note, 2000)
}

// Fresh authority precedes policy and receipt admission, including replay.
func runMemberCommand[T any](ctx context.Context, s ProductCommands, actor auth.Authority, operation string, spec any, meta product.CommandMeta, subjectID string, mutate func(ProductCommandRepos, auth.Authority, time.Time) (T, error)) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "member transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		request, err := auth.ForOperation(auth.Operation("Mutation." + operation))
		if err != nil {
			return err
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "member command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, operation, meta.IdempotencyKey, fingerprint)
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
			if err := repos.Audit.Record(ctx, auth.OverrideFact{ActorID: fresh.Claims().MemberID, Operation: request.Operation(), SubjectType: "member", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at}); err != nil {
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

func (s ProductCommands) SetMemberRoles(ctx context.Context, actor auth.Authority, spec SetMemberRolesSpec, meta product.CommandMeta) (MemberView, error) {
	if err := commandID(&spec.MemberId); err != nil {
		return MemberView{}, err
	}
	roles, err := commandRoles(spec.Roles)
	if err != nil {
		return MemberView{}, err
	}
	spec.Roles = roles
	if err := commandNote(spec.Note); err != nil {
		return MemberView{}, err
	}
	return runMemberCommand(ctx, s, actor, "setMemberRoles", spec, meta, spec.MemberId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (MemberView, error) {
		locked, err := repos.Member.LockSetMemberRoles(ctx, spec)
		if err != nil {
			return MemberView{}, err
		}
		if !locked.Exists || locked.Before == nil {
			return MemberView{}, apierr.New(apierr.NotFound, "member not found")
		}
		id := s.IDs()
		if err := commandID(&id); err != nil {
			return MemberView{}, err
		}
		return repos.Member.StoreSetMemberRoles(ctx, SetMemberRolesWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, HistoryID: &id})
	})
}

func (s ProductCommands) SetMemberRolesBatch(ctx context.Context, actor auth.Authority, spec SetMemberRolesBatchSpec, meta product.CommandMeta) ([]MemberRoleBatchResultView, error) {
	spec.Changes = slices.Clone(spec.Changes)
	if len(spec.Changes) == 0 || len(spec.Changes) > 100 {
		return nil, apierr.New(apierr.Invalid, "role batch size must be 1 through 100")
	}
	seen := map[string]bool{}
	for i := range spec.Changes {
		change := &spec.Changes[i]
		if err := commandID(&change.MemberId); err != nil {
			return nil, err
		}
		if seen[change.MemberId] {
			return nil, apierr.New(apierr.Invalid, "duplicate role target")
		}
		seen[change.MemberId] = true
		roles, err := commandRoles(change.Roles)
		if err != nil {
			return nil, err
		}
		change.Roles = roles
		if err := commandNote(change.Note); err != nil {
			return nil, err
		}
	}
	return runMemberCommand(ctx, s, actor, "setMemberRolesBatch", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]MemberRoleBatchResultView, error) {
		locked, err := repos.Member.LockSetMemberRolesBatch(ctx, spec)
		if err != nil {
			return nil, err
		}
		if len(locked.Members) != len(spec.Changes) {
			return nil, apierr.New(apierr.NotFound, "member batch target not found")
		}
		history := make(map[string]string, len(spec.Changes))
		for _, change := range spec.Changes {
			id := s.IDs()
			if err := commandID(&id); err != nil {
				return nil, err
			}
			history[change.MemberId] = id
		}
		return repos.Member.StoreSetMemberRolesBatch(ctx, SetMemberRolesBatchWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, HistoryIDs: history})
	})
}

func (s ProductCommands) UpdateMyProfile(ctx context.Context, actor auth.Authority, spec UpdateMyProfileSpec, meta product.CommandMeta) (MemberView, error) {
	if err := queryText(spec.Input.DisplayName, 200); err != nil {
		return MemberView{}, err
	}
	if spec.Input.AvatarUrl.Set && spec.Input.AvatarUrl.Value != nil {
		parsed, err := url.Parse(*spec.Input.AvatarUrl.Value)
		if err != nil || parsed.Host == "" || parsed.Scheme != "https" || len(*spec.Input.AvatarUrl.Value) > 2048 {
			return MemberView{}, apierr.New(apierr.Invalid, "invalid avatar URL")
		}
	}
	if !spec.Input.AvatarUrl.Set {
		spec.Input.AvatarUrl.Value = nil
	}
	return runMemberCommand(ctx, s, actor, "updateMyProfile", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (MemberView, error) {
		locked, err := repos.Member.LockUpdateMyProfile(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return MemberView{}, err
		}
		if !locked.Exists {
			return MemberView{}, apierr.New(apierr.NotFound, "member not found")
		}
		return repos.Member.StoreUpdateMyProfile(ctx, UpdateMyProfileWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) FollowPerson(ctx context.Context, actor auth.Authority, spec FollowPersonSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := commandID(&spec.MemberId); err != nil {
		return product.CommandReceipt{}, err
	}
	if spec.MemberId == actor.Claims().MemberID {
		return product.CommandReceipt{}, apierr.New(apierr.Invalid, "cannot follow self")
	}
	return runMemberCommand(ctx, s, actor, "followPerson", spec, meta, spec.MemberId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		locked, err := repos.Social.LockFollowPerson(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return product.CommandReceipt{}, err
		}
		if !locked.Exists {
			return product.CommandReceipt{}, apierr.New(apierr.NotFound, "member not found")
		}
		return repos.Social.StoreFollowPerson(ctx, FollowPersonWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) UnfollowPerson(ctx context.Context, actor auth.Authority, spec UnfollowPersonSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := commandID(&spec.MemberId); err != nil {
		return product.CommandReceipt{}, err
	}
	if spec.MemberId == actor.Claims().MemberID {
		return product.CommandReceipt{}, apierr.New(apierr.Invalid, "cannot unfollow self")
	}
	return runMemberCommand(ctx, s, actor, "unfollowPerson", spec, meta, spec.MemberId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		locked, err := repos.Social.LockUnfollowPerson(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return product.CommandReceipt{}, err
		}
		if !locked.Exists {
			return product.CommandReceipt{}, apierr.New(apierr.NotFound, "member not found")
		}
		return repos.Social.StoreUnfollowPerson(ctx, UnfollowPersonWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) GrantUnlock(ctx context.Context, actor auth.Authority, spec GrantUnlockSpec, meta product.CommandMeta) (MemberUnlockView, error) {
	if err := commandID(&spec.MemberId); err != nil {
		return MemberUnlockView{}, err
	}
	if err := commandID(&spec.UnlockableId); err != nil {
		return MemberUnlockView{}, err
	}
	if err := queryText(spec.Note, 2000); err != nil {
		return MemberUnlockView{}, err
	}
	return runMemberCommand(ctx, s, actor, "grantUnlock", spec, meta, spec.MemberId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (MemberUnlockView, error) {
		locked, err := repos.Member.LockGrantUnlock(ctx, spec)
		if err != nil {
			return MemberUnlockView{}, err
		}
		if !locked.Exists {
			return MemberUnlockView{}, apierr.New(apierr.NotFound, "member or unlockable not found")
		}
		if locked.ExistingGrant != nil {
			return *locked.ExistingGrant, nil
		}
		if !locked.Catalog.Active {
			return MemberUnlockView{}, apierr.New(apierr.Invalid, "unlockable is inactive")
		}
		return repos.Member.StoreGrantUnlock(ctx, GrantUnlockWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) SetUnlockableActive(ctx context.Context, actor auth.Authority, spec SetUnlockableActiveSpec, meta product.CommandMeta) (UnlockableView, error) {
	if err := commandID(&spec.Id); err != nil {
		return UnlockableView{}, err
	}
	return runMemberCommand(ctx, s, actor, "setUnlockableActive", spec, meta, spec.Id, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (UnlockableView, error) {
		locked, err := repos.Reference.LockSetUnlockableActive(ctx, spec)
		if err != nil {
			return UnlockableView{}, err
		}
		if !locked.Exists {
			return UnlockableView{}, apierr.New(apierr.NotFound, "unlockable not found")
		}
		return repos.Reference.StoreSetUnlockableActive(ctx, SetUnlockableActiveWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) UpsertUnlockable(ctx context.Context, actor auth.Authority, spec UpsertUnlockableSpec, meta product.CommandMeta) (UnlockableView, error) {
	subject := actor.Claims().MemberID
	if spec.Id != nil {
		id := *spec.Id
		if err := commandID(&id); err != nil {
			return UnlockableView{}, err
		}
		spec.Id = &id
		subject = id
	}
	if err := queryText(spec.Input.Name, 200); err != nil {
		return UnlockableView{}, err
	}
	if err := commandNote(spec.Input.Description); err != nil {
		return UnlockableView{}, err
	}
	if _, err := mapAPIUnlockKind(spec.Input.Kind); err != nil {
		return UnlockableView{}, apierr.New(apierr.Invalid, "invalid unlockable kind")
	}
	if !json.Valid(spec.Input.Payload) || string(spec.Input.Payload) == "null" {
		return UnlockableView{}, apierr.New(apierr.Invalid, "invalid unlockable payload")
	}
	if spec.Input.UnlockRule != nil {
		var rule map[string]any
		if json.Unmarshal(*spec.Input.UnlockRule, &rule) != nil || len(rule) != 1 || rule["type"] != "admin_grant" {
			return UnlockableView{}, apierr.New(apierr.Invalid, "invalid unlock rule")
		}
	}
	return runMemberCommand(ctx, s, actor, "upsertUnlockable", spec, meta, subject, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (UnlockableView, error) {
		locked, err := repos.Reference.LockUpsertUnlockable(ctx, spec)
		if err != nil {
			return UnlockableView{}, err
		}
		id := ""
		if spec.Id != nil {
			if !locked.Exists {
				return UnlockableView{}, apierr.New(apierr.NotFound, "unlockable not found")
			}
			id = *spec.Id
		} else {
			id = s.IDs()
			if err := commandID(&id); err != nil {
				return UnlockableView{}, err
			}
		}
		return repos.Reference.StoreUpsertUnlockable(ctx, UpsertUnlockableWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, UnlockableID: id})
	})
}

func (s ProductCommands) SetMyAvailability(ctx context.Context, actor auth.Authority, spec SetMyAvailabilitySpec, meta product.CommandMeta) ([]AvailabilitySlotView, error) {
	if len(spec.Slots) > 28 {
		return nil, apierr.New(apierr.Invalid, "availability exceeds 28 slots")
	}
	spec.Slots = slices.Clone(spec.Slots)
	for i, slot := range spec.Slots {
		day, err := parseWeekday(slot.Day)
		if err != nil {
			return nil, apierr.New(apierr.Invalid, "invalid availability day")
		}
		start, err := parseMinuteTime(slot.StartTime)
		if err != nil {
			return nil, apierr.New(apierr.Invalid, "invalid availability start")
		}
		end, err := parseMinuteTime(slot.EndTime)
		if err != nil || end <= start {
			return nil, apierr.New(apierr.Invalid, "invalid availability end")
		}
		spec.Slots[i].Day = weekdayName(day)
		spec.Slots[i].StartTime = minuteTime(start)
		spec.Slots[i].EndTime = minuteTime(end)
		if err := commandNote(slot.Note); err != nil {
			return nil, err
		}
		for _, prior := range spec.Slots[:i] {
			pd, _ := parseWeekday(prior.Day)
			ps, _ := parseMinuteTime(prior.StartTime)
			pe, _ := parseMinuteTime(prior.EndTime)
			if day == pd && start < pe && ps < end {
				return nil, apierr.New(apierr.Invalid, "overlapping availability")
			}
		}
	}
	return runMemberCommand(ctx, s, actor, "setMyAvailability", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]AvailabilitySlotView, error) {
		locked, err := repos.Member.LockSetMyAvailability(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return nil, err
		}
		if !locked.Exists {
			return nil, apierr.New(apierr.NotFound, "member not found")
		}
		return repos.Member.StoreSetMyAvailability(ctx, SetMyAvailabilityWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) UpdateMySettings(ctx context.Context, actor auth.Authority, spec UpdateMySettingsSpec, meta product.CommandMeta) (MemberSettingsView, error) {
	patch := reflect.ValueOf(&spec.Input).Elem()
	for i := 0; i < patch.NumField(); i++ {
		field := patch.Field(i)
		set := field.FieldByName("Set").Bool()
		value := field.FieldByName("Value")
		if !set {
			value.SetZero()
		} else if value.IsNil() && patch.Type().Field(i).Name != "Timezone" {
			return MemberSettingsView{}, apierr.New(apierr.Invalid, "settings value cannot be null")
		}
	}
	p := spec.Input
	if p.Theme.Set && !slices.Contains([]Theme{ThemeParchment, ThemeMidnight, ThemeEmber, ThemeDracula, ThemeVegan}, *p.Theme.Value) {
		return MemberSettingsView{}, apierr.New(apierr.Invalid, "invalid theme")
	}
	if p.Mode.Set && !slices.Contains([]ColorMode{ColorModeLight, ColorModeDark, ColorModeSystem}, *p.Mode.Value) {
		return MemberSettingsView{}, apierr.New(apierr.Invalid, "invalid color mode")
	}
	if p.Density.Set && !slices.Contains([]Density{DensityComfortable, DensityCompact}, *p.Density.Value) {
		return MemberSettingsView{}, apierr.New(apierr.Invalid, "invalid density")
	}
	if p.Timezone.Set && p.Timezone.Value != nil {
		if _, err := time.LoadLocation(*p.Timezone.Value); err != nil {
			return MemberSettingsView{}, apierr.New(apierr.Invalid, "invalid timezone")
		}
	}
	return runMemberCommand(ctx, s, actor, "updateMySettings", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (MemberSettingsView, error) {
		locked, err := repos.Member.LockUpdateMySettings(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return MemberSettingsView{}, err
		}
		if !locked.Exists {
			return MemberSettingsView{}, apierr.New(apierr.NotFound, "member not found")
		}
		return repos.Member.StoreUpdateMySettings(ctx, UpdateMySettingsWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) CreateRequest(ctx context.Context, actor auth.Authority, spec CreateRequestSpec, meta product.CommandMeta) (RequestView, error) {
	if err := commandID(&spec.TargetDmId); err != nil {
		return RequestView{}, err
	}
	if spec.TargetDmId == actor.Claims().MemberID {
		return RequestView{}, apierr.New(apierr.Invalid, "cannot request self")
	}
	if spec.Kind != "quest" && spec.Kind != "seat" {
		return RequestView{}, apierr.New(apierr.Invalid, "invalid request kind")
	}
	if err := commandNote(spec.Note); err != nil {
		return RequestView{}, err
	}
	return runMemberCommand(ctx, s, actor, "createRequest", spec, meta, spec.TargetDmId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (RequestView, error) {
		locked, err := repos.Social.LockCreateRequest(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return RequestView{}, err
		}
		if !locked.Exists {
			return RequestView{}, apierr.New(apierr.Invalid, "request target unavailable")
		}
		id := s.IDs()
		if err := commandID(&id); err != nil {
			return RequestView{}, err
		}
		return repos.Social.StoreCreateRequest(ctx, CreateRequestWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, RequestID: id})
	})
}

func (s ProductCommands) DecideRequest(ctx context.Context, actor auth.Authority, spec DecideRequestSpec, meta product.CommandMeta) (RequestView, error) {
	var result RequestView
	if err := commandID(&spec.RequestId); err != nil {
		return result, err
	}
	spec.Decision = strings.ToLower(spec.Decision)
	if spec.Decision != "approved" && spec.Decision != "declined" {
		return result, apierr.New(apierr.Invalid, "invalid request decision")
	}
	if err := commandNote(spec.Note); err != nil {
		return result, err
	}
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay, repos.Social, repos.Producer} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "request transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		locked, err := repos.Social.LockDecideRequest(ctx, spec)
		if err != nil {
			return err
		}
		if !locked.Exists || locked.Before == nil {
			return apierr.New(apierr.NotFound, "request not found")
		}
		request, err := auth.ForRequestDecision(auth.RequestDecisionFacts{ID: locked.SubjectID, TargetDMID: locked.Parties.TargetDMID})
		if err != nil {
			return err
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "request decision forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, "decideRequest", meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			return json.Unmarshal(claim.Receipt, &result)
		}
		if locked.Before.Status != "pending" || locked.PriorDecision != nil {
			return apierr.New(apierr.Conflict, "request already decided")
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		id := s.IDs()
		if err := commandID(&id); err != nil {
			return err
		}
		key := "request-decision:" + id
		result, err = repos.Social.StoreDecideRequest(ctx, DecideRequestWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, DecisionID: &id, EventKey: &key})
		if err != nil {
			return err
		}
		if err := repos.Producer.Record(ctx, repos.Notice, notification.Event{Key: key, Kind: notification.DMRequestDecided, SubjectType: "request", SubjectID: spec.RequestId, ActorID: fresh.Claims().MemberID, OccurredAt: at, Facts: notification.Facts{Version: 1, EventKind: notification.DMRequestDecided, DecisionID: &id, RequestID: &spec.RequestId, Decision: &spec.Decision}}); err != nil {
			return err
		}
		receipt, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return repos.Replay.Complete(ctx, claim, receipt)
	})
	if err != nil {
		return RequestView{}, err
	}
	return result, nil
}

func dmProfileTableInfo(value *json.RawMessage) error {
	if value == nil {
		return nil
	}
	if !json.Valid(*value) {
		return apierr.New(apierr.Invalid, "invalid dm profile table info")
	}
	return nil
}

func (s ProductCommands) UpdateMyDmProfile(ctx context.Context, actor auth.Authority, spec UpdateMyDmProfileSpec, meta product.CommandMeta) (DmProfileView, error) {
	if spec.Input.Tagline != nil {
		if err := queryText(*spec.Input.Tagline, 200); err != nil {
			return DmProfileView{}, err
		}
	}
	if spec.Input.Philosophy != nil {
		if err := queryText(*spec.Input.Philosophy, 4000); err != nil {
			return DmProfileView{}, err
		}
	}
	if spec.Input.HouseRules != nil {
		if err := queryText(*spec.Input.HouseRules, 4000); err != nil {
			return DmProfileView{}, err
		}
	}
	if err := dmProfileTableInfo(spec.Input.TableInfo); err != nil {
		return DmProfileView{}, err
	}
	return runMemberCommand(ctx, s, actor, "updateMyDmProfile", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DmProfileView, error) {
		locked, err := repos.Member.LockUpdateMyDmProfile(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return DmProfileView{}, err
		}
		if !locked.Exists {
			return DmProfileView{}, apierr.New(apierr.NotFound, "member not found")
		}
		return repos.Member.StoreUpdateMyDmProfile(ctx, UpdateMyDmProfileWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) SubmitDmProfileForVerification(ctx context.Context, actor auth.Authority, spec SubmitDmProfileForVerificationSpec, meta product.CommandMeta) (DmProfileView, error) {
	if spec.ExpectedRevision < 1 {
		return DmProfileView{}, apierr.New(apierr.Invalid, "invalid dm profile revision")
	}
	return runMemberCommand(ctx, s, actor, "submitDmProfileForVerification", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DmProfileView, error) {
		locked, err := repos.Member.LockSubmitDmProfileForVerification(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return DmProfileView{}, err
		}
		if !locked.Exists {
			return DmProfileView{}, apierr.New(apierr.NotFound, "dm profile not found")
		}
		return repos.Member.StoreSubmitDmProfileForVerification(ctx, SubmitDmProfileForVerificationWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) DecideDmProfileVerification(ctx context.Context, actor auth.Authority, spec DecideDmProfileVerificationSpec, meta product.CommandMeta) (DmProfileView, error) {
	if err := commandID(&spec.MemberId); err != nil {
		return DmProfileView{}, err
	}
	if spec.ExpectedRevision < 1 {
		return DmProfileView{}, apierr.New(apierr.Invalid, "invalid dm profile revision")
	}
	if spec.Verdict != VerificationVerdictApproved && spec.Verdict != VerificationVerdictRejected {
		return DmProfileView{}, apierr.New(apierr.Invalid, "invalid verification verdict")
	}
	if err := commandNote(spec.Note); err != nil {
		return DmProfileView{}, err
	}
	return runMemberCommand(ctx, s, actor, "decideDmProfileVerification", spec, meta, spec.MemberId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DmProfileView, error) {
		locked, err := repos.Member.LockDecideDmProfileVerification(ctx, spec)
		if err != nil {
			return DmProfileView{}, err
		}
		if !locked.Exists {
			return DmProfileView{}, apierr.New(apierr.NotFound, "dm profile not found")
		}
		id := s.IDs()
		if err := commandID(&id); err != nil {
			return DmProfileView{}, err
		}
		return repos.Member.StoreDecideDmProfileVerification(ctx, DecideDmProfileVerificationWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, DecisionID: &id,
		})
	})
}
