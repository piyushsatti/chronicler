package spatial

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPhase3TaskSPA01Acceptance(t *testing.T) {
	t.Run("canonical declarations", func(t *testing.T) {
		registered := []reflect.Type{
			reflect.TypeFor[ArchonAssignmentView](),
			reflect.TypeFor[ArchonPage](),
			reflect.TypeFor[GameCalendarView](),
			reflect.TypeFor[PointcrawlAdmission](),
			reflect.TypeFor[GameDayCellView](),
			reflect.TypeFor[HexChangePage](),
			reflect.TypeFor[HexChangeView](),
			reflect.TypeFor[HexEdgeFields](),
			reflect.TypeFor[HexEdgeView](),
			reflect.TypeFor[HexEditFields](),
			reflect.TypeFor[HexEntryLinkView](),
			reflect.TypeFor[HexView](),
			reflect.TypeFor[MapCreateFields](),
			reflect.TypeFor[MapPlaceView](),
			reflect.TypeFor[MapView](),
			reflect.TypeFor[MapViewView](),
			reflect.TypeFor[PoiFields](),
			reflect.TypeFor[PoiPage](),
			reflect.TypeFor[PoiView](),
			reflect.TypeFor[PointcrawlEdgeFields](),
			reflect.TypeFor[PointcrawlEdgeView](),
			reflect.TypeFor[PointcrawlEntryLinkView](),
			reflect.TypeFor[PointcrawlNodeFields](),
			reflect.TypeFor[PointcrawlNodeView](),
			reflect.TypeFor[RealDatePage](),
			reflect.TypeFor[RegionActivityQuestRefView](),
			reflect.TypeFor[RegionActivityView](),
			reflect.TypeFor[RegionCountsView](),
			reflect.TypeFor[RegionFields](),
			reflect.TypeFor[RegionView](),
			reflect.TypeFor[TimeAnchorFields](),
			reflect.TypeFor[TimeAnchorPage](),
			reflect.TypeFor[TimeAnchorView](),
			reflect.TypeFor[AssignArchonSpec](),
			reflect.TypeFor[CreateMapSpec](),
			reflect.TypeFor[CreateRegionSpec](),
			reflect.TypeFor[CreateTimeAnchorSpec](),
			reflect.TypeFor[DeleteRegionSpec](),
			reflect.TypeFor[LinkHexEntrySpec](),
			reflect.TypeFor[LinkPointcrawlEntrySpec](),
			reflect.TypeFor[RestoreRegionSpec](),
			reflect.TypeFor[RevokeArchonSpec](),
			reflect.TypeFor[SetHexEdgeSpec](),
			reflect.TypeFor[SetPointcrawlEdgeSpec](),
			reflect.TypeFor[TransitionRegionSpec](),
			reflect.TypeFor[UnlinkHexEntrySpec](),
			reflect.TypeFor[UnlinkPointcrawlEntrySpec](),
			reflect.TypeFor[UpdateGameCalendarSpec](),
			reflect.TypeFor[UpdateHexSpec](),
			reflect.TypeFor[UpdateRegionSpec](),
			reflect.TypeFor[UpdateTimeAnchorSpec](),
			reflect.TypeFor[UpsertPoiSpec](),
			reflect.TypeFor[UpsertPointcrawlNodeSpec](),
			reflect.TypeFor[ArchonAssignmentsSpec](),
			reflect.TypeFor[GameCalendarSpec](),
			reflect.TypeFor[GameDateSpec](),
			reflect.TypeFor[HexSpec](),
			reflect.TypeFor[HexHistorySpec](),
			reflect.TypeFor[MapSpec](),
			reflect.TypeFor[MapViewSpec](),
			reflect.TypeFor[MapsSpec](),
			reflect.TypeFor[PoisForHexSpec](),
			reflect.TypeFor[RealDatesSpec](),
			reflect.TypeFor[RecentHexChangesSpec](),
			reflect.TypeFor[RegionActivitySpec](),
			reflect.TypeFor[RegionCountsSpec](),
			reflect.TypeFor[RegionsSpec](),
			reflect.TypeFor[TimeAnchorsSpec](),
			reflect.TypeFor[AssignArchonState](),
			reflect.TypeFor[CreateMapState](),
			reflect.TypeFor[CreateRegionState](),
			reflect.TypeFor[CreateTimeAnchorState](),
			reflect.TypeFor[DeleteRegionState](),
			reflect.TypeFor[LinkHexEntryState](),
			reflect.TypeFor[LinkPointcrawlEntryState](),
			reflect.TypeFor[RestoreRegionState](),
			reflect.TypeFor[RevokeArchonState](),
			reflect.TypeFor[SetHexEdgeState](),
			reflect.TypeFor[SetPointcrawlEdgeState](),
			reflect.TypeFor[TransitionRegionState](),
			reflect.TypeFor[UnlinkHexEntryState](),
			reflect.TypeFor[UnlinkPointcrawlEntryState](),
			reflect.TypeFor[UpdateGameCalendarState](),
			reflect.TypeFor[UpdateHexState](),
			reflect.TypeFor[UpdateRegionState](),
			reflect.TypeFor[UpdateTimeAnchorState](),
			reflect.TypeFor[UpsertPoiState](),
			reflect.TypeFor[UpsertPointcrawlNodeState](),
			reflect.TypeFor[AssignArchonWrite](),
			reflect.TypeFor[CreateMapWrite](),
			reflect.TypeFor[CreateRegionWrite](),
			reflect.TypeFor[CreateTimeAnchorWrite](),
			reflect.TypeFor[DeleteRegionWrite](),
			reflect.TypeFor[LinkHexEntryWrite](),
			reflect.TypeFor[LinkPointcrawlEntryWrite](),
			reflect.TypeFor[RestoreRegionWrite](),
			reflect.TypeFor[RevokeArchonWrite](),
			reflect.TypeFor[SetHexEdgeWrite](),
			reflect.TypeFor[SetPointcrawlEdgeWrite](),
			reflect.TypeFor[TransitionRegionWrite](),
			reflect.TypeFor[UnlinkHexEntryWrite](),
			reflect.TypeFor[UnlinkPointcrawlEntryWrite](),
			reflect.TypeFor[UpdateGameCalendarWrite](),
			reflect.TypeFor[UpdateHexWrite](),
			reflect.TypeFor[UpdateRegionWrite](),
			reflect.TypeFor[UpdateTimeAnchorWrite](),
			reflect.TypeFor[UpsertPoiWrite](),
			reflect.TypeFor[UpsertPointcrawlNodeWrite](),
		}
		types := make(map[string]reflect.Type, len(registered))
		for _, typ := range registered {
			if _, exists := types[typ.Name()]; exists {
				t.Fatalf("duplicate compiled type %s", typ.Name())
			}
			if typ.Kind() != reflect.Struct {
				t.Fatalf("%s must be a struct, got %s", typ.Name(), typ.Kind())
			}
			types[typ.Name()] = typ
		}

		data, err := os.ReadFile("../../docs/design/graphql-product/go-seams.json")
		if err != nil {
			t.Fatal(err)
		}
		type declaration struct {
			Name        string `json:"name"`
			Owner       string `json:"owner"`
			PrimaryTask string `json:"primary_task"`
			Package     string `json:"package"`
			Fields      []struct {
				Name   string `json:"name"`
				GoType string `json:"go_type"`
			} `json:"fields"`
		}
		var sections map[string]json.RawMessage
		if err := json.Unmarshal(data, &sections); err != nil {
			t.Fatal(err)
		}
		contract := make(map[string][]declaration)
		for _, section := range []string{"dto_registry", "specs", "command_states", "command_writes"} {
			var declarations []declaration
			if err := json.Unmarshal(sections[section], &declarations); err != nil {
				t.Fatal(err)
			}
			contract[section] = declarations
		}
		external := map[string]reflect.Type{
			"string":                   reflect.TypeFor[string](),
			"bool":                     reflect.TypeFor[bool](),
			"int32":                    reflect.TypeFor[int32](),
			"int64":                    reflect.TypeFor[int64](),
			"float64":                  reflect.TypeFor[float64](),
			"time.Time":                reflect.TypeFor[time.Time](),
			"json.RawMessage":          reflect.TypeFor[json.RawMessage](),
			"product.Date":             reflect.TypeFor[product.Date](),
			"product.Optional[string]": reflect.TypeFor[product.Optional[string]](),
		}
		var resolve func(string) reflect.Type
		resolve = func(name string) reflect.Type {
			if strings.HasPrefix(name, "*") {
				return reflect.PointerTo(resolve(name[1:]))
			}
			if strings.HasPrefix(name, "[]") {
				return reflect.SliceOf(resolve(name[2:]))
			}
			if typ, ok := external[name]; ok {
				return typ
			}
			if strings.HasPrefix(name, "spatial.") {
				if typ, ok := types[strings.TrimPrefix(name, "spatial.")]; ok {
					return typ
				}
			}
			t.Fatalf("unregistered contract type %q", name)
			return nil
		}
		seen := make(map[string]bool)
		expectedCounts := map[string]int{"dto_registry": 32, "specs": 35, "command_states": 20, "command_writes": 20}
		for section, declarations := range contract {
			count := 0
			for _, declaration := range declarations {
				if declaration.Owner != "SPA01" && declaration.PrimaryTask != "SPA01" {
					continue
				}
				count++
				if declaration.Package != "spatial" {
					t.Fatalf("%s belongs to %s", declaration.Name, declaration.Package)
				}
				if seen[declaration.Name] {
					t.Fatalf("duplicate contract declaration %s", declaration.Name)
				}
				seen[declaration.Name] = true
				typ, ok := types[declaration.Name]
				if !ok {
					t.Errorf("missing compiled declaration %s", declaration.Name)
					continue
				}
				if typ.NumField() != len(declaration.Fields) {
					t.Errorf("%s has %d fields, contract requires %d", declaration.Name, typ.NumField(), len(declaration.Fields))
					continue
				}
				for i, field := range declaration.Fields {
					actual := typ.Field(i)
					if actual.Name != field.Name || actual.Type != resolve(field.GoType) || actual.Anonymous || !actual.IsExported() {
						t.Errorf("%s field %d is %s %s, contract requires %s %s", declaration.Name, i, actual.Name, actual.Type, field.Name, field.GoType)
					}
				}
			}
			if count != expectedCounts[section] {
				t.Errorf("%s owns %d declarations, want %d", section, count, expectedCounts[section])
			}
		}
		additionalTypes := make(map[string]json.RawMessage)
		if err := json.Unmarshal(sections["additional_types"], &additionalTypes); err != nil {
			t.Fatal(err)
		}
		spatialPointcrawlAdmission := make(map[string]string)
		if err := json.Unmarshal(additionalTypes["spatial.PointcrawlAdmission"], &spatialPointcrawlAdmission); err != nil {
			t.Fatalf("decode spatial.PointcrawlAdmission contract: %v", err)
		}
		if len(spatialPointcrawlAdmission) == 0 {
			t.Fatal("spatial.PointcrawlAdmission is missing from additional_types")
		}
		wantPointcrawlAdmission := []struct {
			name string
			typ  string
		}{{"ID", "string"}, {"MapID", "string"}, {"RegionID", "*string"}, {"Role", "string"}, {"AdminOverride", "bool"}}
		if len(spatialPointcrawlAdmission) != len(wantPointcrawlAdmission) {
			t.Fatalf("spatial.PointcrawlAdmission contract has %d fields, want %d", len(spatialPointcrawlAdmission), len(wantPointcrawlAdmission))
		}
		hexAdmissionType := types["PointcrawlAdmission"]
		if hexAdmissionType == nil || hexAdmissionType.NumField() != len(wantPointcrawlAdmission) {
			t.Fatalf("compiled PointcrawlAdmission has %v fields, want %d", hexAdmissionType, len(wantPointcrawlAdmission))
		}
		for i, field := range wantPointcrawlAdmission {
			if spatialPointcrawlAdmission[field.name] != field.typ {
				t.Errorf("additional_types spatial.PointcrawlAdmission.%s = %q, want %q", field.name, spatialPointcrawlAdmission[field.name], field.typ)
			}
			actual := hexAdmissionType.Field(i)
			if actual.Name != field.name || actual.Type != resolve(field.typ) {
				t.Errorf("PointcrawlAdmission field %d is %s %s, contract requires %s %s", i, actual.Name, actual.Type, field.name, field.typ)
			}
		}
		if len(seen) != 107 || len(types) != 108 {
			t.Fatalf("contract=%d compiled=%d declarations, want 107 owned plus one additional type", len(seen), len(types))
		}
		for name := range types {
			if name == "PointcrawlAdmission" {
				continue
			}
			if !seen[name] {
				t.Errorf("compiled declaration %s has no SPA01 contract", name)
			}
		}
		source, err := parser.ParseFile(token.NewFileSet(), "product_types.go", nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		declared := make(map[string]bool)
		ast.Inspect(source, func(node ast.Node) bool {
			if spec, ok := node.(*ast.TypeSpec); ok {
				declared[spec.Name.Name] = true
			}
			return true
		})
		if len(declared) != len(types) {
			t.Errorf("source declares %d types, compiled registry has %d", len(declared), len(types))
		}
		for name := range declared {
			if _, ok := types[name]; !ok {
				t.Errorf("source type %s is absent from compiled registry", name)
			}
		}
	})
	t.Run("hex patch tristate", func(t *testing.T) {
		value := "temperate"
		cases := []struct {
			name    string
			climate product.Optional[string]
		}{
			{name: "omitted"},
			{name: "null", climate: product.Optional[string]{Set: true}},
			{name: "value", climate: product.Optional[string]{Set: true, Value: &value}},
		}
		fingerprints := make(map[string]string)
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				spec := UpdateHexSpec{Id: "hex-1", Input: HexEditFields{Climate: tc.climate, Note: "weather correction"}}
				fingerprint, err := product.Fingerprint(spec)
				if err != nil {
					t.Fatal(err)
				}
				if previous, exists := fingerprints[fingerprint]; exists {
					t.Errorf("%s patch collapses with %s", tc.name, previous)
				}
				fingerprints[fingerprint] = tc.name
			})
		}
	})
}
