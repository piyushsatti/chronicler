package member

import (
	"context"
	"reflect"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	Reconciler    GrantReconciler
	OverrideReads auth.OverrideReadObserver
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver, reconciler GrantReconciler) (*ProductQueries, error) {
	for _, dependency := range []any{reads.Member, reads.Reference, reads.Social, reads.Batch, policy, clock, overrideReads, reconciler} {
		if dependency == nil {
			return nil, apierr.New(apierr.Internal, "member query dependencies required")
		}
		value := reflect.ValueOf(dependency)
		switch value.Kind() {
		case reflect.Pointer, reflect.Func, reflect.Interface, reflect.Map, reflect.Slice, reflect.Chan:
			if value.IsNil() {
				return nil, apierr.New(apierr.Internal, "member query dependencies required")
			}
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads, Reconciler: reconciler}, nil
}

func (s ProductQueries) authorize(ctx context.Context, actor auth.Authority, request auth.Request, subjectID string) error {
	decision, err := s.Policy.Decide(ctx, actor, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "member read forbidden")
	}
	if decision.UsedOverride {
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		s.OverrideReads.Observe(ctx, auth.OverrideFact{ActorID: actor.Claims().MemberID, Operation: request.Operation(), SubjectType: "member", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at})
	}
	return nil
}

func (s ProductQueries) admit(ctx context.Context, actor auth.Authority, operation auth.Operation, subjectID string) error {
	request, err := auth.ForOperation(operation)
	if err != nil {
		return err
	}
	return s.authorize(ctx, actor, request, subjectID)
}

func queryPage(limit, offset int32) error {
	if limit <= 0 || offset < 0 {
		return apierr.New(apierr.Invalid, "invalid member page")
	}
	return nil
}

func queryID(value *string) error {
	parsed, err := uuid.Parse(*value)
	if err != nil || !strings.EqualFold(parsed.String(), *value) {
		return apierr.New(apierr.Invalid, "invalid member public id")
	}
	*value = parsed.String()
	return nil
}

func queryText(value string, maximum int) error {
	if !utf8.ValidString(value) || strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > maximum {
		return apierr.New(apierr.Invalid, "invalid member query text")
	}
	return nil
}

func queryRole(role *string) error {
	if role == nil {
		return nil
	}
	switch *role {
	case "player", "dm", "archon", "lieutenant", "verifier", "admin":
		return nil
	default:
		return apierr.New(apierr.Invalid, "invalid member role")
	}
}

func querySearch(search *string) error {
	if search == nil {
		return nil
	}
	return queryText(*search, 200)
}

func (s ProductQueries) projectMember(actor auth.Authority, value MemberView) MemberView {
	claims := actor.Claims()
	if claims.MemberID != value.Id && !claims.Has(auth.Admin) && !actor.IsPlatformOwner() {
		value.DiscordId = nil
	}
	return value
}

func (s ProductQueries) CommunityDirectory(ctx context.Context, actor auth.Authority, spec CommunityDirectorySpec) (CommunityDirectoryResult, error) {
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return CommunityDirectoryResult{}, err
	}
	if spec.Filters != nil {
		if err := queryRole(spec.Filters.Role); err != nil {
			return CommunityDirectoryResult{}, err
		}
		if err := querySearch(spec.Filters.Search); err != nil {
			return CommunityDirectoryResult{}, err
		}
		if spec.Filters.DmProfileStatus != nil {
			switch *spec.Filters.DmProfileStatus {
			case "draft", "pending", "approved", "rejected":
			default:
				return CommunityDirectoryResult{}, apierr.New(apierr.Invalid, "invalid DM profile status")
			}
		}
	}
	if err := s.admit(ctx, actor, "Query.communityDirectory", actor.Claims().MemberID); err != nil {
		return CommunityDirectoryResult{}, err
	}
	return s.Reads.Member.ReadCommunityDirectory(ctx, actor, spec)
}

func (s ProductQueries) DmRequests(ctx context.Context, actor auth.Authority, spec DmRequestsSpec) (RequestPage, error) {
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return RequestPage{}, err
	}
	if err := s.admit(ctx, actor, "Query.dmRequests", actor.Claims().MemberID); err != nil {
		return RequestPage{}, err
	}
	return s.Reads.Social.ReadDmRequests(ctx, actor, spec)
}

