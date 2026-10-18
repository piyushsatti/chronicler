package site

import (
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"time"
)

type AdminDeliveryConfigView struct {
	AnnouncementRoleHealthy *bool
	AnnouncementRoleId      *string
	AnnouncementRoleSource  string
	DeliveryMode            string
	PublicOrigin            string
	PublicOriginHealthy     *bool
}

type AdminDeliveryJobView struct {
	AppliedRevision *int32
	CreatedAt       time.Time
	DesiredRevision *int32
	EventLink       *string
	FailureStreak   int32
	Id              string
	MaxAttempts     int32
	MessageId       *string
	NextAttemptAt   time.Time
	QuestId         *string
	QuestLink       *string
	QuestShortCode  *string
	QuestTitle      *string
	RedriveCount    int32
	SafeError       *string
	State           string
	UpdatedAt       time.Time
}

type AdminHealthAlertView struct {
	FirstSeenAt     *time.Time
	Key             string
	Label           string
	LastSeenAt      *time.Time
	RemediationHref string
	Severity        string
}

type AdminOperationsView struct {
	ActiveAlertCount      int32
	Config                AdminDeliveryConfigView
	Deliveries            []AdminDeliveryJobView
	DeliveryTotal         int32
	PendingDeliveryCount  int32
	ScheduledWork         []ScheduledWorkStatusView
	TerminalDeliveryCount int32
}

type AnnouncementRoleFields struct {
	Enabled bool
	RoleId  *string
}

type CountByKeyView struct {
	Count int32
	Key   string
}

type HomeBannerFields struct {
	Body       *string
	CtaHref    *string
	CtaLabel   *string
	Enabled    bool
	MediaKind  *string
	MediaLabel *string
	MediaUrl   *string
	Title      *string
}

type HomeBannerView struct {
	Body       *string
	CtaHref    *string
	CtaLabel   *string
	Enabled    bool
	MediaKind  *string
	MediaLabel *string
	MediaUrl   *string
	Title      *string
}

type HomeBucketView struct {
	Category  *string
	Documents []document.DocumentView
}

type HomeView struct {
	CommunityStats   SiteStatsView
	RecentByCategory []HomeBucketView
}

type QuestAnnouncementRoleSettingView struct {
	Enabled bool
	RoleId  *string
}

type ScheduledWorkStatusView struct {
	ExpectedSlot   time.Time
	JobId          *string
	Kind           string
	LastFinishedAt *time.Time
	LastStartedAt  *time.Time
	Outcome        string
	SafeErrorCode  *string
}

type SearchKindView struct {
	ExclusionReason *string
	Key             string
	Label           string
	Searchable      bool
}

type SearchResultView struct {
	DocumentOrder string
	DocumentTotal int32
	Documents     []document.DocumentSearchHitView
	MemberOrder   string
	MemberTotal   int32
	Members       []member.MemberSearchHitView
	Query         string
}

type SiteStatsView struct {
	ActiveCharacters             int32
	Activity                     member.ActivitySummaryView
	MembersByRole                []CountByKeyView
	PublishedDocumentsByCategory []CountByKeyView
	PublishedDocumentsByKind     []CountByKeyView
	TotalDms                     int32
	TotalHexes                   int32
	TotalMaps                    int32
	TotalMembers                 int32
	TotalQuests                  int32
	TotalRegions                 int32
}

type RedriveDiscordDeliverySpec struct {
	JobId  string
	Reason string
}

type UpdateHomeBannerSpec struct {
	Input HomeBannerFields
}

type UpdateQuestAnnouncementRoleSettingSpec struct {
	Input AnnouncementRoleFields
}

type AdminOperationsSpec struct {
	DeliveryState *string
	Limit         int32
	Offset        int32
}

type DiscordDeliveryModeSpec struct {
}

type HomeSpec struct {
}

type HomeBannerSpec struct {
}

type QuestAnnouncementRoleSettingSpec struct {
}

type SearchSpec struct {
	Query  string
	Kinds  []string
	Limit  int32
	Offset int32
}

type SearchableKindsSpec struct {
}

type SiteStatsSpec struct {
}

type RedriveDiscordDeliveryState struct {
	Exists    bool
	SubjectID string
	OwnerID   string
	Version   int64
	UpdatedAt *time.Time
	Before    *AdminDeliveryJobView
}

type UpdateHomeBannerState struct {
	Exists    bool
	SubjectID string
	OwnerID   string
	Version   int64
	UpdatedAt *time.Time
	Before    *HomeBannerView
}

type UpdateQuestAnnouncementRoleSettingState struct {
	Exists    bool
	SubjectID string
	OwnerID   string
	Version   int64
	UpdatedAt *time.Time
	Before    *HomeBannerView
}

type RedriveDiscordDeliveryWrite struct {
	ActorID        string
	At             time.Time
	Input          RedriveDiscordDeliverySpec
	Locked         RedriveDiscordDeliveryState
	ValidatedInput RedriveDiscordDeliverySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateHomeBannerWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateHomeBannerSpec
	Locked         UpdateHomeBannerState
	ValidatedInput UpdateHomeBannerSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateQuestAnnouncementRoleSettingWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateQuestAnnouncementRoleSettingSpec
	Locked         UpdateQuestAnnouncementRoleSettingState
	ValidatedInput UpdateQuestAnnouncementRoleSettingSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type ActiveAlertsKey struct {
	Limit  int32
	Offset int32
}

type AlertList struct {
	Items []AdminHealthAlertView
}

type CommunityStatsSnapshot struct {
	TotalMembers     int32
	MembersByRole    []CountByKeyView
	ActiveCharacters int32
	TotalMaps        int32
	TotalHexes       int32
	TotalRegions     int32
	TotalQuests      int32
	TotalDMs         int32
	Activity         member.ActivitySummaryView
}

type MemberDiscoveryPage struct {
	Items []member.MemberSearchHitView
	Total int32
	Order string
}
