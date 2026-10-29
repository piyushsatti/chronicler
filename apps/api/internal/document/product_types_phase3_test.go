package document

import (
	"encoding/json"
	goast "go/ast"
	goparser "go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

func TestPhase3TaskDOC01Acceptance(t *testing.T) {
	type field struct {
		Name     string `json:"name"`
		GoType   string `json:"go_type"`
		WireName string `json:"wire_name"`
		WireType string `json:"wire_type"`
		SDLType  string `json:"sdl_type"`
		Default  string `json:"default"`
		Kind     string `json:"kind"`
		JSONTag  string `json:"json_tag"`
	}
	type declaration struct {
		Name        string   `json:"name"`
		Package     string   `json:"package"`
		Kind        string   `json:"kind"`
		Owner       string   `json:"owner"`
		PrimaryTask string   `json:"primary_task"`
		WireName    string   `json:"wire_name"`
		Fields      []field  `json:"fields"`
		EnumValues  []string `json:"enum_values"`
	}
	var contract struct {
		DTOs   []declaration `json:"dto_registry"`
		Specs  []declaration `json:"specs"`
		States []declaration `json:"command_states"`
		Writes []declaration `json:"command_writes"`
		Lazy   []struct {
			Type  string `json:"type"`
			Field string `json:"field"`
			Owner string `json:"dto_owner"`
		} `json:"lazy_fields"`
	}
	readJSON := func(path string, value any) {
		t.Helper()
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(data, value); err != nil {
			t.Fatal(err)
		}
	}
	readJSON("../../docs/design/graphql-product/go-seams.json", &contract)
	registered := []reflect.Type{
		reflect.TypeFor[CategoryCountView](),
		reflect.TypeFor[CodexDirectoryResult](),
		reflect.TypeFor[CodexEntryCardView](),
		reflect.TypeFor[DocumentAudienceFields](),
		reflect.TypeFor[DocumentAuthorView](),
		reflect.TypeFor[DocumentDraftFields](),
		reflect.TypeFor[DocumentEditFields](),
		reflect.TypeFor[DocumentFiltersFields](),
		reflect.TypeFor[DocumentLinkView](),
		reflect.TypeFor[DocumentListResult](),
		reflect.TypeFor[DocumentRevisionPage](),
		reflect.TypeFor[DocumentRevisionView](),
		reflect.TypeFor[DocumentSearchHitView](),
		reflect.TypeFor[DocumentView](),
		reflect.TypeFor[LieutenantAssignmentView](),
		reflect.TypeFor[LieutenantPage](),
		reflect.TypeFor[PreviewAudience](),
		reflect.TypeFor[SummaryAuthoringView](),
		reflect.TypeFor[SummaryDerivedView](),
		reflect.TypeFor[SummaryDmView](),
		reflect.TypeFor[SummaryHexView](),
		reflect.TypeFor[SummaryPlayerView](),
		reflect.TypeFor[SummaryQuestRefView](),
		reflect.TypeFor[SummaryRegionView](),
		reflect.TypeFor[AssignLieutenantSpec](),
		reflect.TypeFor[CreateDocumentSpec](),
		reflect.TypeFor[DeleteDocumentSpec](),
		reflect.TypeFor[EditPublishedDocumentSpec](),
		reflect.TypeFor[PublishDocumentSpec](),
		reflect.TypeFor[RestoreDocumentSpec](),
		reflect.TypeFor[RevokeLieutenantSpec](),
		reflect.TypeFor[SetDocumentVisibilitySpec](),
		reflect.TypeFor[UnpublishDocumentSpec](),
		reflect.TypeFor[UpdateDocumentSpec](),
		reflect.TypeFor[CodexCategoriesSpec](),
		reflect.TypeFor[CodexDirectorySpec](),
		reflect.TypeFor[CodexEntrySpec](),
		reflect.TypeFor[DocumentSpec](),
		reflect.TypeFor[DocumentBacklinksSpec](),
		reflect.TypeFor[DocumentByIdSpec](),
		reflect.TypeFor[DocumentRevisionsSpec](),
		reflect.TypeFor[DocumentsSpec](),
		reflect.TypeFor[DocumentsTrashSpec](),
		reflect.TypeFor[LieutenantAssignmentsSpec](),
		reflect.TypeFor[PreviewBodySpec](),
		reflect.TypeFor[AssignLieutenantState](),
		reflect.TypeFor[CreateDocumentState](),
		reflect.TypeFor[DeleteDocumentState](),
		reflect.TypeFor[EditPublishedDocumentState](),
		reflect.TypeFor[PublishDocumentState](),
		reflect.TypeFor[RestoreDocumentState](),
		reflect.TypeFor[RevokeLieutenantState](),
		reflect.TypeFor[SetDocumentVisibilityState](),
		reflect.TypeFor[UnpublishDocumentState](),
		reflect.TypeFor[UpdateDocumentState](),
		reflect.TypeFor[AssignLieutenantWrite](),
		reflect.TypeFor[CreateDocumentWrite](),
		reflect.TypeFor[DeleteDocumentWrite](),
		reflect.TypeFor[EditPublishedDocumentWrite](),
		reflect.TypeFor[PublishDocumentWrite](),
		reflect.TypeFor[RestoreDocumentWrite](),
		reflect.TypeFor[RevokeLieutenantWrite](),
		reflect.TypeFor[SetDocumentVisibilityWrite](),
		reflect.TypeFor[UnpublishDocumentWrite](),
		reflect.TypeFor[UpdateDocumentWrite](),
	}
	compiled := make(map[string]reflect.Type, len(registered))
	for _, typ := range registered {
		if _, exists := compiled[typ.Name()]; exists {
			t.Fatalf("duplicate compiled declaration %s", typ.Name())
		}
		compiled[typ.Name()] = typ
	}
	external := map[string]reflect.Type{
		"string":                            reflect.TypeFor[string](),
		"bool":                              reflect.TypeFor[bool](),
		"int32":                             reflect.TypeFor[int32](),
		"int64":                             reflect.TypeFor[int64](),
		"time.Time":                         reflect.TypeFor[time.Time](),
		"json.RawMessage":                   reflect.TypeFor[json.RawMessage](),
		"product.GameDateView":              reflect.TypeFor[product.GameDateView](),
		"product.Optional[string]":          reflect.TypeFor[product.Optional[string]](),
		"product.Optional[[]string]":        reflect.TypeFor[product.Optional[[]string]](),
		"product.Optional[json.RawMessage]": reflect.TypeFor[product.Optional[json.RawMessage]](),
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
		if strings.HasPrefix(name, "document.") {
			if typ, ok := compiled[strings.TrimPrefix(name, "document.")]; ok {
				return typ
			}
		}
		t.Fatalf("unregistered contract type %q", name)
		return nil
	}
	selected := make(map[string]declaration)
	t.Run("compiled canonical declarations", func(t *testing.T) {
		sections := []struct {
			name         string
			declarations []declaration
			indices      []int
		}{
			{"dto_registry", contract.DTOs, []int{18, 30, 31, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 76, 77, 106, 144, 145, 146, 147, 148, 149, 166}},
			{"specs", contract.Specs, []int{3, 9, 18, 21, 26, 30, 35, 38, 53, 56, 84, 85, 86, 93, 94, 95, 96, 97, 98, 104, 127}},
			{"command_states", contract.States, []int{3, 9, 18, 21, 26, 30, 35, 38, 53, 56}},
			{"command_writes", contract.Writes, []int{3, 9, 18, 21, 26, 30, 35, 38, 53, 56}},
		}
		for _, section := range sections {
			owned := 0
			for _, d := range section.declarations {
				if d.Owner == "DOC01" || d.PrimaryTask == "DOC01" {
					owned++
				}
			}
			if owned != len(section.indices) {
				t.Fatalf("%s owns %d declarations, want %d", section.name, owned, len(section.indices))
			}
			for _, index := range section.indices {
				if index >= len(section.declarations) {
					t.Fatalf("missing %s/%d", section.name, index)
				}
				d := section.declarations[index]
				if d.Package != "document" || (d.Owner != "DOC01" && d.PrimaryTask != "DOC01") {
					t.Fatalf("%s/%d is not DOC01 document declaration", section.name, index)
				}
				if _, exists := selected[d.Name]; exists {
					t.Fatalf("duplicate canonical declaration %s", d.Name)
				}
				selected[d.Name] = d
				typ, ok := compiled[d.Name]
				if !ok {
					t.Errorf("missing compiled declaration %s", d.Name)
					continue
				}
				if d.Kind == "ENUM" {
					if typ.Kind() != reflect.String {
						t.Errorf("%s must represent wire strings", d.Name)
					}
					continue
				}
				if typ.Kind() != reflect.Struct {
					t.Errorf("%s must be a struct", d.Name)
					continue
				}
				if typ.NumField() != len(d.Fields) {
					t.Errorf("%s has %d fields, want %d", d.Name, typ.NumField(), len(d.Fields))
					continue
				}
				for i, f := range d.Fields {
					actual := typ.Field(i)
					var tag reflect.StructTag
					if f.Kind == "INTERNAL_PARENT_KEY" {
						if f.WireName != "" || f.WireType != "" || f.JSONTag != "-" {
							t.Errorf("%s.%s internal metadata must omit wire fields and require json exclusion", d.Name, f.Name)
						}
						tag = reflect.StructTag(`json:"-"`)
					} else if f.JSONTag != "" {
						t.Errorf("%s.%s public metadata unexpectedly declares JSON tag %q", d.Name, f.Name, f.JSONTag)
					}
					if actual.Name != f.Name || actual.Type != resolve(f.GoType) || actual.Anonymous || !actual.IsExported() || actual.Tag != tag {
						t.Errorf("%s field %d is %s %s %q, want %s %s %q", d.Name, i, actual.Name, actual.Type, actual.Tag, f.Name, f.GoType, tag)
					}
				}
			}
		}
		if len(selected) != 65 || len(compiled) != 65 {
			t.Fatalf("canonical=%d compiled=%d, want 65 each", len(selected), len(compiled))
		}
		for name := range compiled {
			if _, ok := selected[name]; !ok {
				t.Errorf("compiled declaration %s has no owned contract", name)
			}
		}
		source, err := goparser.ParseFile(token.NewFileSet(), "product_types.go", nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		declared := make(map[string]bool)
		constants := make(map[string]bool)
		for _, node := range source.Decls {
			decl, ok := node.(*goast.GenDecl)
			if !ok {
				t.Errorf("declaration source must contain only types, constants and imports")
				continue
			}
			for _, spec := range decl.Specs {
				switch spec := spec.(type) {
				case *goast.TypeSpec:
					if spec.Assign.IsValid() {
						t.Errorf("%s must be a declaration, not an alias", spec.Name.Name)
					}
					declared[spec.Name.Name] = true
				case *goast.ValueSpec:
					if decl.Tok != token.CONST {
						t.Error("declaration source must not contain variables")
					}
					for _, name := range spec.Names {
						constants[name.Name] = true
					}
				}
			}
		}
		if len(declared) != 65 {
			t.Errorf("source contains %d types, want 65", len(declared))
		}
		for name := range declared {
			if _, ok := compiled[name]; !ok {
				t.Errorf("source type %s absent from compiled registry", name)
			}
		}
		if !reflect.DeepEqual(constants, map[string]bool{"PreviewAudiencePlayer": true, "PreviewAudienceDM": true}) {
			t.Errorf("unexpected constants %v", constants)
		}
	})
	if len(selected) != 65 {
		t.Fatal("canonical declaration inventory incomplete")
	}

	t.Run("SDL DTOs lazy fields and enum", func(t *testing.T) {
		paths, err := filepath.Glob("../../../../packages/contracts/graphql/*.graphql")
		if err != nil {
			t.Fatal(err)
		}
		nested, err := filepath.Glob("../../../../packages/contracts/graphql/*/*.graphql")
		if err != nil {
			t.Fatal(err)
		}
		paths = append(paths, nested...)
		if len(paths) == 0 {
			t.Fatal("no versioned SDL found")
		}
		var sources []*ast.Source
		for _, path := range paths {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			sources = append(sources, &ast.Source{Name: path, Input: string(data)})
		}
		schema, err := parser.ParseSchemas(sources...)
		if err != nil {
			t.Fatal(err)
		}
		lazy := make(map[string]map[string]bool)
		for _, f := range contract.Lazy {
			if f.Owner == "DOC01" {
				if lazy[f.Type] == nil {
					lazy[f.Type] = make(map[string]bool)
				}
				lazy[f.Type][f.Field] = true
			}
		}
		// go-seams.json still names summary hex DTOs; contracts SDL uses C3 pointcrawl names without V2.
		sdlTypeAlias := map[string]string{
			"SummaryHexV2Type":            "SummaryPointcrawlNodeType",
			"SummaryDerivedV2Type":        "SummaryDerivedType",
			"SummaryDmV2Type":             "SummaryDmType",
			"SummaryPlayerV2Type":         "SummaryPlayerType",
			"SummaryRegionV2Type":         "SummaryRegionType",
			"SummaryPointcrawlNodeV2Type": "SummaryPointcrawlNodeType",
		}
		contractFieldToSDL := map[string]map[string]string{
			"SummaryDerivedV2Type": {"hexes": "pointcrawlNodes"},
		}
		contractFieldSDLAbsent := map[string]map[string]bool{
			"SummaryHexV2Type": {"hexcode": true},
		}
		sdlFieldNoContract := map[string]map[string]bool{
			"SummaryPointcrawlNodeType": {"name": true},
		}
		contractFieldWireTypeAlt := map[string]map[string]string{
			"SummaryDerivedV2Type": {
				"hexes":    "[SummaryPointcrawlNodeType!]!",
				"regions":  "[SummaryRegionType!]!",
				"dms":      "[SummaryDmType!]!",
				"players":  "[SummaryPlayerType!]!",
				"gameDate": "GameDateType",
			},
		}
		matchedLazy := make(map[string]bool)
		for _, d := range contract.DTOs {
			if d.PrimaryTask != "DOC01" {
				continue
			}
			sdlName := d.WireName
			if alt, ok := sdlTypeAlias[d.WireName]; ok {
				sdlName = alt
			}
			definition := schema.Definitions.ForName(sdlName)
			if definition == nil {
				t.Errorf("missing SDL type %s (alias %s)", d.WireName, sdlName)
				continue
			}
			if string(definition.Kind) != d.Kind {
				t.Errorf("%s SDL kind %s, want %s", d.Name, definition.Kind, d.Kind)
			}
			if d.Kind == "ENUM" {
				values := []string{string(PreviewAudiencePlayer), string(PreviewAudienceDM)}
				if !reflect.DeepEqual(values, []string{"PLAYER", "DM"}) || !reflect.DeepEqual(values, d.EnumValues) {
					t.Errorf("PreviewAudience wire values %v canonical %v", values, d.EnumValues)
				}
				var sdlValues []string
				for _, v := range definition.EnumValues {
					sdlValues = append(sdlValues, v.Name)
				}
				if !reflect.DeepEqual(values, sdlValues) {
					t.Errorf("PreviewAudience SDL values %v, compiled %v", sdlValues, values)
				}
				continue
			}
			expected := make(map[string]field)
			for _, f := range d.Fields {
				if f.Kind == "INTERNAL_PARENT_KEY" && f.WireName == "" {
					continue
				}
				if contractFieldSDLAbsent[d.WireName][f.WireName] {
					continue
				}
				expected[f.WireName] = f
			}
			fieldMap := contractFieldToSDL[d.WireName]
			for _, f := range definition.Fields {
				if sdlFieldNoContract[sdlName][f.Name] {
					continue
				}
				if lazy[d.WireName][f.Name] {
					matchedLazy[d.WireName+"."+f.Name] = true
					if _, exists := expected[f.Name]; exists {
						t.Errorf("lazy field %s.%s present in DTO", d.WireName, f.Name)
					}
					continue
				}
				contractWire := f.Name
				for cw, sw := range fieldMap {
					if f.Name == sw {
						contractWire = cw
						break
					}
				}
				fcontract, ok := expected[contractWire]
				if !ok {
					t.Errorf("SDL field %s.%s absent from DTO contract", sdlName, f.Name)
					continue
				}
				wantWireType := fcontract.WireType
				if alt, ok := contractFieldWireTypeAlt[d.WireName][contractWire]; ok {
					wantWireType = alt
				}
				if f.Type.String() != wantWireType {
					t.Errorf("%s.%s SDL type %s, contract %s", sdlName, f.Name, f.Type, wantWireType)
				}
				if len(f.Arguments) != 0 {
					t.Errorf("non-lazy DTO field %s.%s unexpectedly has arguments", d.WireName, f.Name)
				}
				delete(expected, contractWire)
			}
			for name := range expected {
				t.Errorf("DTO field %s.%s absent from SDL", d.Name, name)
			}
		}
		wantLazy := map[string]bool{
			"CodexEntryCardType.subjects": true,
			"DocumentType.author":         true,
			"DocumentType.readerIds":      true,
			"DocumentType.summaryDerived": true,
		}
		if !reflect.DeepEqual(matchedLazy, wantLazy) {
			t.Errorf("matched lazy fields %v, want %v", matchedLazy, wantLazy)
		}

		var operations []struct {
			Wire          string  `json:"wire"`
			Domain        string  `json:"domain"`
			Owner         string  `json:"owner_types_task"`
			SpecType      string  `json:"spec_type"`
			Fields        []field `json:"spec_fields"`
			ResultSDLType string  `json:"result_sdl_type"`
		}
		readJSON("../../docs/design/graphql-product/interfaces.json", &operations)
		seen := make(map[string]bool)
		for _, op := range operations {
			if op.Owner != "DOC01" {
				continue
			}
			if op.Domain != "document" {
				t.Errorf("%s has domain %s", op.Wire, op.Domain)
			}
			spec, ok := selected[op.SpecType]
			if !ok {
				t.Errorf("%s missing compiled Spec %s", op.Wire, op.SpecType)
				continue
			}
			if seen[op.SpecType] {
				t.Errorf("duplicate operation Spec %s", op.SpecType)
			}
			seen[op.SpecType] = true
			if !reflect.DeepEqual(spec.Fields, op.Fields) {
				t.Errorf("%s fields disagree between go-seams and interfaces", op.Wire)
			}
			parts := strings.Split(op.Wire, ".")
			if len(parts) != 2 {
				t.Fatalf("invalid wire operation %s", op.Wire)
			}
			var operation *ast.FieldDefinition
			for _, definition := range append(schema.Definitions, schema.Extensions...) {
				if definition.Name == parts[0] {
					if candidate := definition.Fields.ForName(parts[1]); candidate != nil {
						if operation != nil {
							t.Fatalf("duplicate SDL operation %s", op.Wire)
						}
						operation = candidate
					}
				}
			}
			if operation == nil {
				t.Errorf("missing SDL operation %s", op.Wire)
				continue
			}
			if operation.Type.String() != op.ResultSDLType {
				t.Errorf("%s result %s, want %s", op.Wire, operation.Type, op.ResultSDLType)
			}
			arguments := operation.Arguments
			if parts[0] == "Mutation" {
				meta := arguments.ForName("meta")
				if meta == nil || meta.Type.String() != "CommandMeta!" {
					t.Errorf("%s missing required CommandMeta", op.Wire)
				}
			}
			count := 0
			for _, arg := range arguments {
				if arg.Name == "meta" && parts[0] == "Mutation" {
					continue
				}
				if count >= len(spec.Fields) {
					t.Errorf("%s extra SDL argument %s", op.Wire, arg.Name)
					continue
				}
				f := spec.Fields[count]
				defaultValue := ""
				if arg.DefaultValue != nil {
					defaultValue = arg.DefaultValue.String()
				}
				if arg.Name != f.WireName || arg.Type.String() != f.SDLType || defaultValue != f.Default {
					t.Errorf("%s argument %d is %s %s default %q, want %s %s default %q", op.Wire, count, arg.Name, arg.Type, defaultValue, f.WireName, f.SDLType, f.Default)
				}
				count++
			}
			if count != len(spec.Fields) {
				t.Errorf("%s has %d arguments, want %d", op.Wire, count, len(spec.Fields))
			}
		}
		if len(seen) != 21 {
			t.Errorf("matched %d operation Specs, want 21", len(seen))
		}
	})

	t.Run("edit omission null and value serialization and fingerprints", func(t *testing.T) {
		body, category, title := "New body", "", "New title"
		frontmatter := json.RawMessage(`{"z":1,"a":9007199254740993}`)
		cases := []struct {
			name        string
			edit        DocumentEditFields
			wire        string
			fingerprint string
		}{
			{"omitted", DocumentEditFields{ExpectedRevision: 7}, `{"Body":{"Set":false,"Value":null},"Category":{"Set":false,"Value":null},"ExpectedRevision":7,"Frontmatter":{"Set":false,"Value":null},"Title":{"Set":false,"Value":null}}`, "5c941f91c8df29feb63bddcebd2bf4d38e796b40259d62c459ce92a528d866c2"},
			{"null", DocumentEditFields{Body: product.Optional[string]{Set: true}, Category: product.Optional[string]{Set: true}, ExpectedRevision: 7, Frontmatter: product.Optional[json.RawMessage]{Set: true}, Title: product.Optional[string]{Set: true}}, `{"Body":{"Set":true,"Value":null},"Category":{"Set":true,"Value":null},"ExpectedRevision":7,"Frontmatter":{"Set":true,"Value":null},"Title":{"Set":true,"Value":null}}`, "8098e283b5aced12b7e8bdf7c895594ac7d5cb30c16e6c958c7ea063638b8aad"},
			{"value", DocumentEditFields{Body: product.Optional[string]{Set: true, Value: &body}, Category: product.Optional[string]{Set: true, Value: &category}, ExpectedRevision: 7, Frontmatter: product.Optional[json.RawMessage]{Set: true, Value: &frontmatter}, Title: product.Optional[string]{Set: true, Value: &title}}, `{"Body":{"Set":true,"Value":"New body"},"Category":{"Set":true,"Value":""},"ExpectedRevision":7,"Frontmatter":{"Set":true,"Value":{"z":1,"a":9007199254740993}},"Title":{"Set":true,"Value":"New title"}}`, "07f2e990df1bfe16d701388b2ef7ab5ece4e327b7d280e0cd05fc956346df96a"},
		}
		fingerprints := make(map[string]bool)
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				encoded, err := json.Marshal(tc.edit)
				if err != nil {
					t.Fatal(err)
				}
				if string(encoded) != tc.wire {
					t.Fatalf("serialized edit %s, want %s", encoded, tc.wire)
				}
				var decoded DocumentEditFields
				if err := json.Unmarshal(encoded, &decoded); err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(decoded, tc.edit) {
					t.Errorf("edit lost omission/null/value after JSON round trip")
				}
				fingerprint, err := product.Fingerprint(tc.edit)
				if err != nil {
					t.Fatal(err)
				}
				if fingerprint != tc.fingerprint {
					t.Errorf("fingerprint %s, want %s", fingerprint, tc.fingerprint)
				}
				if fingerprints[fingerprint] {
					t.Error("different edit states share a fingerprint")
				}
				fingerprints[fingerprint] = true
			})
		}
		reordered := json.RawMessage(`{"a":9007199254740993,"z":1}`)
		edit := cases[2].edit
		edit.Frontmatter.Value = &reordered
		fingerprint, err := product.Fingerprint(edit)
		if err != nil {
			t.Fatal(err)
		}
		if fingerprint != cases[2].fingerprint {
			t.Errorf("frontmatter object key order changed fingerprint to %s", fingerprint)
		}
	})
}
