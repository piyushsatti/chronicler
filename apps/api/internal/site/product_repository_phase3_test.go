package site

import (
	"context"
	"encoding/json"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestPhase3TaskSIT02Acceptance(t *testing.T) {
	type repository struct {
		Name    string   `json:"name"`
		Methods []string `json:"methods"`
		Owner   string   `json:"owner"`
	}
	var contract struct {
		Repositories []repository                 `json:"repository_interfaces"`
		CommandRepos map[string]map[string]string `json:"command_repos"`
		ReadRepos    map[string]map[string]string `json:"read_repos"`
		Additional   map[string]json.RawMessage   `json:"additional_types"`
	}
	data, err := os.ReadFile("../../docs/design/graphql-product/go-seams.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}

	repositoryTypes := map[string]reflect.Type{
		"site.OperationsReadRepository":  reflect.TypeFor[OperationsReadRepository](),
		"site.OperationsWriteRepository": reflect.TypeFor[OperationsWriteRepository](),
		"site.ProductBatchRepository":    reflect.TypeFor[ProductBatchRepository](),
		"site.SiteReadRepository":        reflect.TypeFor[SiteReadRepository](),
		"site.SiteWriteRepository":       reflect.TypeFor[SiteWriteRepository](),
	}
	compiledSite := map[string]reflect.Type{
		"site.AdminHealthAlertView":                    reflect.TypeFor[AdminHealthAlertView](),
		"site.CountByKeyView":                          reflect.TypeFor[CountByKeyView](),
		"site.AdminOperationsSpec":                     reflect.TypeFor[AdminOperationsSpec](),
		"site.AdminOperationsView":                     reflect.TypeFor[AdminOperationsView](),
		"site.ActiveAlertsKey":                         reflect.TypeFor[ActiveAlertsKey](),
		"site.AlertList":                               reflect.TypeFor[AlertList](),
		"site.CommunityStatsSnapshot":                  reflect.TypeFor[CommunityStatsSnapshot](),
		"site.DiscordDeliveryModeSpec":                 reflect.TypeFor[DiscordDeliveryModeSpec](),
		"site.HomeBannerSpec":                          reflect.TypeFor[HomeBannerSpec](),
		"site.HomeBannerView":                          reflect.TypeFor[HomeBannerView](),
		"site.HomeSpec":                                reflect.TypeFor[HomeSpec](),
		"site.MemberDiscoveryPage":                     reflect.TypeFor[MemberDiscoveryPage](),
		"site.QuestAnnouncementRoleSettingSpec":        reflect.TypeFor[QuestAnnouncementRoleSettingSpec](),
		"site.QuestAnnouncementRoleSettingView":        reflect.TypeFor[QuestAnnouncementRoleSettingView](),
		"site.RedriveDiscordDeliverySpec":              reflect.TypeFor[RedriveDiscordDeliverySpec](),
		"site.RedriveDiscordDeliveryState":             reflect.TypeFor[RedriveDiscordDeliveryState](),
		"site.RedriveDiscordDeliveryWrite":             reflect.TypeFor[RedriveDiscordDeliveryWrite](),
		"site.SearchKindView":                          reflect.TypeFor[SearchKindView](),
		"site.SearchSpec":                              reflect.TypeFor[SearchSpec](),
		"site.SearchableKindsSpec":                     reflect.TypeFor[SearchableKindsSpec](),
		"site.SiteStatsSpec":                           reflect.TypeFor[SiteStatsSpec](),
		"site.UpdateHomeBannerSpec":                    reflect.TypeFor[UpdateHomeBannerSpec](),
		"site.UpdateHomeBannerState":                   reflect.TypeFor[UpdateHomeBannerState](),
		"site.UpdateHomeBannerWrite":                   reflect.TypeFor[UpdateHomeBannerWrite](),
		"site.UpdateQuestAnnouncementRoleSettingSpec":  reflect.TypeFor[UpdateQuestAnnouncementRoleSettingSpec](),
		"site.UpdateQuestAnnouncementRoleSettingState": reflect.TypeFor[UpdateQuestAnnouncementRoleSettingState](),
		"site.UpdateQuestAnnouncementRoleSettingWrite": reflect.TypeFor[UpdateQuestAnnouncementRoleSettingWrite](),
	}
	types := map[string]reflect.Type{
		"string": reflect.TypeFor[string](), "bool": reflect.TypeFor[bool](), "int32": reflect.TypeFor[int32](), "error": reflect.TypeFor[error](),
		"context.Context": reflect.TypeFor[context.Context](),
		"auth.Authority":  reflect.TypeFor[auth.Authority](), "auth.Policy": reflect.TypeFor[auth.Policy](),
		"auth.AuthorityResolver": reflect.TypeFor[auth.AuthorityResolver](), "auth.OverrideRecorder": reflect.TypeFor[auth.OverrideRecorder](),
		"idempotency.Repository":     reflect.TypeFor[idempotency.Repository](),
		"notification.EventProducer": reflect.TypeFor[notification.EventProducer](), "notification.ProducerRepos": reflect.TypeFor[notification.ProducerRepos](),
		"product.BatchResult[site.AlertList]": reflect.TypeFor[product.BatchResult[AlertList]](),
		"quest.DeliveryReceipt":               reflect.TypeFor[quest.DeliveryReceipt](),
		"member.ActivitySummaryView":          reflect.TypeFor[member.ActivitySummaryView](), "member.MemberSearchHitView": reflect.TypeFor[member.MemberSearchHitView](),
	}
	for name, typ := range compiledSite {
		types[name] = typ
	}
	for name, typ := range repositoryTypes {
		types[name] = typ
	}

	resolve := func(expr ast.Expr) reflect.Type { return nil }
	resolve = func(expr ast.Expr) reflect.Type {
		switch expr := expr.(type) {
		case *ast.Ident:
			if typ, ok := types[expr.Name]; ok {
				return typ
			}
		case *ast.SelectorExpr:
			if pkg, ok := expr.X.(*ast.Ident); ok {
				if typ, found := types[pkg.Name+"."+expr.Sel.Name]; found {
					return typ
				}
			}
		case *ast.StarExpr:
			return reflect.PointerTo(resolve(expr.X))
		case *ast.ArrayType:
			return reflect.SliceOf(resolve(expr.Elt))
		case *ast.IndexExpr:
			if base, ok := expr.X.(*ast.SelectorExpr); ok {
				if pkg, ok := base.X.(*ast.Ident); ok {
					key := pkg.Name + "." + base.Sel.Name + "[" + canonicalExpr(t, expr.Index) + "]"
					if typ, found := types[key]; found {
						return typ
					}
				}
			}
		}
		t.Fatalf("unregistered signature type %T", expr)
		return nil
	}
	parseMethod := func(signature string) (string, reflect.Type) {
		t.Helper()
		expr, err := parser.ParseExpr("interface { " + signature + " }")
		if err != nil {
			t.Fatal(err)
		}
		methods := expr.(*ast.InterfaceType).Methods.List
		if len(methods) != 1 || len(methods[0].Names) != 1 {
			t.Fatalf("invalid canonical method %q", signature)
		}
		fn := methods[0].Type.(*ast.FuncType)
		var params, results []reflect.Type
		for _, field := range fn.Params.List {
			count := len(field.Names)
			if count == 0 {
				count = 1
			}
			for range count {
				params = append(params, resolve(field.Type))
			}
		}
		if fn.Results != nil {
			for _, field := range fn.Results.List {
				count := len(field.Names)
				if count == 0 {
					count = 1
				}
				for range count {
					results = append(results, resolve(field.Type))
				}
			}
		}
		return methods[0].Names[0].Name, reflect.FuncOf(params, results, false)
	}

	seenRepos := map[string]bool{}
	for _, d := range contract.Repositories {
		typ, owned := repositoryTypes[d.Name]
		if !owned {
			continue
		}
		if d.Owner != "SIT02" {
			t.Errorf("%s owner = %s, want SIT02", d.Name, d.Owner)
		}
		seenRepos[d.Name] = true
		if typ.NumMethod() != len(d.Methods) {
			t.Errorf("%s has %d methods, want %d", d.Name, typ.NumMethod(), len(d.Methods))
		}
		for _, signature := range d.Methods {
			name, want := parseMethod(signature)
			method, ok := typ.MethodByName(name)
			if !ok {
				t.Errorf("%s is missing %s", d.Name, name)
				continue
			}
			if method.Type != want {
				t.Errorf("%s.%s has signature %s, want %s", d.Name, name, method.Type, want)
			}
		}
	}
	if len(seenRepos) != len(repositoryTypes) {
		t.Errorf("canonical repository interfaces = %d, compiled = %d", len(seenRepos), len(repositoryTypes))
	}

	assertRepoFields := func(name string, typ reflect.Type, want map[string]string) {
		t.Helper()
		if typ.NumField() != len(want) {
			t.Errorf("%s has %d fields, want %d", name, typ.NumField(), len(want))
			return
		}
		seen := map[string]bool{}
		for i := 0; i < typ.NumField(); i++ {
			field := typ.Field(i)
			goType, ok := want[field.Name]
			if !ok || field.Type != resolveTypeString(t, goType, types) || field.Tag != "" || field.Anonymous {
				t.Errorf("%s field %d is %s %s %q, want %s %s without tags", name, i, field.Name, field.Type, field.Tag, field.Name, goType)
			}
			seen[field.Name] = true
		}
		for field := range want {
			if !seen[field] {
				t.Errorf("%s is missing field %s", name, field)
			}
		}
	}
	assertRepoFields("site.ProductReadRepos", reflect.TypeFor[ProductReadRepos](), contract.ReadRepos["site"])
	assertRepoFields("site.ProductCommandRepos", reflect.TypeFor[ProductCommandRepos](), contract.CommandRepos["site"])

	for _, entry := range []struct {
		name string
		typ  reflect.Type
	}{
		{"site.AlertList", reflect.TypeFor[AlertList]()},
		{"site.CommunityStatsSnapshot", reflect.TypeFor[CommunityStatsSnapshot]()},
		{"site.MemberDiscoveryPage", reflect.TypeFor[MemberDiscoveryPage]()},
	} {
		raw, ok := contract.Additional[entry.name]
		if !ok {
			t.Errorf("missing canonical additional type %s", entry.name)
			continue
		}
		var want map[string]string
		if err := json.Unmarshal(raw, &want); err != nil {
			t.Fatal(err)
		}
		assertRepoFields(entry.name, entry.typ, want)
	}

	source, err := parser.ParseFile(token.NewFileSet(), "product_repository.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	declared := map[string]bool{}
	for _, node := range source.Decls {
		decl, ok := node.(*ast.GenDecl)
		if !ok {
			t.Errorf("repository contract source contains executable declaration %T", node)
			continue
		}
		for _, spec := range decl.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok {
				if _, isImport := spec.(*ast.ImportSpec); !isImport {
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
	if len(declared) != 7 {
		t.Errorf("product_repository.go declares %d types, want 7", len(declared))
	}
	for name := range declared {
		if _, ok := repositoryTypes["site."+name]; !ok && name != "ProductReadRepos" && name != "ProductCommandRepos" {
			t.Errorf("unexpected declaration %s", name)
		}
	}
	for _, imp := range source.Imports {
		if strings.Contains(imp.Path.Value, "/graph") {
			t.Errorf("repository contracts import graph package %s", imp.Path.Value)
		}
	}
}

func canonicalExpr(t *testing.T, expr ast.Expr) string {
	t.Helper()
	var b strings.Builder
	if err := format.Node(&b, token.NewFileSet(), expr); err != nil {
		t.Fatal(err)
	}
	return strings.Join(strings.Fields(b.String()), "")
}

func resolveTypeString(t *testing.T, name string, types map[string]reflect.Type) reflect.Type {
	t.Helper()
	if typ, ok := types[name]; ok {
		return typ
	}
	if typ, ok := types["site."+name]; ok {
		return typ
	}
	if strings.HasPrefix(name, "*") {
		return reflect.PointerTo(resolveTypeString(t, name[1:], types))
	}
	if strings.HasPrefix(name, "[]") {
		return reflect.SliceOf(resolveTypeString(t, name[2:], types))
	}
	t.Fatalf("unregistered repository field type %q", name)
	return nil
}
