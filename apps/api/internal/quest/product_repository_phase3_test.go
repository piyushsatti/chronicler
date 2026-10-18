package quest

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

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

// QUE02 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Typed repository/read/write contracts and CommandRepos; no transaction ownership.
// Dependencies: P01, QUE01.
// Acceptance: TASK-QUE02, AUTH-quest, BATCH-quest. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/QUE02.json.

func TestPhase3TaskQUE02RepositoryPortsMatchGoSeams(t *testing.T) {
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
	}
	data, err := os.ReadFile("../../docs/design/graphql-product/go-seams.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	source, err := parser.ParseFile(token.NewFileSet(), "product_repository.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	declared := make(map[string]*ast.InterfaceType)
	for _, decl := range source.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.TYPE {
			continue
		}
		for _, spec := range gen.Specs {
			ts := spec.(*ast.TypeSpec)
			if iface, ok := ts.Type.(*ast.InterfaceType); ok {
				declared[ts.Name.Name] = iface
			}
		}
	}
	formatNode := func(node any) string {
		t.Helper()
		var b bytes.Buffer
		if err := format.Node(&b, token.NewFileSet(), node); err != nil {
			t.Fatal(err)
		}
		return strings.ReplaceAll(b.String(), "quest.", "")
	}
	repositoryPorts := map[string]int{"ArcReadRepository": 18, "ArcWriteRepository": 19, "ProductBatchRepository": 20, "QuestReadRepository": 21, "QuestWriteRepository": 22}
	for name, index := range repositoryPorts {
		t.Run(name, func(t *testing.T) {
			if index >= len(contract.Repositories) {
				t.Fatalf("missing repository_interfaces/%d", index)
			}
			canonical := contract.Repositories[index]
			if canonical.Name != "quest."+name || canonical.Owner != "QUE02" {
				t.Fatalf("repository_interfaces/%d is not QUE02 %s", index, name)
			}
			iface := declared[name]
			if iface == nil {
				t.Fatalf("missing %s", name)
			}
			if len(iface.Methods.List) != len(canonical.Methods) {
				t.Fatalf("%s has %d methods, want %d", name, len(iface.Methods.List), len(canonical.Methods))
			}
			for i, signature := range canonical.Methods {
				want, err := parser.ParseExpr("interface { " + signature + " }")
				if err != nil {
					t.Fatal(err)
				}
				wantMethod := want.(*ast.InterfaceType).Methods.List[0]
				gotMethod := iface.Methods.List[i]
				if len(wantMethod.Names) != 1 || len(gotMethod.Names) != 1 || gotMethod.Names[0].Name != wantMethod.Names[0].Name || formatNode(gotMethod.Type) != formatNode(wantMethod.Type) {
					t.Errorf("%s method %d = %s, want %s", name, i, formatNode(gotMethod), formatNode(wantMethod))
				}
			}
		})
	}
	crossPorts := map[string][]int{"TagNormalizer": {283, 284, 286}, "RewardDecisionCoverageReader": {407}}
	for name, indexes := range crossPorts {
		t.Run(name, func(t *testing.T) {
			iface := declared[name]
			if iface == nil {
				t.Fatalf("missing %s", name)
			}
			if len(iface.Methods.List) != len(indexes) {
				t.Fatalf("%s has %d methods, want %d", name, len(iface.Methods.List), len(indexes))
			}
			for i, index := range indexes {
				if index >= len(contract.Seams) || contract.Seams[index].Interface != "quest."+name {
					t.Fatalf("provider_caller_seams/%d is not quest.%s", index, name)
				}
				want, err := parser.ParseExpr("interface { " + contract.Seams[index].Signature + " }")
				if err != nil {
					t.Fatal(err)
				}
				wantMethod := want.(*ast.InterfaceType).Methods.List[0]
				gotMethod := iface.Methods.List[i]
				if gotMethod.Names[0].Name != wantMethod.Names[0].Name || formatNode(gotMethod.Type) != formatNode(wantMethod.Type) {
					t.Errorf("%s method %d = %s, want %s", name, i, formatNode(gotMethod), formatNode(wantMethod))
				}
			}
		})
	}
	t.Run("direct field maps", func(t *testing.T) {
		checkFields := func(value any, expected map[string]reflect.Type) {
			t.Helper()
			typ := reflect.TypeOf(value)
			if typ.Kind() == reflect.Pointer {
				typ = typ.Elem()
			}
			if typ.NumField() != len(expected) {
				t.Fatalf("%s has %d fields, want %d", typ.Name(), typ.NumField(), len(expected))
			}
			for name, want := range expected {
				field, ok := typ.FieldByName(name)
				if !ok || field.Type != want || field.Anonymous || field.Tag != "" {
					t.Errorf("%s.%s = %v, want %v without tags", typ.Name(), name, field.Type, want)
				}
			}
		}
		checkFields(ProductReadRepos{}, map[string]reflect.Type{
			"Arc": reflect.TypeFor[ArcReadRepository](), "Quest": reflect.TypeFor[QuestReadRepository](),
			"Batch": reflect.TypeFor[ProductBatchRepository](), "DocumentAudience": reflect.TypeFor[document.ReferenceAudienceReader](),
			"RewardCoverage": reflect.TypeFor[RewardDecisionCoverageReader](),
		})
		checkFields(ProductCommandRepos{}, map[string]reflect.Type{
			"Arc": reflect.TypeFor[ArcWriteRepository](), "Quest": reflect.TypeFor[QuestWriteRepository](),
			"Policy": reflect.TypeFor[*auth.Policy](), "Authority": reflect.TypeFor[auth.AuthorityResolver](),
			"Replay": reflect.TypeFor[idempotency.Repository](), "Producer": reflect.TypeFor[notification.EventProducer](),
			"Notice": reflect.TypeFor[notification.ProducerRepos](), "Audit": reflect.TypeFor[auth.OverrideRecorder](),
			"Characters": reflect.TypeFor[character.AdmissionReader](), "Brief": reflect.TypeFor[document.BriefWriter](),
			"Summaries": reflect.TypeFor[document.SummaryWriter](), "Places": reflect.TypeFor[spatial.PlaceReader](),
			"Jobs": reflect.TypeFor[jobs.Writer](), "Tags": reflect.TypeFor[TagNormalizer](),
			"Withdrawals": reflect.TypeFor[character.QuestWithdrawalWriter](),
		})
		checkFields(NormalizedVocabulary{}, map[string]reflect.Type{"Tags": reflect.TypeFor[[]string](), "Genres": reflect.TypeFor[[]string]()})
		checkFields(RewardDecisionCoverage{}, map[string]reflect.Type{"QuestID": reflect.TypeFor[string](), "Closed": reflect.TypeFor[bool](), "HasFullClosureDecision": reflect.TypeFor[bool]()})
		if TagKindTags != TagKind("tags") || TagKindGenres != TagKind("genres") {
			t.Fatalf("TagKind values do not match the contract")
		}
	})
}
