package member

import (
	"encoding/json"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ActivityEventView struct {
	Amount     float64
	ChannelId  string
	Kind       string
	OccurredAt time.Time
}

type ActivitySummaryView struct {
	Messages     float64
	Reactions    float64
	VoiceMinutes float64
}

type AvailabilitySlotFields struct {
	Day       string
	EndTime   product.Time
	Note      *string
	StartTime product.Time
}

type AvailabilitySlotView struct {
	Day       string
	EndTime   product.Time
	Note      *string
	StartTime product.Time
}

type ChannelVoiceMinutesView struct {
	ChannelId string
	Minutes   float64
}

type ColorMode string

const (
	ColorModeLight  ColorMode = "LIGHT"
	ColorModeDark   ColorMode = "DARK"
	ColorModeSystem ColorMode = "SYSTEM"
)

type CommunityDirectoryFiltersFields struct {
	AcceptingPlayers *bool
	DmProfileStatus  *string
	Role             *string
	Search           *string
}

type CommunityDirectoryResult struct {
	Entries []DirectoryEntryView
	Total   int32
}

type Density string

const (
	DensityComfortable Density = "COMFORTABLE"
	DensityCompact     Density = "COMPACT"
)

type DirectoryEntryView struct {
	AcceptingPlayers        *bool
	AvailableDays           []string
	AvatarUrl               *string
	DisplayName             string
	DmProfileReviewRevision *int32
	DmProfileStatus         *string
	Handle                  string
	IsDm                    bool
	MemberId                string
	Roles                   []string
	Status                  string
	TableInfo               *json.RawMessage
	Tagline                 *string
}

type DmProfileView struct {
	AcceptingPlayers bool
	HouseRules       *string
	MemberId         string
	Philosophy       *string
	ReviewRevision   int32
	Status           string
	TableInfo        *json.RawMessage
	Tagline          *string
}

type DriverProgressView struct {
	DmSessionsCount   int32
	PlayerQuestsCount int32
	TenureMonths      int32
}

type MemberActivityStatsView struct {
	LastMessageAt       *time.Time
	LongestSessionHours *float64
	Messages            float64
	QuestsPlayed        int32
	SummariesAuthored   int32
	VoiceMinutes        float64
	MemberID            string
}

type MemberFiltersFields struct {
	Role   *string
	Search *string
	Status *string
}

type MemberListResult struct {
	Items []MemberView
	Total int32
}

type MemberProfileView struct {
	ActivitySummary ActivitySummaryView
	Availability    []AvailabilitySlotView
	DmProfile       *DmProfileView
	Member          MemberView
}

type MemberRoleBatchFields struct {
	MemberId string
	Note     *string
	Roles    []string
}

type MemberRoleBatchResultView struct {
	Error    *string
	Member   *MemberView
	MemberId string
	Ok       bool
}

type MemberSearchHitView struct {
	AvatarUrl   *string
	DisplayName string
	Handle      string
	MemberId    string
}

type MemberSettingsPatch struct {
	ColorblindSafe              product.Optional[bool]
	Density                     product.Optional[Density]
	EffectsEnabled              product.Optional[bool]
	Mode                        product.Optional[ColorMode]
	NotifyCharacterVerification product.Optional[bool]
	NotifyDmMentioned           product.Optional[bool]
	NotifyDmRequestDecided      product.Optional[bool]
	NotifyDocumentActivity      product.Optional[bool]
	NotifyQuestScheduled        product.Optional[bool]
	NotifyQuestSignup           product.Optional[bool]
	ReducedMotion               product.Optional[bool]
	Theme                       product.Optional[Theme]
	Timezone                    product.Optional[string]
}

type MemberSettingsView struct {
	ColorblindSafe              bool
	Density                     Density
	EffectsEnabled              bool
	MemberId                    string
	Mode                        ColorMode
	NotifyCharacterVerification bool
	NotifyDmMentioned           bool
	NotifyDmRequestDecided      bool
	NotifyDocumentActivity      bool
	NotifyQuestScheduled        bool
	NotifyQuestSignup           bool
	ReducedMotion               bool
	Theme                       Theme
	Timezone                    *string
	UpdatedAt                   *time.Time
}

type MemberSortInput string

const (
	MemberSortInputHandle       MemberSortInput = "HANDLE"
	MemberSortInputJoinedAtAsc  MemberSortInput = "JOINED_AT_ASC"
	MemberSortInputJoinedAtDesc MemberSortInput = "JOINED_AT_DESC"
)

type MemberView struct {
	AvatarUrl   *string
	DiscordId   *string
	DisplayName string
	Handle      string
	Id          string
	JoinedAt    time.Time
	Roles       []string
	Status      string
}

type MemberUnlockPage struct {
	DmTier               string
	DriverProgress       DriverProgressView
	Items                []MemberUnlockView
	Total                int32
	UnlockedAchievements []string
}

type MemberUnlockView struct {
	GrantedBy    *string
	MemberId     string
	Source       string
	UnlockableId string
	UnlockedAt   time.Time
}

type MyPersonalizationView struct {
	Settings *MemberSettingsView
}

type RequestPage struct {
	Items []RequestView
	Total int32
}

type RequestView struct {
	Id          string
	Kind        string
	Note        *string
	RequesterId string
	Status      string
	TargetDmId  string
}

type RoleChangePage struct {
	Items []RoleChangeView
	Total int32
}

type RoleChangeView struct {
	ChangedBy  string
	Id         string
	MemberId   string
	NewRoles   []string
	Note       *string
	OccurredAt time.Time
	OldRoles   []string
}

type Theme string

const (
	ThemeParchment Theme = "PARCHMENT"
	ThemeMidnight  Theme = "MIDNIGHT"
	ThemeEmber     Theme = "EMBER"
	ThemeDracula   Theme = "DRACULA"
	ThemeVegan     Theme = "VEGAN"
)

type UnlockKind string

const (
	UnlockKindAchievement UnlockKind = "ACHIEVEMENT"
	UnlockKindDmTier      UnlockKind = "DM_TIER"
)

type UnlockablePage struct {
	Items []UnlockableView
	Total int32
}

type UnlockableView struct {
	Active      bool
	Description *string
	Id          string
	Kind        UnlockKind
	Name        string
	Payload     json.RawMessage
	UnlockRule  *json.RawMessage
}

type UpdateDmProfileFields struct {
	AcceptingPlayers bool
	HouseRules       *string
	Philosophy       *string
	TableInfo        *json.RawMessage
	Tagline          *string
}

type UpdateMyProfileFields struct {
	AvatarUrl   product.Optional[string]
	DisplayName string
}

type UpsertUnlockableFields struct {
	Active      bool
	Description *string
	Kind        UnlockKind
	Name        string
	Payload     json.RawMessage
	UnlockRule  *json.RawMessage
}

type VerificationPage struct {
	Items []VerificationView
	Total int32
}

type VerificationView struct {
	Id         string
	Note       *string
	RecordedAt time.Time
	TargetId   string
	TargetType string
	Verdict    string
	VerifiedBy string
}

type VerificationVerdict string

const (
	VerificationVerdictApproved VerificationVerdict = "APPROVED"
	VerificationVerdictRejected VerificationVerdict = "REJECTED"
)

type WeekActivityView struct {
	Messages     float64
	PeriodStart  product.Date
	Reactions    float64
	VoiceMinutes float64
}

type CreateRequestSpec struct {
	TargetDmId string
	Kind       string
	Note       *string
}

type DecideDmProfileVerificationSpec struct {
	MemberId         string
	ExpectedRevision int32
	Verdict          VerificationVerdict
	Note             *string
}

type DecideRequestSpec struct {
	RequestId string
	Decision  string
	Note      *string
}

type FollowPersonSpec struct {
	MemberId string
}

type GrantUnlockSpec struct {
	MemberId     string
	UnlockableId string
	Note         string
}

type SetMemberRolesSpec struct {
	MemberId string
	Roles    []string
	Note     *string
}

type SetMemberRolesBatchSpec struct {
	Changes []MemberRoleBatchFields
}

type SetMyAvailabilitySpec struct {
	Slots []AvailabilitySlotFields
}

type SetUnlockableActiveSpec struct {
	Id     string
	Active bool
}

type SubmitDmProfileForVerificationSpec struct {
	ExpectedRevision int32
}

type UnfollowPersonSpec struct {
	MemberId string
}

type UpdateMyDmProfileSpec struct {
	Input UpdateDmProfileFields
}

type UpdateMyProfileSpec struct {
	Input UpdateMyProfileFields
}

type UpdateMySettingsSpec struct {
	Input MemberSettingsPatch
}

type UpsertUnlockableSpec struct {
	Id    *string
	Input UpsertUnlockableFields
}

type CommunityDirectorySpec struct {
	Filters *CommunityDirectoryFiltersFields
	Limit   int32
	Offset  int32
}

type DmRequestsSpec struct {
	Limit  int32
	Offset int32
}

type IsFollowingSpec struct {
	MemberId string
}

type MemberSpec struct {
	Id     *string
	Handle *string
}

type MemberActivityStatsSpec struct {
	MemberId string
}

type MemberAvailabilitySpec struct {
	MemberId string
}

type MemberByDiscordIdSpec struct {
	DiscordId string
}

type MemberMeSpec struct {
}

type MemberProfileSpec struct {
	Handle string
}

type MemberRoleHistorySpec struct {
	MemberId string
	Limit    int32
	Offset   int32
}

type MembersSpec struct {
	Filters *MemberFiltersFields
	Sort    *MemberSortInput
	Limit   int32
	Offset  int32
}

type MyAvailabilitySpec struct {
}

type MyPersonalizationSpec struct {
}

type MyRequestsSpec struct {
	Limit  int32
	Offset int32
}

type MyUnlocksSpec struct {
	Limit  int32
	Offset int32
}

type PendingDmProfileVerificationsSpec struct {
	Limit  int32
	Offset int32
}

type UnlockablesCatalogSpec struct {
	ActiveOnly bool
	Limit      int32
	Offset     int32
}

type CreateRequestState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *RequestView
	TargetMemberIDs []string
	ReviewRevision  int64
}

