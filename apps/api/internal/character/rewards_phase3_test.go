package character

import (
	"bytes"
	"encoding/json"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"strings"
	"testing"
)

func TestQuestRewardWriterMatchesCanonicalSeams(t *testing.T) {
	var contract struct {
		Seams []struct{ ID, Interface, Signature string } `json:"provider_caller_seams"`
	}
	data, err := os.ReadFile("../../docs/design/graphql-product/go-seams.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	source, err := parser.ParseFile(token.NewFileSet(), "rewards.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var methods []*ast.Field
	ast.Inspect(source, func(node ast.Node) bool {
		if declaration, ok := node.(*ast.TypeSpec); ok && declaration.Name.Name == "QuestRewardWriter" {
			methods = declaration.Type.(*ast.InterfaceType).Methods.List
			return false
		}
		return true
	})
	if len(methods) != 2 {
		t.Fatalf("QuestRewardWriter methods=%d", len(methods))
	}
	canonical := func(node ast.Node) string {
		var b bytes.Buffer
		if err := format.Node(&b, token.NewFileSet(), node); err != nil {
			t.Fatal(err)
		}
		return strings.ReplaceAll(b.String(), "character.", "")
	}
	for _, method := range methods {
		id := "CROSS-character.QuestRewardWriter-" + method.Names[0].Name
		found := false
		for _, seam := range contract.Seams {
			if seam.ID != id {
				continue
			}
			if found {
				t.Fatalf("duplicate seam %s", id)
			}
			found = true
			if seam.Interface != "character.QuestRewardWriter" {
				t.Fatalf("wrong interface for %s", id)
			}
			want, err := parser.ParseExpr("interface {" + seam.Signature + "}")
			if err != nil {
				t.Fatal(err)
			}
			if canonical(method.Type) != canonical(want.(*ast.InterfaceType).Methods.List[0].Type) {
				t.Fatalf("%s differs from canonical signature", id)
			}
		}
		if !found {
			t.Fatalf("missing seam %s", id)
		}
	}
}