func (s ProductQueries) IsFollowing(ctx context.Context, actor auth.Authority, spec IsFollowingSpec) (bool, error) {
	if err := queryID(&spec.MemberId); err != nil {
		return false, err
	}
	if err := s.admit(ctx, actor, "Query.isFollowing", spec.MemberId); err != nil {
		return false, err
	}
	return s.Reads.Social.ReadIsFollowing(ctx, actor, spec)
}

func (s ProductQueries) Member(ctx context.Context, actor auth.Authority, spec MemberSpec) (*MemberView, error) {
	if (spec.Id == nil) == (spec.Handle == nil) {
		return nil, apierr.New(apierr.Invalid, "exactly one member identity required")
	}
	if spec.Id != nil {
		id := *spec.Id
		if err := queryID(&id); err != nil {
			return nil, err
		}
		spec.Id = &id
	}
	if spec.Handle != nil {
		if err := queryText(*spec.Handle, 64); err != nil {
			return nil, err
		}
	}
	if err := s.admit(ctx, actor, "Query.member", actor.Claims().MemberID); err != nil {
		return nil, err
	}
	value, err := s.Reads.Member.ReadMember(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	if value != nil {
		projected := s.projectMember(actor, *value)
		value = &projected
	}
	return value, nil
}

func (s ProductQueries) MemberActivityStats(ctx context.Context, actor auth.Authority, spec MemberActivityStatsSpec) (*MemberActivityStatsView, error) {
	if err := queryID(&spec.MemberId); err != nil {
		return nil, err
	}
	if err := s.admit(ctx, actor, "Query.memberActivityStats", spec.MemberId); err != nil {
		return nil, err
	}
	return s.Reads.Member.ReadMemberActivityStats(ctx, actor, spec)
}

func (s ProductQueries) MemberAvailability(ctx context.Context, actor auth.Authority, spec MemberAvailabilitySpec) ([]AvailabilitySlotView, error) {
	if err := queryID(&spec.MemberId); err != nil {
		return nil, err
	}
	if err := s.admit(ctx, actor, "Query.memberAvailability", spec.MemberId); err != nil {
		return nil, err
	}
	return s.Reads.Member.ReadMemberAvailability(ctx, actor, spec)
}

func (s ProductQueries) MemberMe(ctx context.Context, actor auth.Authority, spec MemberMeSpec) (MemberView, error) {

	if err := s.admit(ctx, actor, "Query.memberMe", actor.Claims().MemberID); err != nil {
		return MemberView{}, err
	}
	value, err := s.Reads.Member.ReadMemberMe(ctx, actor, spec)
	if err != nil {
		return MemberView{}, err
	}
	value = s.projectMember(actor, value)
	return value, nil
}

func (s ProductQueries) MemberProfile(ctx context.Context, actor auth.Authority, spec MemberProfileSpec) (*MemberProfileView, error) {
	if err := queryText(spec.Handle, 64); err != nil {
		return nil, err
	}
	if err := s.admit(ctx, actor, "Query.memberProfile", actor.Claims().MemberID); err != nil {
		return nil, err
	}
	value, err := s.Reads.Member.ReadMemberProfile(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	if value != nil {
		projected := *value
		projected.Member = s.projectMember(actor, value.Member)
		value = &projected
	}
	return value, nil
}

func (s ProductQueries) MemberRoleHistory(ctx context.Context, actor auth.Authority, spec MemberRoleHistorySpec) (RoleChangePage, error) {
	if err := queryID(&spec.MemberId); err != nil {
		return RoleChangePage{}, err
	}
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return RoleChangePage{}, err
	}
	if err := s.admit(ctx, actor, "Query.memberRoleHistory", spec.MemberId); err != nil {
		return RoleChangePage{}, err
	}
	return s.Reads.Member.ReadMemberRoleHistory(ctx, actor, spec)
}

func (s ProductQueries) Members(ctx context.Context, actor auth.Authority, spec MembersSpec) (MemberListResult, error) {
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return MemberListResult{}, err
	}
	if spec.Sort != nil {
		switch *spec.Sort {
		case MemberSortInputHandle, MemberSortInputJoinedAtAsc, MemberSortInputJoinedAtDesc:
		default:
			return MemberListResult{}, apierr.New(apierr.Invalid, "invalid member sort")
		}
	}
	if spec.Filters != nil {
		if err := queryRole(spec.Filters.Role); err != nil {
			return MemberListResult{}, err
		}
		if err := querySearch(spec.Filters.Search); err != nil {
			return MemberListResult{}, err
		}
		if spec.Filters.Status != nil {
			switch *spec.Filters.Status {
			case "active", "inactive", "banned":
			default:
				return MemberListResult{}, apierr.New(apierr.Invalid, "invalid member status")
			}
		}
	}
	if err := s.admit(ctx, actor, "Query.members", actor.Claims().MemberID); err != nil {
		return MemberListResult{}, err
	}
	value, err := s.Reads.Member.ReadMembers(ctx, actor, spec)
	if err != nil {
		return MemberListResult{}, err
	}
	items := make([]MemberView, len(value.Items))
	for i, item := range value.Items {
		items[i] = s.projectMember(actor, item)
	}
	value.Items = items
	return value, nil
}

