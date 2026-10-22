package site

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type stubDiscovery struct {
	buckets []document.DiscoveryBucket
	err     error
}

func (s stubDiscovery) SearchDiscovery(context.Context, auth.Authority, string, []string, product.Page) (document.DiscoveryPage, error) {
	return document.DiscoveryPage{}, nil
}
func (s stubDiscovery) RecentDiscovery(context.Context, auth.Authority) ([]document.DiscoveryBucket, error) {
	return s.buckets, s.err
}
func (s stubDiscovery) CountDiscovery(context.Context, auth.Authority) (document.DiscoveryCounts, error) {
	return document.DiscoveryCounts{}, nil
}

func TestHomeFillsRecentByCategoryFromDiscovery(t *testing.T) {
	cat := "lore"
	docs := []document.DocumentView{{Id: "11111111-1111-1111-1111-111111111111", Title: "Tower"}}
	discovery := stubDiscovery{buckets: []document.DiscoveryBucket{{
		Category:  &cat,
		Documents: docs,
	}}}
	home := HomeView{
		CommunityStats:   siteStatsFromSnapshot(CommunityStatsSnapshot{TotalMembers: 3}),
		RecentByCategory: []HomeBucketView{{Category: discovery.buckets[0].Category, Documents: discovery.buckets[0].Documents}},
	}
	if len(home.RecentByCategory) != 1 || home.RecentByCategory[0].Category == nil || *home.RecentByCategory[0].Category != "lore" {
		t.Fatalf("home buckets=%+v", home.RecentByCategory)
	}
	if home.CommunityStats.TotalMembers != 3 {
		t.Fatalf("stats=%+v", home.CommunityStats)
	}
	if len(home.RecentByCategory[0].Documents) != 1 || home.RecentByCategory[0].Documents[0].Title != "Tower" {
		t.Fatalf("documents=%+v", home.RecentByCategory[0].Documents)
	}
}

func TestMapActiveAlertsProjectsJobAndSkipsEmptyPage(t *testing.T) {
	got, err := mapActiveAlerts([]dbgen.SiteActiveAlertsRow{{Total: 0}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 0 {
		t.Fatalf("empty page items=%d", len(got.Items))
	}

	first := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	last := time.Date(2026, 10, 5, 13, 0, 0, 0, time.UTC)
	got, err = mapActiveAlerts([]dbgen.SiteActiveAlertsRow{{
		Total:           2,
		Key:             pgtype.Text{String: "job:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:state:dead", Valid: true},
		Label:           pgtype.Text{String: "Background job is dead", Valid: true},
		Severity:        pgtype.Text{String: "warning", Valid: true},
		RemediationHref: pgtype.Text{String: "/admin/data-health", Valid: true},
		FirstSeenAt:     pgtype.Timestamptz{Time: first, Valid: true},
		LastSeenAt:      pgtype.Timestamptz{Time: last, Valid: true},
	}, {
		Total:           2,
		Key:             pgtype.Text{String: "bot:heartbeat:stale", Valid: true},
		Label:           pgtype.Text{String: "Bot heartbeat is stale", Valid: true},
		Severity:        pgtype.Text{String: "warning", Valid: true},
		RemediationHref: pgtype.Text{String: "/admin/data-health", Valid: true},
		FirstSeenAt:     pgtype.Timestamptz{Time: first, Valid: true},
		LastSeenAt:      pgtype.Timestamptz{Time: last, Valid: true},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 2 || got.Items[0].Key == "" || got.Items[0].Severity != "warning" {
		t.Fatalf("got=%+v", got.Items)
	}
	if got.Items[0].FirstSeenAt == nil || !got.Items[0].FirstSeenAt.Equal(first) {
		t.Fatalf("firstSeen=%v", got.Items[0].FirstSeenAt)
	}
	for _, alert := range got.Items {
		if alert.RemediationHref != "/admin/data-health" {
			t.Fatalf("alert %s destination=%q", alert.Key, alert.RemediationHref)
		}
	}
}
