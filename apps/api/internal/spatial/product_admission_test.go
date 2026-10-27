package spatial

import (
	"math"
	"strings"
	"testing"
)

func TestPointcrawlInputBoundaries(t *testing.T) {
	input := MapCreateFields{Name: "Atlas", AtlasCode: "atlas", Family: "campaign", Grid: "point", MapKind: "pointcrawl"}
	for _, asset := range []string{"/atlas.webp", "https://example.com/atlas.webp", "/nested/a%20b.webp"} {
		input.AssetPath = &asset
		if err := validateMapCreate(input); err != nil {
			t.Fatalf("valid asset %q: %v", asset, err)
		}
	}
	for _, asset := range []string{"", "javascript:alert(1)", "//example.com/x", "https://user:pass@example.com/x", "/a/../x", "/a/%2e%2e/x", "/a\\x", "http://example.com/x"} {
		input.AssetPath = &asset
		if err := validateMapCreate(input); err == nil {
			t.Fatalf("accepted invalid asset %q", asset)
		}
	}
	if err := validatePointcrawlNode(PointcrawlNodeFields{Name: "Node", X: math.MaxFloat64, Y: -math.MaxFloat64}); err != nil {
		t.Fatal(err)
	}
	for _, coordinate := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		if validatePointcrawlNode(PointcrawlNodeFields{Name: "Node", X: coordinate}) == nil || validatePointcrawlNode(PointcrawlNodeFields{Name: "Node", Y: coordinate}) == nil {
			t.Fatalf("accepted nonfinite coordinate %v", coordinate)
		}
	}
}

func TestPointcrawlContainmentCycle(t *testing.T) {
	edges := []ContainmentEdge{{"a", "b"}, {"b", "c"}, {"b", "d"}}
	for _, pair := range [][2]string{{"a", "a"}, {"c", "a"}, {"d", "a"}} {
		if !containmentCycle(edges, pair[0], pair[1]) {
			t.Fatalf("accepted cycle %v", pair)
		}
	}
	for _, pair := range [][2]string{{"a", "d"}, {"c", "d"}, {"e", "a"}} {
		if containmentCycle(edges, pair[0], pair[1]) {
			t.Fatalf("rejected acyclic edge %v", pair)
		}
	}
}

func TestPointcrawlNameAndCodeRuneBoundaries(t *testing.T) {
	for _, size := range []int{200, 201} {
		name := strings.Repeat("界", size)
		input := MapCreateFields{Name: name, AtlasCode: "atlas", Family: "campaign", Grid: "point", MapKind: "pointcrawl"}
		if got := validateMapCreate(input) == nil; got != (size == 200) {
			t.Fatalf("map name runes=%d accepted=%v", size, got)
		}
		if got := validatePointcrawlNode(PointcrawlNodeFields{Name: name}) == nil; got != (size == 200) {
			t.Fatalf("node name runes=%d accepted=%v", size, got)
		}
	}
	for _, size := range []int{64, 65} {
		input := MapCreateFields{Name: "Atlas", AtlasCode: strings.Repeat("界", size), Family: "campaign", Grid: "point", MapKind: "pointcrawl"}
		if got := validateMapCreate(input) == nil; got != (size == 64) {
			t.Fatalf("atlas code runes=%d accepted=%v", size, got)
		}
	}
}

func TestMapGridAndUpdateValidation(t *testing.T) {
	create := MapCreateFields{Name: "Atlas", AtlasCode: "atlas", Family: "campaign", MapKind: "pointcrawl"}
	for _, grid := range []string{"point", "hex"} {
		create.Grid = grid
		if err := validateMapCreate(create); err != nil {
			t.Fatalf("grid %q rejected: %v", grid, err)
		}
	}
	for _, grid := range []string{"", "square", "HEX"} {
		create.Grid = grid
		if validateMapCreate(create) == nil {
			t.Fatalf("grid %q accepted", grid)
		}
	}
	asset := "/maps/atlas.png"
	update := MapUpdateFields{Name: "Renamed", Family: "campaign", Grid: "hex", AssetPath: &asset}
	if err := validateMapUpdate(update); err != nil {
		t.Fatalf("valid update rejected: %v", err)
	}
	for name, bad := range map[string]MapUpdateFields{
		"blank name":   {Name: " ", Family: "campaign", Grid: "point"},
		"long name":    {Name: strings.Repeat("a", 201), Family: "campaign", Grid: "point"},
		"blank family": {Name: "Atlas", Family: "", Grid: "point"},
		"bad grid":     {Name: "Atlas", Family: "campaign", Grid: "square"},
		"bad asset":    {Name: "Atlas", Family: "campaign", Grid: "point", AssetPath: func() *string { v := "/a/../x"; return &v }()},
	} {
		if validateMapUpdate(bad) == nil {
			t.Fatalf("%s accepted", name)
		}
	}
}