func (s ProductQueries) MyAvailability(ctx context.Context, actor auth.Authority, spec MyAvailabilitySpec) ([]AvailabilitySlotView, error) {

	if err := s.admit(ctx, actor, "Query.myAvailability", actor.Claims().MemberID); err != nil {
		return nil, err
	}
	return s.Reads.Member.ReadMyAvailability(ctx, actor, spec)
}

func (s ProductQueries) MyPersonalization(ctx context.Context, actor auth.Authority, spec MyPersonalizationSpec) (*MyPersonalizationView, error) {

	if err := s.admit(ctx, actor, "Query.myPersonalization", actor.Claims().MemberID); err != nil {
		return nil, err
	}
	return s.Reads.Member.ReadMyPersonalization(ctx, actor, spec)
}

func (s ProductQueries) MyRequests(ctx context.Context, actor auth.Authority, spec MyRequestsSpec) (RequestPage, error) {
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return RequestPage{}, err
	}
	if err := s.admit(ctx, actor, "Query.myRequests", actor.Claims().MemberID); err != nil {
		return RequestPage{}, err
	}
	return s.Reads.Social.ReadMyRequests(ctx, actor, spec)
}

func (s ProductQueries) PendingDmProfileVerifications(ctx context.Context, actor auth.Authority, spec PendingDmProfileVerificationsSpec) (CommunityDirectoryResult, error) {
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return CommunityDirectoryResult{}, err
	}
	if err := s.admit(ctx, actor, "Query.pendingDmProfileVerifications", actor.Claims().MemberID); err != nil {
		return CommunityDirectoryResult{}, err
	}
	return s.Reads.Member.ReadPendingDmProfileVerifications(ctx, actor, spec)
}

func (s ProductQueries) UnlockablesCatalog(ctx context.Context, actor auth.Authority, spec UnlockablesCatalogSpec) (UnlockablePage, error) {
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return UnlockablePage{}, err
	}
	if err := s.admit(ctx, actor, "Query.unlockablesCatalog", actor.Claims().MemberID); err != nil {
		return UnlockablePage{}, err
	}
	return s.Reads.Reference.ReadUnlockablesCatalog(ctx, actor, spec)
}

