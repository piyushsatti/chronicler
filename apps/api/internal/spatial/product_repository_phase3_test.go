package spatial

import (
	"bytes"
	"context"
	"encoding/json"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPhase3TaskSPA02Acceptance(t *testing.T) {
	var contract struct {
		Repositories []struct {
			Name    string   `json:"name"`
			Methods []string `json:"methods"`
			Owner   string   `json:"owner"`
		} `json:"repository_interfaces"`
		Seams []struct {
			Interface string `json:"interface"`
			Signature string `json:"signature"`
		} `json:"provider_caller_seams"`
		Additional map[string]json.RawMessage `json:"additional_types"`
	}
	data, err := os.ReadFile("../../docs/design/graphql-product/go-seams.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}

	registered := []reflect.Type{
		reflect.TypeFor[ArchonAssignmentView](),
		reflect.TypeFor[ArchonAssignmentsSpec](),
		reflect.TypeFor[ArchonPage](),
		reflect.TypeFor[AssignArchonSpec](),
		reflect.TypeFor[AssignArchonState](),
		reflect.TypeFor[AssignArchonWrite](),
		reflect.TypeFor[ContainmentEdge](),
		reflect.TypeFor[ContainmentWriter](),
		reflect.TypeFor[CreateMapSpec](),
		reflect.TypeFor[CreateMapState](),
		reflect.TypeFor[CreateMapWrite](),
		reflect.TypeFor[CreateRegionSpec](),
		reflect.TypeFor[CreateRegionState](),
		reflect.TypeFor[CreateRegionWrite](),
		reflect.TypeFor[CreateTimeAnchorSpec](),
		reflect.TypeFor[CreateTimeAnchorState](),
		reflect.TypeFor[CreateTimeAnchorWrite](),
		reflect.TypeFor[DeleteRegionSpec](),
		reflect.TypeFor[DeleteRegionState](),
		reflect.TypeFor[DeleteRegionWrite](),
		reflect.TypeFor[EdgeList](),
		reflect.TypeFor[GameCalendarSpec](),
		reflect.TypeFor[GameCalendarView](),
		reflect.TypeFor[GameDateSpec](),
		reflect.TypeFor[GameDayCellView](),
		reflect.TypeFor[HexChangePage](),
		reflect.TypeFor[HexEdgeView](),
		reflect.TypeFor[HexEntryLinkView](),
		reflect.TypeFor[HexHistorySpec](),
		reflect.TypeFor[HexLinkList](),
		reflect.TypeFor[HexLinksKey](),
		reflect.TypeFor[HexList](),
		reflect.TypeFor[HexSpec](),
		reflect.TypeFor[HexView](),
		reflect.TypeFor[HexAdmission](),
		reflect.TypeFor[QuestHexCandidate](),
		reflect.TypeFor[LinkHexEntrySpec](),
		reflect.TypeFor[LinkHexEntryState](),
		reflect.TypeFor[LinkHexEntryWrite](),
		reflect.TypeFor[LinkPointcrawlEntrySpec](),
		reflect.TypeFor[LinkPointcrawlEntryState](),
		reflect.TypeFor[LinkPointcrawlEntryWrite](),
		reflect.TypeFor[MapEdgesKey](),
		reflect.TypeFor[MapHexesKey](),
		reflect.TypeFor[MapNodeEdgesKey](),
		reflect.TypeFor[MapNodesKey](),
		reflect.TypeFor[MapReadRepository](),
		reflect.TypeFor[MapSpec](),
		reflect.TypeFor[MapView](),
		reflect.TypeFor[MapViewSpec](),
		reflect.TypeFor[MapViewView](),
		reflect.TypeFor[MapWriteRepository](),
		reflect.TypeFor[PlaceReader](),
		reflect.TypeFor[MapsSpec](),
		reflect.TypeFor[NodeEdgeList](),
		reflect.TypeFor[NodeLinkList](),
		reflect.TypeFor[NodeLinksKey](),
		reflect.TypeFor[NodeList](),
		reflect.TypeFor[POIsKey](),
		reflect.TypeFor[PoiList](),
		reflect.TypeFor[PoiPage](),
		reflect.TypeFor[PoiView](),
		reflect.TypeFor[PointcrawlEdgeView](),
		reflect.TypeFor[PointcrawlEntryLinkView](),
		reflect.TypeFor[PointcrawlNodeView](),
		reflect.TypeFor[PoisForHexSpec](),
		reflect.TypeFor[ProductBatchRepository](),
		reflect.TypeFor[ProductCommandRepos](),
		reflect.TypeFor[ProductReadRepos](),
		reflect.TypeFor[RealDatePage](),
		reflect.TypeFor[RealDatesSpec](),
		reflect.TypeFor[RecentHexChangesSpec](),
		reflect.TypeFor[RegionActivitySpec](),
		reflect.TypeFor[RegionActivityView](),
		reflect.TypeFor[RegionCountsSpec](),
		reflect.TypeFor[RegionCountsView](),
		reflect.TypeFor[RegionReadRepository](),
		reflect.TypeFor[RegionView](),
		reflect.TypeFor[RegionWriteRepository](),
		reflect.TypeFor[RegionsSpec](),
		reflect.TypeFor[RestoreRegionSpec](),
		reflect.TypeFor[RestoreRegionState](),
		reflect.TypeFor[RestoreRegionWrite](),
		reflect.TypeFor[RevokeArchonSpec](),
		reflect.TypeFor[RevokeArchonState](),
		reflect.TypeFor[RevokeArchonWrite](),
		reflect.TypeFor[SetHexEdgeSpec](),
		reflect.TypeFor[SetHexEdgeState](),
		reflect.TypeFor[SetHexEdgeWrite](),
		reflect.TypeFor[SetPointcrawlEdgeSpec](),
		reflect.TypeFor[SetPointcrawlEdgeState](),
		reflect.TypeFor[SetPointcrawlEdgeWrite](),
		reflect.TypeFor[TimeAnchorPage](),
		reflect.TypeFor[TimeAnchorView](),
		reflect.TypeFor[TimeAnchorsSpec](),
		reflect.TypeFor[TimeBatchReadRepository](),
		reflect.TypeFor[TimeCalendarSnapshot](),
		reflect.TypeFor[TimeDateSnapshot](),
		reflect.TypeFor[TimeReadRepository](),
		reflect.TypeFor[TimeWriteRepository](),
		reflect.TypeFor[TransitionRegionSpec](),
		reflect.TypeFor[TransitionRegionState](),
		reflect.TypeFor[TransitionRegionWrite](),
		reflect.TypeFor[UnlinkHexEntrySpec](),
		reflect.TypeFor[UnlinkHexEntryState](),
		reflect.TypeFor[UnlinkHexEntryWrite](),
		reflect.TypeFor[UnlinkPointcrawlEntrySpec](),
		reflect.TypeFor[UnlinkPointcrawlEntryState](),
		reflect.TypeFor[UnlinkPointcrawlEntryWrite](),
		reflect.TypeFor[UpdateGameCalendarSpec](),
		reflect.TypeFor[UpdateGameCalendarState](),
		reflect.TypeFor[UpdateGameCalendarWrite](),
		reflect.TypeFor[UpdateHexSpec](),
		reflect.TypeFor[UpdateHexState](),
		reflect.TypeFor[UpdateHexWrite](),
		reflect.TypeFor[UpdateRegionSpec](),
		reflect.TypeFor[UpdateRegionState](),
		reflect.TypeFor[UpdateRegionWrite](),
		reflect.TypeFor[UpdateTimeAnchorSpec](),
		reflect.TypeFor[UpdateTimeAnchorState](),
		reflect.TypeFor[UpdateTimeAnchorWrite](),
		reflect.TypeFor[UpsertPoiSpec](),
		reflect.TypeFor[UpsertPoiState](),
		reflect.TypeFor[UpsertPoiWrite](),
		reflect.TypeFor[UpsertPointcrawlNodeSpec](),
		reflect.TypeFor[UpsertPointcrawlNodeState](),
		reflect.TypeFor[UpsertPointcrawlNodeWrite](),
	}
	types := map[string]reflect.Type{
		"string":                                        reflect.TypeFor[string](),
		"bool":                                          reflect.TypeFor[bool](),
		"int32":                                         reflect.TypeFor[int32](),
		"error":                                         reflect.TypeFor[error](),
		"context.Context":                               reflect.TypeFor[context.Context](),
		"json.RawMessage":                               reflect.TypeFor[json.RawMessage](),
		"auth.Authority":                                reflect.TypeFor[auth.Authority](),
		"auth.Policy":                                   reflect.TypeFor[auth.Policy](),
		"auth.AuthorityResolver":                        reflect.TypeFor[auth.AuthorityResolver](),
		"auth.OverrideRecorder":                         reflect.TypeFor[auth.OverrideRecorder](),
		"idempotency.Repository":                        reflect.TypeFor[idempotency.Repository](),
		"notification.EventProducer":                    reflect.TypeFor[notification.EventProducer](),
		"notification.ProducerRepos":                    reflect.TypeFor[notification.ProducerRepos](),
		"product.CommandReceipt":                        reflect.TypeFor[product.CommandReceipt](),
		"product.Date":                                  reflect.TypeFor[product.Date](),
		"document.ReferenceAudienceReader":              reflect.TypeFor[document.ReferenceAudienceReader](),
		"document.LocationAdmissionReader":              reflect.TypeFor[document.LocationAdmissionReader](),
		"product.BatchResult[spatial.EdgeList]":         reflect.TypeFor[product.BatchResult[EdgeList]](),
		"product.BatchResult[spatial.HexLinkList]":      reflect.TypeFor[product.BatchResult[HexLinkList]](),
		"product.BatchResult[spatial.HexList]":          reflect.TypeFor[product.BatchResult[HexList]](),
		"product.BatchResult[spatial.NodeEdgeList]":     reflect.TypeFor[product.BatchResult[NodeEdgeList]](),
		"product.BatchResult[spatial.NodeLinkList]":     reflect.TypeFor[product.BatchResult[NodeLinkList]](),
		"product.BatchResult[spatial.NodeList]":         reflect.TypeFor[product.BatchResult[NodeList]](),
		"product.BatchResult[spatial.PoiList]":          reflect.TypeFor[product.BatchResult[PoiList]](),
		"product.BatchResult[spatial.TimeDateSnapshot]": reflect.TypeFor[product.BatchResult[TimeDateSnapshot]](),
	}
	for _, typ := range registered {
		name := "spatial." + typ.Name()
		if _, exists := types[name]; exists {
			t.Fatalf("duplicate compiled type %s", name)
		}
		types[name] = typ
	}
	var resolve func(*testing.T, ast.Expr) reflect.Type
	resolve = func(t *testing.T, expr ast.Expr) reflect.Type {
		t.Helper()
		switch expr := expr.(type) {
		case *ast.StarExpr:
			return reflect.PointerTo(resolve(t, expr.X))
		case *ast.ArrayType:
			if expr.Len != nil {
				t.Fatal("contract unexpectedly contains an array")
			}
			return reflect.SliceOf(resolve(t, expr.Elt))
		case *ast.MapType:
			return reflect.MapOf(resolve(t, expr.Key), resolve(t, expr.Value))
		}
		var buf bytes.Buffer
		if err := format.Node(&buf, token.NewFileSet(), expr); err != nil {
			t.Fatal(err)
		}
		if typ, ok := types[buf.String()]; ok {
			return typ
		}
		t.Fatalf("unregistered canonical type %s", &buf)
		return nil
	}
	resolveFields := func(t *testing.T, fields *ast.FieldList) []reflect.Type {
		t.Helper()
		var result []reflect.Type
		if fields != nil {
			for _, field := range fields.List {
				count := len(field.Names)
				if count == 0 {
					count = 1
				}
				for range count {
					result = append(result, resolve(t, field.Type))
				}
			}
		}
		return result
	}

	t.Run("compiled interface methods", func(t *testing.T) {
		ports := []struct {
			name        string
			indices     []int
			cross       bool
			methodCount int
		}{
			{"MapReadRepository", []int{28}, false, 7},
			{"MapWriteRepository", []int{29}, false, 20},
			{"ProductBatchRepository", []int{30}, false, 7},
			{"RegionReadRepository", []int{31}, false, 4},
			{"RegionWriteRepository", []int{32}, false, 14},
			{"TimeReadRepository", []int{33}, false, 4},
			{"TimeWriteRepository", []int{34}, false, 6},
			{"TimeBatchReadRepository", []int{259}, true, 1},
			{"ContainmentWriter", []int{409, 410}, true, 2},
			{"PlaceReader", []int{273}, true, 1},
		}
		total := 0
		for _, port := range ports {
			t.Run(port.name, func(t *testing.T) {
				canonicalName := "spatial." + port.name
				var signatures []string
				if port.cross {
					for _, index := range port.indices {
						if index >= len(contract.Seams) || contract.Seams[index].Interface != canonicalName {
							t.Fatalf("provider_caller_seams/%d does not identify %s", index, canonicalName)
						}
						signatures = append(signatures, contract.Seams[index].Signature)
					}
				} else {
					index := port.indices[0]
					if index >= len(contract.Repositories) {
						t.Fatalf("missing repository_interfaces/%d", index)
					}
					decl := contract.Repositories[index]
					if decl.Name != canonicalName || decl.Owner != "SPA02" {
						t.Fatalf("repository_interfaces/%d is not SPA02 %s", index, canonicalName)
					}
					signatures = decl.Methods
				}
				typ := types[canonicalName]
				if typ.Kind() != reflect.Interface || typ.Name() != port.name || typ.PkgPath() != reflect.TypeFor[MapView]().PkgPath() {
					t.Fatalf("%s must be a named spatial interface", canonicalName)
				}
				if len(signatures) != port.methodCount || typ.NumMethod() != port.methodCount {
					t.Fatalf("%s canonical=%d compiled=%d methods, want %d", canonicalName, len(signatures), typ.NumMethod(), port.methodCount)
				}
				seen := make(map[string]bool)
				for _, signature := range signatures {
					expr, err := parser.ParseExpr("interface { " + signature + " }")
					if err != nil {
						t.Fatal(err)
					}
					fields := expr.(*ast.InterfaceType).Methods.List
					if len(fields) != 1 || len(fields[0].Names) != 1 {
						t.Fatalf("expected one named method in %q", signature)
					}
					name := fields[0].Names[0].Name
					if seen[name] {
						t.Fatalf("duplicate canonical method %s.%s", port.name, name)
					}
					seen[name] = true
					fn := fields[0].Type.(*ast.FuncType)
					want := reflect.FuncOf(resolveFields(t, fn.Params), resolveFields(t, fn.Results), false)
					method, ok := typ.MethodByName(name)
					if !ok || method.Type != want || method.PkgPath != "" {
						t.Errorf("%s.%s has type %v, want %v", port.name, name, method.Type, want)
					}
				}
				total += typ.NumMethod()
			})
		}
		if total != 66 {
			t.Errorf("compiled methods=%d, want 66", total)
		}
	})

	t.Run("compiled struct fields in canonical order", func(t *testing.T) {
		totalFields := 0
		for _, name := range []string{
			"MapHexesKey",
			"MapEdgesKey",
			"MapNodesKey",
			"MapNodeEdgesKey",
			"HexLinksKey",
			"NodeLinksKey",
			"POIsKey",
			"HexList",
			"EdgeList",
			"NodeList",
			"NodeEdgeList",
			"HexLinkList",
			"NodeLinkList",
			"PoiList",
			"TimeDateSnapshot",
			"TimeCalendarSnapshot",
			"ContainmentEdge",
			"HexAdmission",
			"QuestHexCandidate",
			"ProductReadRepos",
			"ProductCommandRepos",
		} {
			t.Run(name, func(t *testing.T) {
				canonicalName := "spatial." + name
				raw, ok := contract.Additional[canonicalName]
				if !ok {
					t.Fatalf("missing additional_types/%s", canonicalName)
				}
				typ := types[canonicalName]
				if typ.Kind() != reflect.Struct || typ.Name() != name || typ.PkgPath() != reflect.TypeFor[MapView]().PkgPath() {
					t.Fatalf("%s must be a named spatial struct", canonicalName)
				}
				decoder := json.NewDecoder(bytes.NewReader(raw))
				if tok, err := decoder.Token(); err != nil || tok != json.Delim('{') {
					t.Fatalf("%s must contain an ordered field object", canonicalName)
				}
				count := 0
				for decoder.More() {
					tok, err := decoder.Token()
					if err != nil {
						t.Fatal(err)
					}
					var fieldType string
					if err := decoder.Decode(&fieldType); err != nil {
						t.Fatal(err)
					}
					expr, err := parser.ParseExpr(fieldType)
					if err != nil {
						t.Fatal(err)
					}
					if count >= typ.NumField() {
						t.Fatalf("%s is missing canonical field %s", name, tok)
					}
					field := typ.Field(count)
					if field.Name != tok || field.Type != resolve(t, expr) || field.Anonymous || !field.IsExported() || field.Tag != "" {
						t.Errorf("%s field %d is %s %v %q, want %s %s without tags", name, count, field.Name, field.Type, field.Tag, tok, fieldType)
					}
					count++
				}
				totalFields += count
				if count != typ.NumField() {
					t.Errorf("%s has %d fields, want %d", name, typ.NumField(), count)
				}
			})
		}
		if totalFields != 58 {
			t.Errorf("compiled fields=%d, want 58", totalFields)
		}
	})

	t.Run("source allocation", func(t *testing.T) {
		source, err := parser.ParseFile(token.NewFileSet(), "product_repository.go", nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		want := map[string]bool{
			"MapReadRepository":       true,
			"MapWriteRepository":      true,
			"ProductBatchRepository":  true,
			"RegionReadRepository":    true,
			"RegionWriteRepository":   true,
			"TimeReadRepository":      true,
			"TimeWriteRepository":     true,
			"TimeBatchReadRepository": true,
			"ContainmentWriter":       true,
			"PlaceReader":             true,
			"MapHexesKey":             true,
			"MapEdgesKey":             true,
			"MapNodesKey":             true,
			"MapNodeEdgesKey":         true,
			"HexLinksKey":             true,
			"NodeLinksKey":            true,
			"POIsKey":                 true,
			"HexList":                 true,
			"EdgeList":                true,
			"NodeList":                true,
			"NodeEdgeList":            true,
			"HexLinkList":             true,
			"NodeLinkList":            true,
			"PoiList":                 true,
			"TimeDateSnapshot":        true,
			"TimeCalendarSnapshot":    true,
			"ContainmentEdge":         true,
			"QuestHexCandidate":       true,
			"ProductReadRepos":        true,
			"ProductCommandRepos":     true,
		}
		count := 0
		for _, decl := range source.Decls {
			if _, ok := decl.(*ast.FuncDecl); ok {
				t.Fatal("repository contract source must not implement functions")
			}
			if decl, ok := decl.(*ast.GenDecl); ok && decl.Tok != token.IMPORT {
				if decl.Tok != token.TYPE {
					t.Fatal("repository contract source must contain only type declarations")
				}
				for _, spec := range decl.Specs {
					typ := spec.(*ast.TypeSpec)
					if !want[typ.Name.Name] || typ.Assign.IsValid() {
						t.Fatalf("unexpected or aliased repository declaration %s", typ.Name.Name)
					}
					delete(want, typ.Name.Name)
					count++
				}
			}
		}
		if count != 30 || len(want) != 0 {
			t.Fatalf("source declares %d allocated types, missing %v", count, want)
		}
	})

	t.Run("comparable keys retain parent and pagination identity", func(t *testing.T) {
		t.Run("MapHexesKey", func(t *testing.T) {
			keys := map[MapHexesKey]bool{
				{ParentID: "a", Limit: 10, Offset: 0}:  true,
				{ParentID: "b", Limit: 10, Offset: 0}:  true,
				{ParentID: "a", Limit: 20, Offset: 0}:  true,
				{ParentID: "a", Limit: 10, Offset: 10}: true,
			}
			if len(keys) != 4 {
				t.Fatal("keys collapsed parent, limit or offset distinctions")
			}
		})
		t.Run("MapEdgesKey", func(t *testing.T) {
			keys := map[MapEdgesKey]bool{
				{ParentID: "a", Limit: 10, Offset: 0}:  true,
				{ParentID: "b", Limit: 10, Offset: 0}:  true,
				{ParentID: "a", Limit: 20, Offset: 0}:  true,
				{ParentID: "a", Limit: 10, Offset: 10}: true,
			}
			if len(keys) != 4 {
				t.Fatal("keys collapsed parent, limit or offset distinctions")
			}
		})
		t.Run("MapNodesKey", func(t *testing.T) {
			keys := map[MapNodesKey]bool{
				{ParentID: "a", Limit: 10, Offset: 0}:  true,
				{ParentID: "b", Limit: 10, Offset: 0}:  true,
				{ParentID: "a", Limit: 20, Offset: 0}:  true,
				{ParentID: "a", Limit: 10, Offset: 10}: true,
			}
			if len(keys) != 4 {
				t.Fatal("keys collapsed parent, limit or offset distinctions")
			}
		})
		t.Run("MapNodeEdgesKey", func(t *testing.T) {
			keys := map[MapNodeEdgesKey]bool{
				{ParentID: "a", Limit: 10, Offset: 0}:  true,
				{ParentID: "b", Limit: 10, Offset: 0}:  true,
				{ParentID: "a", Limit: 20, Offset: 0}:  true,
				{ParentID: "a", Limit: 10, Offset: 10}: true,
			}
			if len(keys) != 4 {
				t.Fatal("keys collapsed parent, limit or offset distinctions")
			}
		})
		t.Run("HexLinksKey", func(t *testing.T) {
			keys := map[HexLinksKey]bool{
				{ParentID: "a", Limit: 10, Offset: 0}:  true,
				{ParentID: "b", Limit: 10, Offset: 0}:  true,
				{ParentID: "a", Limit: 20, Offset: 0}:  true,
				{ParentID: "a", Limit: 10, Offset: 10}: true,
			}
			if len(keys) != 4 {
				t.Fatal("keys collapsed parent, limit or offset distinctions")
			}
		})
		t.Run("NodeLinksKey", func(t *testing.T) {
			keys := map[NodeLinksKey]bool{
				{ParentID: "a", Limit: 10, Offset: 0}:  true,
				{ParentID: "b", Limit: 10, Offset: 0}:  true,
				{ParentID: "a", Limit: 20, Offset: 0}:  true,
				{ParentID: "a", Limit: 10, Offset: 10}: true,
			}
			if len(keys) != 4 {
				t.Fatal("keys collapsed parent, limit or offset distinctions")
			}
		})
		t.Run("POIsKey", func(t *testing.T) {
			keys := map[POIsKey]bool{
				{ParentID: "a", Limit: 10, Offset: 0}:  true,
				{ParentID: "b", Limit: 10, Offset: 0}:  true,
				{ParentID: "a", Limit: 20, Offset: 0}:  true,
				{ParentID: "a", Limit: 10, Offset: 10}: true,
			}
			if len(keys) != 4 {
				t.Fatal("keys collapsed parent, limit or offset distinctions")
			}
		})
	})

	t.Run("time snapshots preserve stored values and absence", func(t *testing.T) {
		zero := int32(0)
		definition := json.RawMessage(`{"eraName":"stored"}`)
		date := TimeDateSnapshot{GameDay: &zero, Definition: &definition}
		if date.GameDay != &zero || *date.GameDay != 0 || date.Definition != &definition || !bytes.Equal(*date.Definition, definition) {
			t.Fatal("date snapshot lost the zero day or raw definition pointer")
		}
		var absentDate TimeDateSnapshot
		if absentDate.GameDay != nil || absentDate.Definition != nil {
			t.Fatal("absent date snapshot acquired stored values")
		}
		cells := []GameDayCellView{{GameDay: &zero, RealDate: product.Date("2026-10-17")}, {GameDay: nil, RealDate: product.Date("2026-10-18")}}
		calendar := TimeCalendarSnapshot{CurrentGameDay: &zero, Definition: &definition, Cells: cells}
		if calendar.CurrentGameDay != &zero || *calendar.CurrentGameDay != 0 || calendar.Definition != &definition || !bytes.Equal(*calendar.Definition, definition) {
			t.Fatal("calendar snapshot lost the zero day or raw definition pointer")
		}
		if len(calendar.Cells) != 2 || &calendar.Cells[0] != &cells[0] || calendar.Cells[0].GameDay != &zero || calendar.Cells[1].GameDay != nil || !reflect.DeepEqual(calendar.Cells, cells) {
			t.Fatal("calendar snapshot changed stored cells or day absence")
		}
		var absentCalendar TimeCalendarSnapshot
		if absentCalendar.CurrentGameDay != nil || absentCalendar.Definition != nil || absentCalendar.Cells != nil {
			t.Fatal("absent calendar snapshot acquired stored values")
		}
	})
}
