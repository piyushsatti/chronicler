package quest

import (
	"encoding/json"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPhase3TaskQUE01Acceptance(t *testing.T) {
	type field struct {
		Name   string `json:"name"`
		GoType string `json:"go_type"`
	}
	type declaration struct {
		Name        string   `json:"name"`
		Package     string   `json:"package"`
		Owner       string   `json:"owner"`
		PrimaryTask string   `json:"primary_task"`
		Fields      []field  `json:"fields"`
		EnumValues  []string `json:"enum_values"`
	}
	var contract struct {
		DTOs    []declaration                         `json:"dto_registry"`
		Specs   []declaration                         `json:"specs"`
		States  []declaration                         `json:"command_states"`
		Writes  []declaration                         `json:"command_writes"`
		Extra   map[string]map[string]json.RawMessage `json:"additional_types"`
		Loaders []struct {
			Key        string `json:"key"`
			Value      string `json:"value"`
			KeyOwner   string `json:"key_owner"`
			ValueOwner string `json:"value_owner"`
		} `json:"loaders"`
	}
	data, err := os.ReadFile("../../docs/design/graphql-product/go-seams.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}

	source, err := parser.ParseFile(token.NewFileSet(), "product_types.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	declared := make(map[string]ast.Expr)
	for _, decl := range source.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.TYPE {
			continue
		}
		for _, spec := range gen.Specs {
			typeSpec := spec.(*ast.TypeSpec)
			declared[typeSpec.Name.Name] = typeSpec.Type
		}
	}
	formatType := func(expr ast.Expr) string {
		var out strings.Builder
		if err := format.Node(&out, token.NewFileSet(), expr); err != nil {
			t.Fatal(err)
		}
		return out.String()
	}
	checkStruct := func(name string, fields []field) {
		t.Helper()
		expr, ok := declared[name]
		if !ok {
			t.Errorf("missing canonical declaration %s", name)
			return
		}
		st, ok := expr.(*ast.StructType)
		if !ok {
			t.Errorf("%s must be a struct", name)
			return
		}
		var actual []field
		for _, f := range st.Fields.List {
			if len(f.Names) == 0 {
				t.Errorf("%s has an anonymous field", name)
				continue
			}
			for _, n := range f.Names {
				actual = append(actual, field{Name: n.Name, GoType: formatType(f.Type)})
			}
		}
		if !reflect.DeepEqual(actual, fields) {
			t.Errorf("%s fields = %#v, contract requires %#v", name, actual, fields)
		}
	}
	owned := 0
	for _, section := range [][]declaration{contract.DTOs, contract.Specs, contract.States, contract.Writes} {
		for _, d := range section {
			if d.Owner != "QUE01" && d.PrimaryTask != "QUE01" {
				continue
			}
			owned++
			if d.Package != "quest" {
				t.Errorf("%s is owned by QUE01 but package is %q", d.Name, d.Package)
				continue
			}
			if len(d.EnumValues) != 0 {
				if expr, ok := declared[d.Name]; !ok || formatType(expr) != "string" {
					t.Errorf("%s must be a string-backed enum", d.Name)
				}
				continue
			}
			for i := range d.Fields {
				d.Fields[i].GoType = strings.ReplaceAll(d.Fields[i].GoType, "quest.", "")
			}
			checkStruct(d.Name, d.Fields)
		}
	}
	if owned == 0 {
		t.Fatal("go-seams.json contains no QUE01 declarations")
	}

	// These helper values are directly specified maps reached by QUE01-owned
	// loaders; they are not nested API models or runtime loader implementations.
	// The handoff marks each loader key as QUE01-owned but leaves its result
	// owner's field empty, so pin the current five Quest result values here.
	ownedResultTypes := map[string]bool{
		"quest.ParticipantList": true,
		"quest.HexList":         true,
		"quest.RegionIDList":    true,
		"quest.QuestList":       true,
		"quest.RewardList":      true,
	}
	seenResultTypes := make(map[string]bool, len(ownedResultTypes))
	checked := map[string]bool{}
	for _, loader := range contract.Loaders {
		for _, candidate := range []struct{ name, owner string }{{loader.Key, loader.KeyOwner}, {loader.Value, loader.ValueOwner}} {
			if candidate.name == "" {
				continue
			}
			if candidate.owner != "QUE01" && !ownedResultTypes[candidate.name] {
				continue
			}
			name := strings.TrimPrefix(candidate.name, "quest.")
			if ownedResultTypes[candidate.name] {
				seenResultTypes[candidate.name] = true
			}
			if checked[name] {
				continue
			}
			checked[name] = true
			fields, ok := contract.Extra["quest."+name]
			if !ok {
				t.Errorf("missing direct-field contract for %s", candidate.name)
				continue
			}
			want := make([]field, 0, len(fields))
			for n, rawType := range fields {
				var typ string
				if err := json.Unmarshal(rawType, &typ); err != nil {
					t.Errorf("additional type %s.%s is not a Go type string: %v", name, n, err)
					continue
				}
				want = append(want, field{Name: n, GoType: strings.ReplaceAll(typ, "quest.", "")})
			}
			// additional_types is a JSON object, so field order is intentionally
			// not part of its contract.
			expr, exists := declared[name]
			if !exists {
				t.Errorf("missing loader-owned type %s", name)
				continue
			}
			st, ok := expr.(*ast.StructType)
			if !ok {
				t.Errorf("loader-owned type %s must be a struct", name)
				continue
			}
			actual := make(map[string]string)
			for _, f := range st.Fields.List {
				for _, n := range f.Names {
					actual[n.Name] = formatType(f.Type)
				}
			}
			if len(actual) != len(want) {
				t.Errorf("%s has %d fields, contract requires %d", name, len(actual), len(want))
			}
			for _, f := range want {
				if actual[f.Name] != f.GoType {
					t.Errorf("%s.%s has type %q, contract requires %q", name, f.Name, actual[f.Name], f.GoType)
				}
			}
		}
	}
	for name := range ownedResultTypes {
		if !seenResultTypes[name] {
			t.Errorf("missing QUE01-owned loader result %s", name)
		}
	}

	if got, want := RewardCoverageComplete, RewardCoverage("COMPLETE"); got != want {
		t.Errorf("complete coverage wire value = %q, want %q", got, want)
	}
	if got, want := RewardCoverageLegacyUnknown, RewardCoverage("LEGACY_UNKNOWN"); got != want {
		t.Errorf("unknown legacy coverage wire value = %q, want %q", got, want)
	}
	edit := QuestEditFields{}
	if edit.Title.Set {
		t.Fatal("an omitted title patch must remain unset")
	}
	edit.Title = productOptionalStringNil()
	if !edit.Title.Set || edit.Title.Value != nil {
		t.Fatal("a set null title patch must remain distinct from omission")
	}
	title := "Updated title"
	edit.Title = productOptionalStringValue(title)
	if !edit.Title.Set || edit.Title.Value == nil || *edit.Title.Value != title {
		t.Fatal("a set title patch must preserve its value")
	}
}

// Keep the patch contract test independent of helper constructors and make
// the distinction under test visible at the call site.
func productOptionalStringNil() product.Optional[string] {
	return product.Optional[string]{Set: true}
}

func productOptionalStringValue(value string) product.Optional[string] {
	return product.Optional[string]{Set: true, Value: &value}
}
