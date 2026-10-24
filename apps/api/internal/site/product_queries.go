package site

import (
	"context"
	"reflect"
	"slices"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	OverrideReads auth.OverrideReadObserver
	Discovery     document.DiscoveryReader
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver, discovery document.DiscoveryReader) (*ProductQueries, error) {
	for _, dep := range []any{reads.Site, policy, clock, overrideReads, discovery} {
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
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads, Discovery: discovery}, nil
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
	buckets, err := s.Discovery.RecentDiscovery(ctx, actor)
	if err != nil {
		return HomeView{}, err
	}
	recent := make([]HomeBucketView, len(buckets))
	for i, bucket := range buckets {
		recent[i] = HomeBucketView{Category: bucket.Category, Documents: bucket.Documents}
	}
	return HomeView{CommunityStats: siteStatsFromSnapshot(stats), RecentByCategory: recent}, nil
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

func (s ProductQueries) Search(ctx context.Context, actor auth.Authority, spec SearchSpec) (SearchResultView, error) {
	if err := validateSearchSpec(spec); err != nil {
		return SearchResultView{}, err
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.search")); err != nil {
		return SearchResultView{}, err
	}
	result := SearchResultView{
		Query: spec.Query, Documents: []document.DocumentSearchHitView{}, Members: []member.MemberSearchHitView{},
		DocumentOrder: "rank_desc_updated_at_desc_id_desc", MemberOrder: memberSearchOrder,
	}
	if spec.Kinds == nil || slices.ContainsFunc(spec.Kinds, func(kind string) bool { return kind != "member" }) {
		docs, err := s.Discovery.SearchDiscovery(ctx, actor, spec.Query, spec.Kinds, product.Page{Limit: spec.Limit, Offset: spec.Offset})
		if err != nil {
			return SearchResultView{}, err
		}
		result.Documents, result.DocumentTotal, result.DocumentOrder = docs.Items, docs.Total, docs.Order
	}
	if spec.Kinds == nil || slices.Contains(spec.Kinds, "member") {
		members, err := s.Reads.Site.ReadMemberSearch(ctx, actor, spec)
		if err != nil {
			return SearchResultView{}, err
		}
		result.Members, result.MemberTotal, result.MemberOrder = members.Items, members.Total, members.Order
	}
	return result, nil
}

func validateSearchSpec(spec SearchSpec) error {
	queryLength := utf8.RuneCountInString(spec.Query)
	if queryLength < 1 || queryLength > 200 {
		return apierr.New(apierr.Invalid, "search query must contain 1 to 200 characters")
	}
	if len(spec.Kinds) > 100 {
		return apierr.New(apierr.Invalid, "search kinds cannot exceed 100 items")
	}
	if spec.Limit <= 0 || spec.Offset < 0 {
		return apierr.New(apierr.Invalid, "invalid search page")
	}
	for _, kind := range spec.Kinds {
		if !slices.ContainsFunc(SearchableKinds(), func(candidate SearchKind) bool { return candidate.Key == kind && candidate.Searchable }) {
			return apierr.New(apierr.Invalid, "unknown search kind")
		}
	}
	return nil
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
