package member

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
)

func TestPhase3TaskMEM04AssessmentWriterContract(t *testing.T) {
	var contract struct {
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
	var signature string
	for _, seam := range contract.Seams {
		if seam.Interface == "member.AssessmentWriter" {
			signature = seam.Signature
			break
		}
	}
	if signature == "" {
		t.Fatal("member.AssessmentWriter provider seam is missing")
	}
	interfaceExpr, err := parser.ParseExpr("interface { " + signature + " }")
	if err != nil {
		t.Fatal(err)
	}
	methodDecl := interfaceExpr.(*ast.InterfaceType).Methods.List[0]
	methodName := methodDecl.Names[0].Name
	fn := methodDecl.Type.(*ast.FuncType)
	typeText := func(expr ast.Expr) string {
		var buffer bytes.Buffer
		if err := format.Node(&buffer, token.NewFileSet(), expr); err != nil {
			t.Fatal(err)
		}
		return strings.Join(strings.Fields(buffer.String()), "")
	}
	var params, results []string
	for _, field := range fn.Params.List {
		for range max(1, len(field.Names)) {
			params = append(params, typeText(field.Type))
		}
	}
	for _, field := range fn.Results.List {
		for range max(1, len(field.Names)) {
			results = append(results, typeText(field.Type))
		}
	}
	wantSignature := "func(" + strings.Join(params, ",") + ")(" + strings.Join(results, ",") + ")"
	writer := reflect.TypeFor[AssessmentWriter]()
	if writer.NumMethod() != 1 {
		t.Fatalf("AssessmentWriter has %d methods, want one", writer.NumMethod())
	}
	method, ok := writer.MethodByName(methodName)
	if !ok || strings.Join(strings.Fields(method.Type.String()), "") != wantSignature {
		t.Fatalf("AssessmentWriter.%s type = %v, want %s", methodName, method.Type, wantSignature)
	}
	spec := reflect.TypeFor[AssessmentSpec]()
	fieldTypes := map[string]reflect.Type{
		"string": reflect.TypeFor[string](), "time.Time": reflect.TypeFor[time.Time](),
		"*int64":                     reflect.TypeFor[*int64](),
		"member.VerificationVerdict": reflect.TypeFor[VerificationVerdict](),
	}
	raw := contract.Additional["member.AssessmentSpec"]
	if len(raw) == 0 {
		t.Fatal("member.AssessmentSpec direct field map is missing")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if token, err := decoder.Token(); err != nil || token != json.Delim('{') {
		t.Fatal("AssessmentSpec direct map is not an ordered field object")
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
		wantType, ok := fieldTypes[typeText(expr)]
		if !ok && typeText(expr) == "*string" {
			wantType = reflect.PointerTo(reflect.TypeFor[string]())
			ok = true
		}
		if !ok && typeText(expr) == "*int64" {
			wantType = reflect.PointerTo(reflect.TypeFor[int64]())
			ok = true
		}
		if !ok {
			t.Fatalf("unregistered AssessmentSpec field type %s", typeName)
		}
		if index >= spec.NumField() {
			t.Fatalf("AssessmentSpec has unexpected field %s", fieldName)
		}
		field := spec.Field(index)
		if field.Name != fieldName || field.Type != wantType || field.Anonymous || !field.IsExported() || field.Tag != "" {
			t.Errorf("AssessmentSpec field %d = %s %v %q, want %s %s", index, field.Name, field.Type, field.Tag, fieldName, typeName)
		}
		index++
	}
	if index != spec.NumField() {
		t.Errorf("AssessmentSpec has %d fields, canonical map has %d", spec.NumField(), index)
	}
}

// MEM02 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Typed repository/read/write contracts and CommandRepos; no transaction ownership.
// Dependencies: P01, MEM01.
// Acceptance: TASK-MEM02, AUTH-member, BATCH-member. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/MEM02.json.