type DecideDmProfileVerificationState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MemberView
	TargetMemberIDs   []string
	ReviewRevision    int64
	Profile           DmProfileView
	LatestReviewEvent *DmProfileReviewEvent
}

type DecideRequestState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *RequestView
	TargetMemberIDs []string
	ReviewRevision  int64
	Parties         notification.RequestParties
	PriorDecision   *RequestDecisionRecord
}

type FollowPersonState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	TargetMemberIDs []string
	ReviewRevision  int64
}

type GrantUnlockState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *MemberView
	TargetMemberIDs []string
	ReviewRevision  int64
	Catalog         UnlockableView
	ExistingGrant   *MemberUnlockView
}

type SetMemberRolesState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *MemberView
	TargetMemberIDs []string
	ReviewRevision  int64
}

type SetMemberRolesBatchState struct {
	TargetMemberIDs []string
	Members         []LockedMemberState
}

type SetMyAvailabilityState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *MemberView
	TargetMemberIDs []string
	ReviewRevision  int64
	Slots           []AvailabilitySlotView
}

type SetUnlockableActiveState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *UnlockableView
	TargetMemberIDs []string
	ReviewRevision  int64
}

type SubmitDmProfileForVerificationState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MemberView
	TargetMemberIDs   []string
	ReviewRevision    int64
	Profile           DmProfileView
	LatestReviewEvent *DmProfileReviewEvent
}

