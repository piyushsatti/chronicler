//go:build integration

package spatial

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestFrontendRegionMapCreationCapability(t *testing.T) {
	f, ctx, _, resolve := pointcrawlFixture(t)
	archon, _ := resolve(ctx, mapArchon)
	admin, _ := resolve(ctx, mapAdmin)
	player, _ := resolve(ctx, mapPlayer)
	reader, _ := NewProductPostgres(f.Pool)
	policy, _ := auth.NewPoolPolicy(f.Pool)
	queries := ProductQueries{Reads: ProductReadRepos{Region: reader}, Policy: policy}
	for _, item := range []struct {
		name         string
		actor        auth.Authority
		north, south bool
	}{
		{"guest", auth.Authority{}, false, false}, {"assigned archon", archon, true, false}, {"player", player, false, false}, {"admin", admin, true, true},
	} {
		t.Run(item.name, func(t *testing.T) {
			regions, err := queries.Regions(ctx, item.actor, RegionsSpec{Limit: 50})
			if err != nil {
				t.Fatal(err)
			}
			if len(regions) != 2 {
				t.Fatalf("regions=%d", len(regions))
			}
			for _, view := range regions {
				want := item.south
				if view.Id == mapNorth {
					want = item.north
				}
				if view.CanCreateMap != want {
					t.Fatalf("region=%s creation=%v want=%v", view.Id, view.CanCreateMap, want)
				}
				commandView := RegionView{Id: view.Id}
				if err := projectSpatialCommandResult(ctx, ProductCommandRepos{Policy: policy}, item.actor, &commandView); err != nil || commandView.CanCreateMap != want {
					t.Fatalf("command result=%+v err=%v", commandView, err)
				}
			}
		})
	}
	if _, err := f.Pool.Exec(ctx, `DELETE FROM archon_assignments WHERE member_id=(SELECT id FROM members WHERE public_id=$1)`, mapArchon); err != nil {
		t.Fatal(err)
	}
	regions, err := queries.Regions(ctx, archon, RegionsSpec{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, view := range regions {
		if view.CanCreateMap {
			t.Fatal("revoked assignment still grants map creation")
		}
	}
	if _, err := queries.ArchonAssignments(ctx, archon, ArchonAssignmentsSpec{MemberId: ptrRegionCapability(mapArchon), Limit: 50}); err == nil {
		t.Fatal("capability projection broadened assignment visibility")
	}
}
func ptrRegionCapability(value string) *string { return &value }
