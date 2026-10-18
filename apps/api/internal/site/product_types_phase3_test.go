package site

import (
	"encoding/json"
	goast "go/ast"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
)

func TestPhase3TaskSIT01Acceptance(t *testing.T) {
	type field struct {
		Name   string `json:"name"`
		GoType string `json:"go_type"`
	}
	type declaration struct {
		Name        string   `json:"name"`
		Package     string   `json:"package"`
		Kind        string   `json:"kind"`
		Owner       string   `json:"owner"`
		PrimaryTask string   `json:"primary_task"`
		Fields      []field  `json:"fields"`
		EnumValues  []string `json:"enum_values"`
	}
	var contract struct {
		DTOs       []declaration              `json:"dto_registry"`
		Specs      []declaration              `json:"specs"`
		States     []declaration              `json:"command_states"`
		Writes     []declaration              `json:"command_writes"`
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
		reflect.TypeFor[AdminDeliveryConfigView](), reflect.TypeFor[AdminDeliveryJobView](),
		reflect.TypeFor[AdminHealthAlertView](), reflect.TypeFor[AdminOperationsView](),
		reflect.TypeFor[AnnouncementRoleFields](), reflect.TypeFor[CountByKeyView](),
		reflect.TypeFor[HomeBannerFields](), reflect.TypeFor[HomeBannerView](),
		reflect.TypeFor[HomeBucketView](), reflect.TypeFor[HomeView](),
		reflect.TypeFor[QuestAnnouncementRoleSettingView](), reflect.TypeFor[ScheduledWorkStatusView](),
		reflect.TypeFor[SearchKindView](), reflect.TypeFor[SearchResultView](), reflect.TypeFor[SiteStatsView](),
		reflect.TypeFor[RedriveDiscordDeliverySpec](), reflect.TypeFor[UpdateHomeBannerSpec](),
		reflect.TypeFor[UpdateQuestAnnouncementRoleSettingSpec](), reflect.TypeFor[AdminOperationsSpec](),
		reflect.TypeFor[DiscordDeliveryModeSpec](), reflect.TypeFor[HomeSpec](),
		reflect.TypeFor[HomeBannerSpec](), reflect.TypeFor[QuestAnnouncementRoleSettingSpec](),
		reflect.TypeFor[SearchSpec](), reflect.TypeFor[SearchableKindsSpec](), reflect.TypeFor[SiteStatsSpec](),
		reflect.TypeFor[RedriveDiscordDeliveryState](), reflect.TypeFor[UpdateHomeBannerState](),
		reflect.TypeFor[UpdateQuestAnnouncementRoleSettingState](), reflect.TypeFor[RedriveDiscordDeliveryWrite](),
		reflect.TypeFor[UpdateHomeBannerWrite](), reflect.TypeFor[UpdateQuestAnnouncementRoleSettingWrite](),
	}
	compiled := make(map[string]reflect.Type, len(registered))
	additionalTypes := map[string]reflect.Type{
		"site.ActiveAlertsKey":        reflect.TypeFor[ActiveAlertsKey](),
		"site.AlertList":              reflect.TypeFor[AlertList](),
		"site.CommunityStatsSnapshot": reflect.TypeFor[CommunityStatsSnapshot](),
		"site.MemberDiscoveryPage":    reflect.TypeFor[MemberDiscoveryPage](),
	}
	for _, typ := range registered {
		if _, exists := compiled[typ.Name()]; exists {
			t.Fatalf("duplicate compiled declaration %s", typ.Name())
		}
		compiled[typ.Name()] = typ
	}
	resolve := func(name string) reflect.Type { return nil }
	resolve = func(name string) reflect.Type {
		if strings.HasPrefix(name, "*") {
			return reflect.PointerTo(resolve(name[1:]))
		}
		if strings.HasPrefix(name, "[]") {
			return reflect.SliceOf(resolve(name[2:]))
		}
		switch name {
		case "string":
			return reflect.TypeFor[string]()
		case "bool":
			return reflect.TypeFor[bool]()
		case "int32":
			return reflect.TypeFor[int32]()
		case "int64":
			return reflect.TypeFor[int64]()
		case "time.Time":
			return reflect.TypeFor[time.Time]()
		case "document.DocumentView":
			return reflect.TypeFor[document.DocumentView]()
		case "document.DocumentSearchHitView":
			return reflect.TypeFor[document.DocumentSearchHitView]()
		case "member.MemberSearchHitView":
			return reflect.TypeFor[member.MemberSearchHitView]()
		case "member.ActivitySummaryView":
			return reflect.TypeFor[member.ActivitySummaryView]()
		}
		if strings.HasPrefix(name, "site.") {
			if typ, ok := compiled[strings.TrimPrefix(name, "site.")]; ok {
				return typ
			}
			if typ, ok := additionalTypes[name]; ok {
				return typ
			}
		}
		t.Fatalf("unregistered contract type %q", name)
		return nil
	}

	selected := make(map[string]bool, 32)
	for _, section := range []struct {
		name         string
		declarations []declaration
	}{
		{"dto_registry", contract.DTOs}, {"specs", contract.Specs},
		{"command_states", contract.States}, {"command_writes", contract.Writes},
	} {
		for _, d := range section.declarations {
			if d.Owner != "SIT01" && d.PrimaryTask != "SIT01" {
				continue
			}
			if d.Package != "site" {
				t.Errorf("%s package = %s, want site", d.Name, d.Package)
			}
			if selected[d.Name] {
				t.Fatalf("duplicate canonical declaration %s", d.Name)
			}
			selected[d.Name] = true
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
				if actual.Name != f.Name || actual.Type != resolve(f.GoType) || actual.Anonymous || !actual.IsExported() || actual.Tag != "" {
					t.Errorf("%s field %d is %s %s %q, want %s %s without tags", d.Name, i, actual.Name, actual.Type, actual.Tag, f.Name, f.GoType)
				}
			}
		}
	}
	if len(selected) != 32 || len(compiled) != 32 {
		t.Fatalf("canonical=%d compiled=%d, want 32 each", len(selected), len(compiled))
	}
	for name := range compiled {
		if !selected[name] {
			t.Errorf("compiled declaration %s has no owned contract", name)
		}
	}

	for name, typ := range additionalTypes {
		var fields map[string]string
		if err := json.Unmarshal(contract.Additional[name], &fields); err != nil {
			t.Fatal(err)
		}
		if typ.NumField() != len(fields) {
			t.Errorf("%s has %d fields, want %d", name, typ.NumField(), len(fields))
			continue
		}
		for i := 0; i < typ.NumField(); i++ {
			field := typ.Field(i)
			goType, ok := fields[field.Name]
			if !ok || field.Type != resolve(goType) || field.Anonymous || !field.IsExported() || field.Tag != "" {
				t.Errorf("%s field %d is %s %s %q, want %s %s without tags", name, i, field.Name, field.Type, field.Tag, field.Name, goType)
			}
		}
	}

	source, err := parser.ParseFile(token.NewFileSet(), "product_types.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	declared := make(map[string]bool)
	for _, node := range source.Decls {
		decl, ok := node.(*goast.GenDecl)
		if !ok {
			t.Errorf("declaration source contains executable declaration %T", node)
			continue
		}
		for _, spec := range decl.Specs {
			typeSpec, ok := spec.(*goast.TypeSpec)
			if !ok {
				if _, isImport := spec.(*goast.ImportSpec); !isImport {
					t.Errorf("unexpected declaration spec %T", spec)
				}
				continue
			}
			if typeSpec.Assign.IsValid() {
				t.Errorf("%s must be a declaration, not an alias", typeSpec.Name.Name)
			}
			declared[typeSpec.Name.Name] = true
		}
	}
	if len(declared) != 36 {
		t.Errorf("product_types.go declares %d types, want 36 including four canonical additional types", len(declared))
	}
	for name := range declared {
		if !compiledTypeExists(compiled, name) {
			if _, ok := additionalTypes["site."+name]; !ok {
				t.Errorf("source type %s absent from canonical registry", name)
			}
		}
	}
	for _, imp := range source.Imports {
		if strings.Contains(imp.Path.Value, "/graph") {
			t.Errorf("domain declarations import graph package %s", imp.Path.Value)
		}
	}
}

func compiledTypeExists(types map[string]reflect.Type, name string) bool {
	_, ok := types[name]
	return ok
}
