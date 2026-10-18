package character

import (
	"bytes"
	"encoding/json"
	goast "go/ast"
	"go/format"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

func TestPhase3TaskCHA02AdditionalTypeMaps(t *testing.T) {
	var contract struct {
		Additional map[string]json.RawMessage `json:"additional_types"`
	}
	data, err := os.ReadFile("../../docs/design/graphql-product/go-seams.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	types := map[string]reflect.Type{
		"string": reflect.TypeFor[string](), "bool": reflect.TypeFor[bool](), "int32": reflect.TypeFor[int32](),
		"time.Time": reflect.TypeFor[time.Time](), "character.ParticipationView": reflect.TypeFor[ParticipationView](),
	}
	formatType := func(expr goast.Expr) string {
		var buffer bytes.Buffer
		if err := format.Node(&buffer, token.NewFileSet(), expr); err != nil {
			t.Fatal(err)
		}
		return strings.Join(strings.Fields(buffer.String()), "")
	}
	assertDirectMapFields(t, "character.ParticipationView", reflect.TypeFor[ParticipationView](), contract.Additional["character.ParticipationView"], types, formatType)
	assertDirectMapFields(t, "character.ParticipationPageView", reflect.TypeFor[ParticipationPageView](), contract.Additional["character.ParticipationPageView"], types, formatType)
}

func TestPhase3TaskCHA01Acceptance(t *testing.T) {
	t.Run("profile patch preserves omission, null, and value", func(t *testing.T) {
		omitted := UpdateCharacterProfileV2Fields{}
		cleared := UpdateCharacterProfileV2Fields{
			Description:    product.Optional[string]{Set: true},
			BackgroundText: product.Optional[string]{Set: true},
		}
		description := "updated description"
		background := "updated background"
		set := UpdateCharacterProfileV2Fields{
			Description:    product.Optional[string]{Set: true, Value: &description},
			BackgroundText: product.Optional[string]{Set: true, Value: &background},
		}

		assertOptional := func(field string, got product.Optional[string], wantSet bool, wantValue *string) {
			t.Helper()
			if got.Set != wantSet {
				t.Fatalf("%s Set = %t, want %t", field, got.Set, wantSet)
			}
			if wantValue == nil {
				if got.Value != nil {
					t.Fatalf("%s Value = %q, want null", field, *got.Value)
				}
				return
			}
			if got.Value == nil || *got.Value != *wantValue {
				t.Fatalf("%s Value = %v, want %q", field, got.Value, *wantValue)
			}
		}

		for _, field := range []struct {
			name    string
			omitted product.Optional[string]
			cleared product.Optional[string]
			set     product.Optional[string]
			value   *string
		}{
			{"description", omitted.Description, cleared.Description, set.Description, &description},
			{"backgroundText", omitted.BackgroundText, cleared.BackgroundText, set.BackgroundText, &background},
		} {
			assertOptional(field.name+" omitted", field.omitted, false, nil)
			assertOptional(field.name+" explicit null", field.cleared, true, nil)
			assertOptional(field.name+" value", field.set, true, field.value)
		}
	})

	schema := loadCharacterSourceSchema(t)
	t.Run("profile SDL remains nullable with no default", func(t *testing.T) {
		definition := schema.Definitions.ForName("UpdateCharacterProfileV2Input")
		if definition == nil || definition.Kind != ast.InputObject {
			t.Fatal("UpdateCharacterProfileV2Input is missing or has the wrong kind")
		}
		wantFields := map[string]bool{"description": false, "backgroundText": false}
		for _, field := range definition.Fields {
			_, ok := wantFields[field.Name]
			if !ok {
				t.Errorf("unexpected profile input field %q", field.Name)
				continue
			}
			wantFields[field.Name] = true
			if field.Type.String() != "String" {
				t.Errorf("%s type = %s, want nullable String", field.Name, field.Type)
			}
			if field.DefaultValue != nil {
				t.Errorf("%s has a default %s, want no default", field.Name, field.DefaultValue)
			}
		}
		for name, found := range wantFields {
			if !found {
				t.Errorf("profile input field %q is missing", name)
			}
		}
		if len(definition.Fields) != len(wantFields) {
			t.Errorf("profile input has %d fields, want exactly %d", len(definition.Fields), len(wantFields))
		}
	})

	t.Run("review and reward enum wire values", func(t *testing.T) {
		assertEnumValues(t, schema, "CharacterReviewStatus", []string{
			string(CharacterReviewStatusPending),
			string(CharacterReviewStatusRejected),
			string(CharacterReviewStatusApproved),
			string(CharacterReviewStatusUnknown),
		}, []string{"PENDING", "REJECTED", "APPROVED", "UNKNOWN"})
		assertEnumValues(t, schema, "RewardClaimStatus", []string{
			string(RewardClaimStatusUnclaimed),
			string(RewardClaimStatusClaimed),
		}, []string{"UNCLAIMED", "CLAIMED"})
	})
}

func loadCharacterSourceSchema(t *testing.T) *ast.SchemaDocument {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate CHA01 acceptance test source")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(filename), "../../../../"))
	paths, err := filepath.Glob(filepath.Join(root, "packages/contracts/graphql/*.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	var sources []*ast.Source
	for _, path := range paths {
		if filepath.Base(path) == "schema.graphql" {
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		sources = append(sources, &ast.Source{Name: path, Input: string(data)})
	}
	if len(sources) == 0 {
		t.Fatal("no authored GraphQL SDL fragments found")
	}
	schema, err := parser.ParseSchemas(sources...)
	if err != nil {
		t.Fatal(err)
	}
	return schema
}

func assertEnumValues(t *testing.T, schema *ast.SchemaDocument, name string, goValues, want []string) {
	t.Helper()
	if len(goValues) != len(want) {
		t.Fatalf("%s Go enum has %d values, want %d", name, len(goValues), len(want))
	}
	for i := range want {
		if goValues[i] != want[i] {
			t.Errorf("%s Go value %d = %q, want %q", name, i, goValues[i], want[i])
		}
	}
	definition := schema.Definitions.ForName(name)
	if definition == nil || definition.Kind != ast.Enum {
		t.Fatalf("%s SDL enum is missing or has the wrong kind", name)
	}
	if len(definition.EnumValues) != len(want) {
		t.Fatalf("%s SDL enum has %d values, want %d", name, len(definition.EnumValues), len(want))
	}
	for i, value := range definition.EnumValues {
		if value.Name != want[i] {
			t.Errorf("%s SDL value %d = %q, want %q", name, i, value.Name, want[i])
		}
	}
}