func (s ProductQueries) MemberByDiscordId(ctx context.Context, actor auth.Authority, spec MemberByDiscordIdSpec) (*MemberView, error) {
	if err := queryText(spec.DiscordId, 64); err != nil {
		return nil, err
	}
	request, err := auth.ForDiscordLookup(auth.DiscordLookupFacts{RequestedDiscordID: spec.DiscordId})
	if err != nil {
		return nil, err
	}
	if err := s.authorize(ctx, actor, request, actor.Claims().MemberID); err != nil {
		return nil, err
	}
	value, err := s.Reads.Member.ReadMemberByDiscordId(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	if value != nil {
		projected := s.projectMember(actor, *value)
		value = &projected
	}
	return value, nil
}

func (s ProductQueries) MyUnlocks(ctx context.Context, actor auth.Authority, spec MyUnlocksSpec) (MemberUnlockPage, error) {
	if err := queryPage(spec.Limit, spec.Offset); err != nil {
		return MemberUnlockPage{}, err
	}
	if err := s.admit(ctx, actor, "Query.myUnlocks", actor.Claims().MemberID); err != nil {
		return MemberUnlockPage{}, err
	}
	snapshot, err := s.Reads.Member.ReadMyUnlocks(ctx, actor, spec)
	if err != nil {
		return MemberUnlockPage{}, err
	}
	projection, err := s.Reconciler.Project(snapshot.Catalog, snapshot.AllGrants)
	if err != nil {
		return MemberUnlockPage{}, err
	}
	return MemberUnlockPage{Items: snapshot.PagedGrants, Total: snapshot.Total, DriverProgress: snapshot.DriverProgress, DmTier: projection.DMTier, UnlockedAchievements: projection.AchievementNames}, nil
}

func readQueryBatch[K any, V any](ctx context.Context, actor auth.Authority, keys []K, validate func(*K) error, read func(context.Context, auth.Authority, []K) ([]product.BatchResult[V], error)) ([]product.BatchResult[V], error) {
	out := make([]product.BatchResult[V], len(keys))
	valid := make([]K, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		if err := validate(&key); err != nil {
			out[i].Err = err
			continue
		}
		valid = append(valid, key)
		positions = append(positions, i)
	}
	if len(valid) == 0 {
		return out, nil
	}
	results, err := read(ctx, actor, valid)
	if err != nil {
		return nil, err
	}
	if len(results) != len(valid) {
		return nil, apierr.New(apierr.Internal, "member batch correspondence mismatch")
	}
	for i, result := range results {
		out[positions[i]] = result
	}
	return out, nil
}

func (s ProductQueries) BatchMembers(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[MemberView], error) {
	if err := s.admit(ctx, actor, "Query.member", ""); err != nil {
		return nil, err
	}
	out, err := readQueryBatch(ctx, actor, keys, func(key *IDKey) error { return queryID(&key.ID) }, s.Reads.Batch.ReadBatchMembers)
	if err != nil {
		return nil, err
	}
	for i, result := range out {
		if result.Value != nil {
			value := s.projectMember(actor, *result.Value)
			out[i].Value = &value
		}
	}
	return out, err
}

func (s ProductQueries) BatchMemberVoiceChannels(ctx context.Context, actor auth.Authority, keys []MemberVoiceChannelsKey) ([]product.BatchResult[VoiceChannelList], error) {
	if err := s.admit(ctx, actor, "Query.memberActivityStats", ""); err != nil {
		return nil, err
	}
	out, err := readQueryBatch(ctx, actor, keys, func(key *MemberVoiceChannelsKey) error {
		if err := queryID(&key.ParentID); err != nil {
			return err
		}
		return queryPage(key.Limit, key.Offset)
	}, s.Reads.Batch.ReadBatchMemberVoiceChannels)
	return out, err
}

func (s ProductQueries) BatchMemberRecentSessions(ctx context.Context, actor auth.Authority, keys []MemberRecentSessionsKey) ([]product.BatchResult[ActivityEventList], error) {
	if err := s.admit(ctx, actor, "Query.memberActivityStats", ""); err != nil {
		return nil, err
	}
	out, err := readQueryBatch(ctx, actor, keys, func(key *MemberRecentSessionsKey) error {
		if err := queryID(&key.ParentID); err != nil {
			return err
		}
		if key.Limit > 100 {
			return apierr.New(apierr.Invalid, "activity session limit exceeds 100")
		}
		return queryPage(key.Limit, key.Offset)
	}, s.Reads.Batch.ReadBatchMemberRecentSessions)
	return out, err
}

func (s ProductQueries) BatchMemberRecentWeeks(ctx context.Context, actor auth.Authority, keys []MemberRecentWeeksKey) ([]product.BatchResult[WeekActivityList], error) {
	if err := s.admit(ctx, actor, "Query.memberActivityStats", ""); err != nil {
		return nil, err
	}
	out, err := readQueryBatch(ctx, actor, keys, func(key *MemberRecentWeeksKey) error {
		if err := queryID(&key.ParentID); err != nil {
			return err
		}
		if key.Limit > 12 {
			return apierr.New(apierr.Invalid, "activity week limit exceeds 12")
		}
		return queryPage(key.Limit, key.Offset)
	}, s.Reads.Batch.ReadBatchMemberRecentWeeks)
	return out, err
}