type UnfollowPersonState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	TargetMemberIDs []string
	ReviewRevision  int64
}

type UpdateMyDmProfileState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MemberView
	TargetMemberIDs   []string
	ReviewRevision    int64
	Profile           *DmProfileView
	LatestReviewEvent *DmProfileReviewEvent
}

type UpdateMyProfileState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *MemberView
	TargetMemberIDs []string
	ReviewRevision  int64
}

type UpdateMySettingsState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *MemberView
	TargetMemberIDs []string
	ReviewRevision  int64
	Settings        MemberSettingsView
}

type UpsertUnlockableState struct {
	Exists          bool
	SubjectID       string
	OwnerID         string
	Version         int64
	UpdatedAt       *time.Time
	Before          *UnlockableView
	TargetMemberIDs []string
	ReviewRevision  int64
}

type CreateRequestWrite struct {
	ActorID        string
	At             time.Time
	Input          CreateRequestSpec
	Locked         CreateRequestState
	ValidatedInput CreateRequestSpec
	RequestID      string
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type DecideDmProfileVerificationWrite struct {
	ActorID        string
	At             time.Time
	Input          DecideDmProfileVerificationSpec
	Locked         DecideDmProfileVerificationState
	ValidatedInput DecideDmProfileVerificationSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
	ReviewEvent    DmProfileReviewEvent
}

type DecideRequestWrite struct {
	ActorID        string
	At             time.Time
	Input          DecideRequestSpec
	Locked         DecideRequestState
	ValidatedInput DecideRequestSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type FollowPersonWrite struct {
	ActorID        string
	At             time.Time
	Input          FollowPersonSpec
	Locked         FollowPersonState
	ValidatedInput FollowPersonSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type GrantUnlockWrite struct {
	ActorID        string
	At             time.Time
	Input          GrantUnlockSpec
	Locked         GrantUnlockState
	ValidatedInput GrantUnlockSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetMemberRolesWrite struct {
	ActorID        string
	At             time.Time
	Input          SetMemberRolesSpec
	Locked         SetMemberRolesState
	ValidatedInput SetMemberRolesSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetMemberRolesBatchWrite struct {
	ActorID        string
	At             time.Time
	Input          SetMemberRolesBatchSpec
	Locked         SetMemberRolesBatchState
	ValidatedInput SetMemberRolesBatchSpec
	HistoryIDs     map[string]string
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetMyAvailabilityWrite struct {
	ActorID        string
	At             time.Time
	Input          SetMyAvailabilitySpec
	Locked         SetMyAvailabilityState
	ValidatedInput SetMyAvailabilitySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetUnlockableActiveWrite struct {
	ActorID        string
	At             time.Time
	Input          SetUnlockableActiveSpec
	Locked         SetUnlockableActiveState
	ValidatedInput SetUnlockableActiveSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SubmitDmProfileForVerificationWrite struct {
	ActorID        string
	At             time.Time
	Input          SubmitDmProfileForVerificationSpec
	Locked         SubmitDmProfileForVerificationState
	ValidatedInput SubmitDmProfileForVerificationSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
	ReviewEvent    DmProfileReviewEvent
}

type UnfollowPersonWrite struct {
	ActorID        string
	At             time.Time
	Input          UnfollowPersonSpec
	Locked         UnfollowPersonState
	ValidatedInput UnfollowPersonSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateMyDmProfileWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateMyDmProfileSpec
	Locked         UpdateMyDmProfileState
	ValidatedInput UpdateMyDmProfileSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
	ReviewEvent    DmProfileReviewEvent
}

type UpdateMyProfileWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateMyProfileSpec
	Locked         UpdateMyProfileState
	ValidatedInput UpdateMyProfileSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateMySettingsWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateMySettingsSpec
	Locked         UpdateMySettingsState
	ValidatedInput UpdateMySettingsSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpsertUnlockableWrite struct {
	ActorID        string
	At             time.Time
	Input          UpsertUnlockableSpec
	Locked         UpsertUnlockableState
	ValidatedInput UpsertUnlockableSpec
	UnlockableID   string
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type GrantSnapshot struct {
	PagedGrants    []MemberUnlockView
	AllGrants      []MemberUnlockView
	Catalog        []UnlockableView
	Total          int32
	DriverProgress DriverProgressView
}

type LockedMemberState struct {
	ID        string
	Roles     []string
	Status    string
	Version   int64
	UpdatedAt time.Time
}

type RequestDecisionRecord struct {
	ID         string
	RequestID  string
	Decision   string
	ActorID    string
	RecordedAt time.Time
}

type VoiceChannelList struct {
	Items []ChannelVoiceMinutesView
}

type ActivityEventList struct {
	Items []ActivityEventView
}

type WeekActivityList struct {
	Items []WeekActivityView
}

type MemberVoiceChannelsKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type MemberRecentSessionsKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type MemberRecentWeeksKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type IDKey struct {
	ID string
}

type DmProfileReviewEvent struct {
	ID             string
	MemberID       string
	Revision       int32
	Kind           string
	Snapshot       DmProfileView
	RecordedBy     *string
	RecordedAt     *time.Time
	VerificationID *string
}
