package site

import (
	"context"
	"reflect"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	OverrideReads auth.OverrideReadObserver
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver) (*ProductQueries, error) {
	for _, dep := range []any{reads.Site, policy, clock, overrideReads} {
		if dep == nil {
			return nil, apierr.New(apierr.Internal, "site query dependencies required")
		}
		v := reflect.ValueOf(dep)
		switch v.Kind() {
		case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
			if v.IsNil() {
				return nil, apierr.New(apierr.Internal, "site query dependencies required")
			}
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads}, nil
}

func (s ProductQueries) admit(ctx context.Context, actor auth.Authority, operation auth.Operation) error {
	request, err := auth.ForOperation(operation)
	if err != nil {
		return err
	}
	decision, err := s.Policy.Decide(ctx, actor, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "site read forbidden")
	}
	return nil
}

func (s ProductQueries) Home(ctx context.Context, actor auth.Authority, spec HomeSpec) (HomeView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.home")); err != nil {
		return HomeView{}, err
	}
	stats, err := s.Reads.Site.ReadHomeCommunity(ctx, actor, spec)
	if err != nil {
		return HomeView{}, err
	}
	return HomeView{CommunityStats: siteStatsFromSnapshot(stats)}, nil
}

func siteStatsFromSnapshot(snapshot CommunityStatsSnapshot) SiteStatsView {
	return SiteStatsView{
		TotalMembers:     snapshot.TotalMembers,
		MembersByRole:    snapshot.MembersByRole,
		ActiveCharacters: snapshot.ActiveCharacters,
		TotalMaps:        snapshot.TotalMaps,
		TotalRegions:     snapshot.TotalRegions,
		TotalQuests:      snapshot.TotalQuests,
		TotalDms:         snapshot.TotalDMs,
		Activity:         snapshot.Activity,
	}
}

func (s ProductQueries) SiteStats(ctx context.Context, actor auth.Authority, spec SiteStatsSpec) (CommunityStatsSnapshot, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.siteStats")); err != nil {
		return CommunityStatsSnapshot{}, err
	}
	return s.Reads.Site.ReadSiteStats(ctx, actor, spec)
}

func (s ProductQueries) Search(ctx context.Context, actor auth.Authority, spec SearchSpec) (MemberDiscoveryPage, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.search")); err != nil {
		return MemberDiscoveryPage{}, err
	}
	return s.Reads.Site.ReadMemberSearch(ctx, actor, spec)
}

func (s ProductQueries) BatchActiveAlerts(ctx context.Context, actor auth.Authority, keys []ActiveAlertsKey) ([]product.BatchResult[AlertList], error) {
	if s.Reads.Batch == nil {
		return nil, apierr.New(apierr.Internal, "site batch reads unavailable")
	}
	return s.Reads.Batch.ReadBatchActiveAlerts(ctx, actor, keys)
}

func (s ProductQueries) SearchableKinds(ctx context.Context, actor auth.Authority, spec SearchableKindsSpec) ([]SearchKindView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.searchableKinds")); err != nil {
		return nil, err
	}
	return s.Reads.Site.ReadSearchableKinds(ctx, actor, spec)
}

func (s ProductQueries) HomeBanner(ctx context.Context, actor auth.Authority, spec HomeBannerSpec) (HomeBannerView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.homeBanner")); err != nil {
		return HomeBannerView{}, err
	}
	return s.Reads.Site.ReadHomeBanner(ctx, actor, spec)
}

func (s ProductQueries) QuestAnnouncementRoleSetting(ctx context.Context, actor auth.Authority, spec QuestAnnouncementRoleSettingSpec) (QuestAnnouncementRoleSettingView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.questAnnouncementRoleSetting")); err != nil {
		return QuestAnnouncementRoleSettingView{}, err
	}
	return s.Reads.Site.ReadQuestAnnouncementRoleSetting(ctx, actor, spec)
}

func (s ProductQueries) DiscordDeliveryMode(ctx context.Context, actor auth.Authority, spec DiscordDeliveryModeSpec) (string, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.discordDeliveryMode")); err != nil {
		return "", err
	}
	if s.Reads.Operations == nil {
		return "", apierr.New(apierr.Internal, "site operations reads unavailable")
	}
	return s.Reads.Operations.ReadDiscordDeliveryMode(ctx, actor, spec)
}

func (s ProductQueries) AdminOperations(ctx context.Context, actor auth.Authority, spec AdminOperationsSpec) (AdminOperationsView, error) {
	if spec.Limit <= 0 || spec.Offset < 0 {
		return AdminOperationsView{}, apierr.New(apierr.Invalid, "invalid admin operations page")
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.adminOperations")); err != nil {
		return AdminOperationsView{}, err
	}
	if s.Reads.Operations == nil {
		return AdminOperationsView{}, apierr.New(apierr.Internal, "site operations reads unavailable")
	}
	return s.Reads.Operations.ReadAdminOperations(ctx, actor, spec)
}
