//go:build integration

package spatial

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"

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

type capabilityAssignmentCounter struct {
	dbgen.DBTX
	lookups int
}

func (d *capabilityAssignmentCounter) count(query string) {
	if strings.Contains(query, "archon_assignments") {
		d.lookups++
	}
}

func (d *capabilityAssignmentCounter) Query(ctx context.Context, query string, args ...any) (pgx.Rows, error) {
	d.count(query)
	return d.DBTX.Query(ctx, query, args...)
}

func (d *capabilityAssignmentCounter) QueryRow(ctx context.Context, query string, args ...any) pgx.Row {
	d.count(query)
	return d.DBTX.QueryRow(ctx, query, args...)
}

func TestRegionAndMapCapabilitiesBatchAssignmentsThroughNewPoolPolicy(t *testing.T) {
	f, ctx, _, resolve := pointcrawlFixture(t)
	for i, region := range []string{mapNorth, mapNorth, mapSouth} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO maps(name,atlas_code,map_kind,region_id)
			SELECT 'Batch map',$1,'pointcrawl',id FROM regions WHERE public_id=$2::uuid`, fmt.Sprintf("BATCH-%d", i), region); err != nil {
			t.Fatal(err)
		}
	}
	counter := &capabilityAssignmentCounter{DBTX: f.Pool}
	reader, err := NewProductPostgres(counter)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPoolPolicy(counter)
	if err != nil {
		t.Fatal(err)
	}
	queries := ProductQueries{Reads: ProductReadRepos{Region: reader, Map: reader}, Policy: policy}
	for _, id := range []string{mapArchon, mapPlayer, mapAdmin} {
		actor, err := resolve(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		counter.lookups = 0
		regions, err := queries.Regions(ctx, actor, RegionsSpec{Limit: 50})
		if err != nil || len(regions) != 2 || counter.lookups != 1 {
			t.Fatalf("actor=%s regions=%+v assignment lookups=%d, want one: %v", id, regions, counter.lookups, err)
		}
		for _, region := range regions {
			want := id == mapAdmin || id == mapArchon && region.Id == mapNorth
			if region.CanCreateMap != want {
				t.Fatalf("actor=%s region=%+v, want capability=%v", id, region, want)
			}
		}
		counter.lookups = 0
		maps, err := queries.Maps(ctx, actor, MapsSpec{Limit: 50})
		if err != nil || len(maps) != 3 || counter.lookups != 1 {
			t.Fatalf("actor=%s maps=%+v assignment lookups=%d, want one: %v", id, maps, counter.lookups, err)
		}
		for _, view := range maps {
			want := id == mapAdmin || id == mapArchon && *view.RegionId == mapNorth
			if view.CanEdit != want {
				t.Fatalf("actor=%s map=%+v, want capability=%v", id, view, want)
			}
		}
	}
	if _, err := f.Pool.Exec(ctx, `DELETE FROM archon_assignments WHERE member_id=(SELECT id FROM members WHERE public_id=$1::uuid)`, mapArchon); err != nil {
		t.Fatal(err)
	}
	archon, _ := resolve(ctx, mapArchon)
	maps, err := queries.Maps(ctx, archon, MapsSpec{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, view := range maps {
		if view.CanEdit {
			t.Fatal("list-local snapshot survived assignment revocation")
		}
	}
}
