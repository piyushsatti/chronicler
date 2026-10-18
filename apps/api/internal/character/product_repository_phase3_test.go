package character

// CHA02 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Typed repository/read/write contracts and CommandRepos; no transaction ownership.
// Dependencies: P01, CHA01.
// Acceptance: TASK-CHA02, AUTH-character, BATCH-character. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/CHA02.json.

import (
	"bytes"
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

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

func TestPhase3TaskCHA02Acceptance(t *testing.T) {
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

	types := map[string]reflect.Type{
		"string": reflect.TypeFor[string](), "bool": reflect.TypeFor[bool](), "int32": reflect.TypeFor[int32](), "time.Time": reflect.TypeFor[time.Time](),
		"auth.Authority": reflect.TypeFor[auth.Authority](), "auth.Policy": reflect.TypeFor[auth.Policy](),
		"auth.AuthorityResolver": reflect.TypeFor[auth.AuthorityResolver](), "auth.OverrideRecorder": reflect.TypeFor[auth.OverrideRecorder](),
		"idempotency.Repository": reflect.TypeFor[idempotency.Repository](), "product.CommandReceipt": reflect.TypeFor[product.CommandReceipt](),
		"product.Clock": reflect.TypeFor[product.Clock](), "product.IDGenerator": reflect.TypeFor[product.IDGenerator](),
		"notification.Event": reflect.TypeFor[notification.Event](), "character.LiveParticipationBinding": reflect.TypeFor[LiveParticipationBinding](),
		"notification.EventProducer": reflect.TypeFor[notification.EventProducer](), "notification.ProducerRepos": reflect.TypeFor[notification.ProducerRepos](),
		"document.GuildReader": reflect.TypeFor[document.GuildReader](), "document.ReferenceAudienceReader": reflect.TypeFor[document.ReferenceAudienceReader](),
		"member.AssessmentWriter": reflect.TypeFor[member.AssessmentWriter](), "member.VerificationView": reflect.TypeFor[member.VerificationView](),
		"document.DocumentListResult": reflect.TypeFor[document.DocumentListResult](), "member.VerificationPage": reflect.TypeFor[member.VerificationPage](),
		"product.BatchResult[character.CharacterView]": reflect.TypeFor[product.BatchResult[CharacterView]](),
		"uow.Runner[character.ProductCommandRepos]":    reflect.TypeFor[uow.Runner[ProductCommandRepos]](),
	}
	registered := []reflect.Type{
		reflect.TypeFor[CharacterReadRepository](), reflect.TypeFor[CharacterWriteRepository](), reflect.TypeFor[ProductBatchRepository](),
		reflect.TypeFor[ReferenceReadRepository](), reflect.TypeFor[ReferenceWriteRepository](), reflect.TypeFor[AdmissionReader](),
		reflect.TypeFor[RewardClaimWriter](), reflect.TypeFor[QuestWithdrawalWriter](), reflect.TypeFor[ProductReadRepos](),
		reflect.TypeFor[ProductCommandRepos](), reflect.TypeFor[RewardClaims](), reflect.TypeFor[IDKey](),
		reflect.TypeFor[WithdrawalPlan](), reflect.TypeFor[WithdrawalEffects](),
	}
	for _, typ := range registered {
		types["character."+typ.Name()] = typ
	}

	normalize := func(value string) string {
		value = strings.ReplaceAll(value, "github.com/piyushsatti/chronicler/apps/api/internal/character.", "character.")
		return strings.Join(strings.Fields(value), "")
	}
	canonicalType := func(expr ast.Expr) string {
		var buffer bytes.Buffer
		if err := format.Node(&buffer, token.NewFileSet(), expr); err != nil {
			t.Fatal(err)
		}
		return normalize(buffer.String())
	}
	methodSignature := func(signature string) (string, string) {
		expr, err := parser.ParseExpr("interface { " + signature + " }")
		if err != nil {
			t.Fatal(err)
		}
		fields := expr.(*ast.InterfaceType).Methods.List
		if len(fields) != 1 || len(fields[0].Names) != 1 {
			t.Fatalf("invalid canonical method %q", signature)
		}
		fn := fields[0].Type.(*ast.FuncType)
		var params, results []string
		for _, field := range fn.Params.List {
			for range max(1, len(field.Names)) {
				params = append(params, canonicalType(field.Type))
			}
		}
		if fn.Results != nil {
			for _, field := range fn.Results.List {
				for range max(1, len(field.Names)) {
					results = append(results, canonicalType(field.Type))
				}
			}
		}
		resultList := ""
		switch len(results) {
		case 1:
			resultList = results[0]
		case 2:
			resultList = "(" + strings.Join(results, ",") + ")"
		case 0:
		default:
			resultList = "(" + strings.Join(results, ",") + ")"
		}
		return fields[0].Names[0].Name, "func(" + strings.Join(params, ",") + ")" + resultList
	}

	repositoryNames := map[string]reflect.Type{
		"character.CharacterReadRepository":  reflect.TypeFor[CharacterReadRepository](),
		"character.CharacterWriteRepository": reflect.TypeFor[CharacterWriteRepository](),
		"character.ProductBatchRepository":   reflect.TypeFor[ProductBatchRepository](),
		"character.ReferenceReadRepository":  reflect.TypeFor[ReferenceReadRepository](),
		"character.ReferenceWriteRepository": reflect.TypeFor[ReferenceWriteRepository](),
	}
	for canonicalName, typ := range repositoryNames {
		var methods []string
		for _, declaration := range contract.Repositories {
			if declaration.Name == canonicalName {
				if declaration.Owner != "CHA02" {
					t.Fatalf("%s owner = %s, want CHA02", canonicalName, declaration.Owner)
				}
				methods = declaration.Methods
				break
			}
		}
		if methods == nil {
			t.Fatalf("missing canonical declaration %s", canonicalName)
		}
		assertCanonicalMethods(t, canonicalName, typ, methods, methodSignature, normalize)
	}
	for canonicalName, typ := range map[string]reflect.Type{
		"character.AdmissionReader":       reflect.TypeFor[AdmissionReader](),
		"character.RewardClaimWriter":     reflect.TypeFor[RewardClaimWriter](),
		"character.QuestWithdrawalWriter": reflect.TypeFor[QuestWithdrawalWriter](),
	} {
		var methods []string
		for _, seam := range contract.Seams {
			if seam.Interface == canonicalName {
				methods = append(methods, seam.Signature)
			}
		}
		if methods == nil {
			t.Fatalf("missing canonical provider seams for %s", canonicalName)
		}
		assertCanonicalMethods(t, canonicalName, typ, methods, methodSignature, normalize)
	}
	for name, typ := range map[string]reflect.Type{
		"character.ProductReadRepos":    reflect.TypeFor[ProductReadRepos](),
		"character.ProductCommandRepos": reflect.TypeFor[ProductCommandRepos](),
		"character.RewardClaims":        reflect.TypeFor[RewardClaims](),
		"character.IDKey":               reflect.TypeFor[IDKey](),
		"character.WithdrawalPlan":      reflect.TypeFor[WithdrawalPlan](),
		"character.WithdrawalEffects":   reflect.TypeFor[WithdrawalEffects](),
	} {
		assertDirectMapFields(t, name, typ, contract.Additional[name], types, canonicalType)
	}
}

func assertCanonicalMethods(t *testing.T, canonicalName string, typ reflect.Type, signatures []string, parse func(string) (string, string), normalize func(string) string) {
	t.Helper()
	if typ.Kind() != reflect.Interface || typ.NumMethod() != len(signatures) {
		t.Fatalf("%s compiled method count = %d, canonical count = %d", canonicalName, typ.NumMethod(), len(signatures))
	}
	seen := map[string]bool{}
	for _, signature := range signatures {
		name, want := parse(signature)
		if seen[name] {
			t.Fatalf("duplicate canonical method %s.%s", canonicalName, name)
		}
		seen[name] = true
		method, ok := typ.MethodByName(name)
		if !ok {
			t.Errorf("%s.%s is missing", canonicalName, name)
			continue
		}
		if normalize(method.Type.String()) != want {
			t.Errorf("%s.%s type = %v, want %s", canonicalName, name, method.Type, want)
		}
	}
}

func assertDirectMapFields(t *testing.T, name string, typ reflect.Type, raw json.RawMessage, types map[string]reflect.Type, formatType func(ast.Expr) string) {
	t.Helper()
	if len(raw) == 0 {
		t.Fatalf("missing direct additional_types map %s", name)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if token, err := decoder.Token(); err != nil || token != json.Delim('{') {
		t.Fatalf("%s must be an ordered field object", name)
	}
	index := 0
	for decoder.More() {
		fieldToken, err := decoder.Token()
		if err != nil {
			t.Fatal(err)
		}
		fieldName := fieldToken.(string)
		var typeName string
		if err := decoder.Decode(&typeName); err != nil {
			t.Fatal(err)
		}
		expr, err := parser.ParseExpr(typeName)
		if err != nil {
			t.Fatal(err)
		}
		if index >= typ.NumField() {
			t.Fatalf("%s has unexpected field %s", name, fieldName)
		}
		field := typ.Field(index)
		want := resolveCharacterContractType(t, expr, types, formatType)
		if want == nil {
			t.Fatalf("unregistered canonical field type %s", typeName)
		}
		if field.Name != fieldName || field.Type != want || field.Anonymous || !field.IsExported() || field.Tag != "" {
			t.Errorf("%s field %d = %s %v %q, want %s %s without tags", name, index, field.Name, field.Type, field.Tag, fieldName, typeName)
		}
		index++
	}
	if index != typ.NumField() {
		t.Errorf("%s has %d fields, want %d", name, typ.NumField(), index)
	}
}

func resolveCharacterContractType(t *testing.T, expr ast.Expr, types map[string]reflect.Type, formatType func(ast.Expr) string) reflect.Type {
	t.Helper()
	switch expr := expr.(type) {
	case *ast.StarExpr:
		return reflect.PointerTo(resolveCharacterContractType(t, expr.X, types, formatType))
	case *ast.ArrayType:
		if expr.Len != nil {
			t.Fatal("canonical direct map unexpectedly contains an array")
		}
		return reflect.SliceOf(resolveCharacterContractType(t, expr.Elt, types, formatType))
	case *ast.MapType:
		return reflect.MapOf(resolveCharacterContractType(t, expr.Key, types, formatType), resolveCharacterContractType(t, expr.Value, types, formatType))
	}
	return types[formatType(expr)]
}

// CHA02 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Typed repository/read/write contracts and CommandRepos; no transaction ownership.
// Dependencies: P01, CHA01.
// Acceptance: TASK-CHA02, AUTH-character, BATCH-character. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/CHA02.json.
