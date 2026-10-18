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
		TotalHexes:       snapshot.TotalHexes,
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
