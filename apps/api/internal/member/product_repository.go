package member

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type MemberReadRepository interface {
	ReadCommunityDirectory(ctx context.Context, actor auth.Authority, spec CommunityDirectorySpec) (CommunityDirectoryResult, error)
	ReadMember(ctx context.Context, actor auth.Authority, spec MemberSpec) (*MemberView, error)
	ReadMemberActivityStats(ctx context.Context, actor auth.Authority, spec MemberActivityStatsSpec) (*MemberActivityStatsView, error)
	ReadMemberAvailability(ctx context.Context, actor auth.Authority, spec MemberAvailabilitySpec) ([]AvailabilitySlotView, error)
	ReadMemberByDiscordId(ctx context.Context, actor auth.Authority, spec MemberByDiscordIdSpec) (*MemberView, error)
	ReadMemberMe(ctx context.Context, actor auth.Authority, spec MemberMeSpec) (MemberView, error)
	ReadMemberProfile(ctx context.Context, actor auth.Authority, spec MemberProfileSpec) (*MemberProfileView, error)
	ReadMemberRoleHistory(ctx context.Context, actor auth.Authority, spec MemberRoleHistorySpec) (RoleChangePage, error)
	ReadMembers(ctx context.Context, actor auth.Authority, spec MembersSpec) (MemberListResult, error)
	ReadMyAvailability(ctx context.Context, actor auth.Authority, spec MyAvailabilitySpec) ([]AvailabilitySlotView, error)
	ReadMyPersonalization(ctx context.Context, actor auth.Authority, spec MyPersonalizationSpec) (*MyPersonalizationView, error)
	ReadMyUnlocks(ctx context.Context, actor auth.Authority, spec MyUnlocksSpec) (GrantSnapshot, error)
	ReadPendingDmProfileVerifications(ctx context.Context, actor auth.Authority, spec PendingDmProfileVerificationsSpec) (CommunityDirectoryResult, error)
}

type MemberWriteRepository interface {
	LockDecideDmProfileVerification(ctx context.Context, spec DecideDmProfileVerificationSpec) (DecideDmProfileVerificationState, error)
	StoreDecideDmProfileVerification(ctx context.Context, write DecideDmProfileVerificationWrite) (DmProfileView, error)
	LockGrantUnlock(ctx context.Context, spec GrantUnlockSpec) (GrantUnlockState, error)
	StoreGrantUnlock(ctx context.Context, write GrantUnlockWrite) (MemberUnlockView, error)
	LockSetMemberRoles(ctx context.Context, spec SetMemberRolesSpec) (SetMemberRolesState, error)
	StoreSetMemberRoles(ctx context.Context, write SetMemberRolesWrite) (MemberView, error)
	LockSetMemberRolesBatch(ctx context.Context, spec SetMemberRolesBatchSpec) (SetMemberRolesBatchState, error)
	StoreSetMemberRolesBatch(ctx context.Context, write SetMemberRolesBatchWrite) ([]MemberRoleBatchResultView, error)
	LockSetMyAvailability(ctx context.Context, actorID string, spec SetMyAvailabilitySpec) (SetMyAvailabilityState, error)
	StoreSetMyAvailability(ctx context.Context, write SetMyAvailabilityWrite) ([]AvailabilitySlotView, error)
	LockSubmitDmProfileForVerification(ctx context.Context, actorID string, spec SubmitDmProfileForVerificationSpec) (SubmitDmProfileForVerificationState, error)
	StoreSubmitDmProfileForVerification(ctx context.Context, write SubmitDmProfileForVerificationWrite) (DmProfileView, error)
	LockUpdateMyDmProfile(ctx context.Context, actorID string, spec UpdateMyDmProfileSpec) (UpdateMyDmProfileState, error)
	StoreUpdateMyDmProfile(ctx context.Context, write UpdateMyDmProfileWrite) (DmProfileView, error)
	LockUpdateMyProfile(ctx context.Context, actorID string, spec UpdateMyProfileSpec) (UpdateMyProfileState, error)
	StoreUpdateMyProfile(ctx context.Context, write UpdateMyProfileWrite) (MemberView, error)
	LockUpdateMySettings(ctx context.Context, actorID string, spec UpdateMySettingsSpec) (UpdateMySettingsState, error)
	StoreUpdateMySettings(ctx context.Context, write UpdateMySettingsWrite) (MemberSettingsView, error)
}

type ProductBatchRepository interface {
	ReadBatchMembers(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[MemberView], error)
	ReadBatchMemberVoiceChannels(ctx context.Context, actor auth.Authority, keys []MemberVoiceChannelsKey) ([]product.BatchResult[VoiceChannelList], error)
	ReadBatchMemberRecentSessions(ctx context.Context, actor auth.Authority, keys []MemberRecentSessionsKey) ([]product.BatchResult[ActivityEventList], error)
	ReadBatchMemberRecentWeeks(ctx context.Context, actor auth.Authority, keys []MemberRecentWeeksKey) ([]product.BatchResult[WeekActivityList], error)
}

type ReferenceReadRepository interface {
	ReadUnlockablesCatalog(ctx context.Context, actor auth.Authority, spec UnlockablesCatalogSpec) (UnlockablePage, error)
}

type ReferenceWriteRepository interface {
	LockSetUnlockableActive(ctx context.Context, spec SetUnlockableActiveSpec) (SetUnlockableActiveState, error)
	StoreSetUnlockableActive(ctx context.Context, write SetUnlockableActiveWrite) (UnlockableView, error)
	LockUpsertUnlockable(ctx context.Context, spec UpsertUnlockableSpec) (UpsertUnlockableState, error)
	StoreUpsertUnlockable(ctx context.Context, write UpsertUnlockableWrite) (UnlockableView, error)
}

type SocialReadRepository interface {
	ReadDmRequests(ctx context.Context, actor auth.Authority, spec DmRequestsSpec) (RequestPage, error)
	ReadIsFollowing(ctx context.Context, actor auth.Authority, spec IsFollowingSpec) (bool, error)
	ReadMyRequests(ctx context.Context, actor auth.Authority, spec MyRequestsSpec) (RequestPage, error)
}

type SocialWriteRepository interface {
	LockCreateRequest(ctx context.Context, actorID string, spec CreateRequestSpec) (CreateRequestState, error)
	StoreCreateRequest(ctx context.Context, write CreateRequestWrite) (RequestView, error)
	LockDecideRequest(ctx context.Context, spec DecideRequestSpec) (DecideRequestState, error)
	StoreDecideRequest(ctx context.Context, write DecideRequestWrite) (RequestView, error)
	LockFollowPerson(ctx context.Context, actorID string, spec FollowPersonSpec) (FollowPersonState, error)
	StoreFollowPerson(ctx context.Context, write FollowPersonWrite) (product.CommandReceipt, error)
	LockUnfollowPerson(ctx context.Context, actorID string, spec UnfollowPersonSpec) (UnfollowPersonState, error)
	StoreUnfollowPerson(ctx context.Context, write UnfollowPersonWrite) (product.CommandReceipt, error)
}

type ProductCommandRepos struct {
	Member    MemberWriteRepository
	Reference ReferenceWriteRepository
	Social    SocialWriteRepository
	Policy    *auth.Policy
	Authority auth.AuthorityResolver
	Replay    idempotency.Repository
	Producer  notification.EventProducer
	Notice    notification.ProducerRepos
	Audit     auth.OverrideRecorder
}

type ProductReadRepos struct {
	Member    MemberReadRepository
	Reference ReferenceReadRepository
	Social    SocialReadRepository
	Batch     ProductBatchRepository
}
