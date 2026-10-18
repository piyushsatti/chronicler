package document

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
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPhase3TaskDOC02Acceptance(t *testing.T) {
	if got := reflect.TypeFor[GuildReader]().NumMethod(); got != 1 {
		t.Fatalf("GuildReader has %d methods, want 1", got)
	}
	if got := reflect.TypeFor[GuildReader]().Method(0).Name; got != "ValidateGuild" {
		t.Fatalf("GuildReader method = %s, want ValidateGuild", got)
	}
	guildAdmission := reflect.TypeFor[GuildAdmission]()
	if guildAdmission.NumField() != 2 || guildAdmission.Field(0).Name != "ID" || guildAdmission.Field(1).Name != "Category" {
		t.Fatalf("GuildAdmission fields do not match the direct go-seams declaration")
	}
	if guildAdmission.Field(0).Type != reflect.TypeFor[string]() || guildAdmission.Field(1).Type != reflect.TypeFor[*string]() {
		t.Fatalf("GuildAdmission field types do not match the direct go-seams declaration")
	}

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
	var guildSignature string
	for _, seam := range contract.Seams {
		if seam.Interface == "document.GuildReader" {
			guildSignature = seam.Signature
			break
		}
	}
	if guildSignature == "" {
		t.Fatal("document.GuildReader provider seam is missing")
	}
	expr, err := parser.ParseExpr("interface { " + guildSignature + " }")
	if err != nil {
		t.Fatal(err)
	}
	decl := expr.(*ast.InterfaceType).Methods.List[0]
	fn := decl.Type.(*ast.FuncType)
	formatTypes := func(fields *ast.FieldList) []string {
		var result []string
		if fields != nil {
			for _, field := range fields.List {
				var buffer bytes.Buffer
				if err := format.Node(&buffer, token.NewFileSet(), field.Type); err != nil {
					t.Fatal(err)
				}
				for range max(1, len(field.Names)) {
					result = append(result, string(bytes.Map(func(r rune) rune {
						if r == ' ' || r == '\n' || r == '\t' {
							return -1
						}
						return r
					}, buffer.Bytes())))
				}
			}
		}
		return result
	}
	wantSignature := "func(" + strings.Join(formatTypes(fn.Params), ",") + ")( " + strings.Join(formatTypes(fn.Results), ",") + " )"
	wantSignature = strings.ReplaceAll(strings.ReplaceAll(wantSignature, " ", ""), "\t", "")
	method, ok := reflect.TypeFor[GuildReader]().MethodByName(decl.Names[0].Name)
	if !ok || strings.Join(strings.Fields(method.Type.String()), "") != wantSignature {
		t.Fatalf("GuildReader.%s type = %v, want %s", decl.Names[0].Name, method.Type, wantSignature)
	}

	registered := []reflect.Type{
		reflect.TypeFor[DocumentReadRepository](),
		reflect.TypeFor[DocumentWriteRepository](),
		reflect.TypeFor[ProductBatchRepository](),
		reflect.TypeFor[ReferenceAudienceReader](),
		reflect.TypeFor[BriefWriter](),
		reflect.TypeFor[SummaryWriter](),
		reflect.TypeFor[MentionMemberReader](),
		reflect.TypeFor[LocationAdmissionReader](),
		reflect.TypeFor[SummaryWrite](),
		reflect.TypeFor[BriefCreate](),
		reflect.TypeFor[BriefEdit](),
		reflect.TypeFor[WriteResult](),
		reflect.TypeFor[SubjectLinkList](),
		reflect.TypeFor[DocumentSubjectsKey](),
		reflect.TypeFor[DocumentKey](),
		reflect.TypeFor[IDKey](),
		reflect.TypeFor[ProductReadRepos](),
		reflect.TypeFor[ProductCommandRepos](),
		reflect.TypeFor[LocationAdmission](),
		reflect.TypeFor[CodexCategoriesSpec](),
		reflect.TypeFor[CategoryCountView](),
		reflect.TypeFor[CodexDirectorySpec](),
		reflect.TypeFor[CodexDirectoryResult](),
		reflect.TypeFor[CodexEntrySpec](),
		reflect.TypeFor[CodexEntryCardView](),
		reflect.TypeFor[DocumentSpec](),
		reflect.TypeFor[DocumentView](),
		reflect.TypeFor[DocumentBacklinksSpec](),
		reflect.TypeFor[DocumentLinkView](),
		reflect.TypeFor[DocumentByIdSpec](),
		reflect.TypeFor[DocumentRevisionsSpec](),
		reflect.TypeFor[DocumentRevisionPage](),
		reflect.TypeFor[DocumentsSpec](),
		reflect.TypeFor[DocumentListResult](),
		reflect.TypeFor[DocumentsTrashSpec](),
		reflect.TypeFor[LieutenantAssignmentsSpec](),
		reflect.TypeFor[LieutenantPage](),
		reflect.TypeFor[PreviewBodySpec](),
		reflect.TypeFor[AssignLieutenantSpec](),
		reflect.TypeFor[AssignLieutenantState](),
		reflect.TypeFor[AssignLieutenantWrite](),
		reflect.TypeFor[LieutenantAssignmentView](),
		reflect.TypeFor[CreateDocumentSpec](),
		reflect.TypeFor[CreateDocumentState](),
		reflect.TypeFor[CreateDocumentWrite](),
		reflect.TypeFor[DeleteDocumentSpec](),
		reflect.TypeFor[DeleteDocumentState](),
		reflect.TypeFor[DeleteDocumentWrite](),
		reflect.TypeFor[EditPublishedDocumentSpec](),
		reflect.TypeFor[EditPublishedDocumentState](),
		reflect.TypeFor[EditPublishedDocumentWrite](),
		reflect.TypeFor[PublishDocumentSpec](),
		reflect.TypeFor[PublishDocumentState](),
		reflect.TypeFor[PublishDocumentWrite](),
		reflect.TypeFor[RestoreDocumentSpec](),
		reflect.TypeFor[RestoreDocumentState](),
		reflect.TypeFor[RestoreDocumentWrite](),
		reflect.TypeFor[RevokeLieutenantSpec](),
		reflect.TypeFor[RevokeLieutenantState](),
		reflect.TypeFor[RevokeLieutenantWrite](),
		reflect.TypeFor[SetDocumentVisibilitySpec](),
		reflect.TypeFor[SetDocumentVisibilityState](),
		reflect.TypeFor[SetDocumentVisibilityWrite](),
		reflect.TypeFor[UnpublishDocumentSpec](),
		reflect.TypeFor[UnpublishDocumentState](),
		reflect.TypeFor[UnpublishDocumentWrite](),
		reflect.TypeFor[UpdateDocumentSpec](),
		reflect.TypeFor[UpdateDocumentState](),
		reflect.TypeFor[UpdateDocumentWrite](),
		reflect.TypeFor[SummaryDerivedView](),
	}
	types := map[string]reflect.Type{
		"string":                     reflect.TypeFor[string](),
		"bool":                       reflect.TypeFor[bool](),
		"int32":                      reflect.TypeFor[int32](),
		"error":                      reflect.TypeFor[error](),
		"context.Context":            reflect.TypeFor[context.Context](),
		"time.Time":                  reflect.TypeFor[time.Time](),
		"int64":                      reflect.TypeFor[int64](),
		"json.RawMessage":            reflect.TypeFor[json.RawMessage](),
		"auth.Authority":             reflect.TypeFor[auth.Authority](),
		"auth.Policy":                reflect.TypeFor[auth.Policy](),
		"auth.AuthorityResolver":     reflect.TypeFor[auth.AuthorityResolver](),
		"auth.OverrideRecorder":      reflect.TypeFor[auth.OverrideRecorder](),
		"idempotency.Repository":     reflect.TypeFor[idempotency.Repository](),
		"notification.Event":         reflect.TypeFor[notification.Event](),
		"notification.EventProducer": reflect.TypeFor[notification.EventProducer](),
		"notification.ProducerRepos": reflect.TypeFor[notification.ProducerRepos](),
		"product.CommandReceipt":     reflect.TypeFor[product.CommandReceipt](),
		"product.Optional[string]":   reflect.TypeFor[product.Optional[string]](),
		"product.BatchResult[document.DocumentView]":       reflect.TypeFor[product.BatchResult[DocumentView]](),
		"product.BatchResult[document.SummaryDerivedView]": reflect.TypeFor[product.BatchResult[SummaryDerivedView]](),
		"product.BatchResult[document.SubjectLinkList]":    reflect.TypeFor[product.BatchResult[SubjectLinkList]](),
	}
	for _, typ := range registered {
		name := "document." + typ.Name()
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
			{"DocumentReadRepository", []int{5}, false, 11},
			{"DocumentWriteRepository", []int{6}, false, 22},
			{"ProductBatchRepository", []int{7}, false, 4},
			{"ReferenceAudienceReader", []int{260}, true, 1},
			{"MentionMemberReader", []int{402}, true, 1},
			{"LocationAdmissionReader", []int{408}, true, 1},
			{"BriefWriter", []int{269, 270}, true, 2},
			{"SummaryWriter", []int{271}, true, 1},
		}
		total := 0
		for _, port := range ports {
			t.Run(port.name, func(t *testing.T) {
				canonicalName := "document." + port.name
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
					if decl.Name != canonicalName || decl.Owner != "DOC02" {
						t.Fatalf("repository_interfaces/%d is not DOC02 %s", index, canonicalName)
					}
					signatures = decl.Methods
				}
				typ := types[canonicalName]
				if typ.Kind() != reflect.Interface || typ.Name() != port.name || typ.PkgPath() != reflect.TypeFor[DocumentView]().PkgPath() {
					t.Fatalf("%s must be a named document interface", canonicalName)
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
		if total != 43 {
			t.Errorf("compiled methods=%d, want 43", total)
		}
	})

	t.Run("compiled struct fields in canonical order", func(t *testing.T) {
		for _, name := range []string{
			"SummaryWrite", "BriefCreate", "BriefEdit", "WriteResult", "SubjectLinkList", "DocumentSubjectsKey", "DocumentKey",
			"IDKey", "ProductReadRepos", "ProductCommandRepos", "LocationAdmission",
		} {
			t.Run(name, func(t *testing.T) {
				canonicalName := "document." + name
				raw, ok := contract.Additional[canonicalName]
				if !ok {
					t.Fatalf("missing additional_types/%s", canonicalName)
				}
				typ := types[canonicalName]
				if typ.Kind() != reflect.Struct || typ.Name() != name || typ.PkgPath() != reflect.TypeFor[DocumentView]().PkgPath() {
					t.Fatalf("%s must be a named document struct", canonicalName)
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
				if count != typ.NumField() {
					t.Errorf("%s has %d fields, want %d", name, typ.NumField(), count)
				}
			})
		}
	})

	t.Run("comparable keys retain lookup and pagination identity", func(t *testing.T) {
		documents := map[DocumentKey]bool{
			{ID: "same"}:                             true,
			{Slug: "same"}:                           true,
			{Slug: "same", BySlug: true}:             true,
			{ID: "same", Slug: "same", BySlug: true}: true,
		}
		if len(documents) != 4 {
			t.Fatal("document keys collapsed ID, slug or BySlug distinctions")
		}
		pages := map[DocumentSubjectsKey]bool{
			{ParentID: "a", Limit: 10, Offset: 0}:  true,
			{ParentID: "b", Limit: 10, Offset: 0}:  true,
			{ParentID: "a", Limit: 20, Offset: 0}:  true,
			{ParentID: "a", Limit: 10, Offset: 10}: true,
		}
		if len(pages) != 4 {
			t.Fatal("subject keys collapsed parent, limit or offset distinctions")
		}
		ids := map[IDKey]bool{{ID: "a"}: true, {ID: "b"}: true}
		if len(ids) != 2 {
			t.Fatal("ID keys collapsed distinct IDs")
		}
	})
}
