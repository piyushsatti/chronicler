package site

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

type OperationsReadRepository interface {
	ReadAdminOperations(ctx context.Context, actor auth.Authority, spec AdminOperationsSpec) (AdminOperationsView, error)
	ReadDiscordDeliveryMode(ctx context.Context, actor auth.Authority, spec DiscordDeliveryModeSpec) (string, error)
}

type OperationsWriteRepository interface {
	LockRedriveDiscordDelivery(ctx context.Context, spec RedriveDiscordDeliverySpec) (RedriveDiscordDeliveryState, error)
	StoreRedriveDiscordDelivery(ctx context.Context, write RedriveDiscordDeliveryWrite) (quest.DeliveryReceipt, error)
}

type ProductBatchRepository interface {
	ReadBatchActiveAlerts(ctx context.Context, actor auth.Authority, keys []ActiveAlertsKey) ([]product.BatchResult[AlertList], error)
}

type SiteReadRepository interface {
	ReadHomeCommunity(ctx context.Context, actor auth.Authority, spec HomeSpec) (CommunityStatsSnapshot, error)
	ReadHomeBanner(ctx context.Context, actor auth.Authority, spec HomeBannerSpec) (HomeBannerView, error)
	ReadQuestAnnouncementRoleSetting(ctx context.Context, actor auth.Authority, spec QuestAnnouncementRoleSettingSpec) (QuestAnnouncementRoleSettingView, error)
	ReadMemberSearch(ctx context.Context, actor auth.Authority, spec SearchSpec) (MemberDiscoveryPage, error)
	ReadSearchableKinds(ctx context.Context, actor auth.Authority, spec SearchableKindsSpec) ([]SearchKindView, error)
	ReadSiteStats(ctx context.Context, actor auth.Authority, spec SiteStatsSpec) (CommunityStatsSnapshot, error)
}

type SiteWriteRepository interface {
	LockUpdateHomeBanner(ctx context.Context, spec UpdateHomeBannerSpec) (UpdateHomeBannerState, error)
	StoreUpdateHomeBanner(ctx context.Context, write UpdateHomeBannerWrite) (HomeBannerView, error)
	LockUpdateQuestAnnouncementRoleSetting(ctx context.Context, spec UpdateQuestAnnouncementRoleSettingSpec) (UpdateQuestAnnouncementRoleSettingState, error)
	StoreUpdateQuestAnnouncementRoleSetting(ctx context.Context, write UpdateQuestAnnouncementRoleSettingWrite) (QuestAnnouncementRoleSettingView, error)
}

type ProductReadRepos struct {
	Operations OperationsReadRepository
	Site       SiteReadRepository
	Batch      ProductBatchRepository
}

type ProductCommandRepos struct {
	Operations OperationsWriteRepository
	Site       SiteWriteRepository
	Policy     *auth.Policy
	Authority  auth.AuthorityResolver
	Replay     idempotency.Repository
	Producer   notification.EventProducer
	Notice     notification.ProducerRepos
	Audit      auth.OverrideRecorder
}
