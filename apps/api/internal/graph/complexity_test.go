package graph_test

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/99designs/gqlgen/complexity"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	platformgraphql "github.com/piyushsatti/chronicler/apps/api/internal/platform/graphql"
	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/validator"
)

func TestSupportedWebOperationsFitDefaultComplexityBudget(t *testing.T) {
	es := graph.NewExecutableSchema(graph.Config{Resolvers: &graph.Resolver{}, Complexity: graph.ListComplexity()})
	operations := 0
	maxCost, maxOperation := 0, ""
	err := filepath.WalkDir("../../../web/src", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || filepath.Ext(path) != ".graphql" {
			return nil
		}
		source, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		doc, errs := gqlparser.LoadQueryWithRules(es.Schema(), string(source), nil)
		if len(errs) != 0 {
			t.Errorf("%s: %v", path, errs)
			return nil
		}
		for _, op := range doc.Operations {
			operations++
			t.Run(op.Name, func(t *testing.T) {
				vars := map[string]any{}
				for _, variable := range op.VariableDefinitions {
					vars[variable.Variable] = sampleValue(es.Schema(), variable.Type)
					// Flat pages use the web's largest page size as a conservative envelope.
					if strings.HasSuffix(strings.ToLower(variable.Variable), "limit") {
						vars[variable.Variable] = 200
						switch op.Name {
						case "QuestBoard", "QuestList": // useQuestBoardPage.ts PAGE_SIZE
							vars[variable.Variable] = 50
						case "AdminOperations": // useAdminOperations.ts
							vars[variable.Variable] = 25
						case "MemberUpcoming": // memberHubAdapter.ts UPCOMING_PAGE_SIZE
							vars[variable.Variable] = 100
						}
					}
					if strings.HasSuffix(strings.ToLower(variable.Variable), "offset") {
						vars[variable.Variable] = 0
					}
				}
				coerced, err := validator.VariableValues(es.Schema(), op, vars)
				if err != nil {
					t.Fatal(err)
				}
				cost := complexity.Calculate(context.Background(), es, op, coerced)
				t.Logf("cost=%d", cost)
				if cost > maxCost {
					maxCost, maxOperation = cost, op.Name
				}
				if cost > platformgraphql.DefaultLimits().MaxComplexity {
					t.Errorf("cost %d exceeds default budget %d", cost, platformgraphql.DefaultLimits().MaxComplexity)
				}
			})
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if operations == 0 {
		t.Fatal("no checked-in web operations found")
	}
	t.Logf("validated and costed %d checked-in web operations; maximum %s=%d", operations, maxOperation, maxCost)
}

func sampleValue(schema *ast.Schema, typ *ast.Type) any {
	if typ.Elem != nil {
		return []any{}
	}
	definition := schema.Types[typ.Name()]
	if definition.Kind == ast.InputObject {
		value := map[string]any{}
		for _, field := range definition.Fields {
			if field.Type.NonNull && field.DefaultValue == nil {
				value[field.Name] = sampleValue(schema, field.Type)
			}
		}
		return value
	}
	if definition.Kind == ast.Enum {
		return definition.EnumValues[0].Name
	}
	switch typ.Name() {
	case "Int":
		return 1
	case "Float":
		return 1.0
	case "Boolean":
		return true
	case "ID":
		return "11111111-1111-4111-8111-111111111111"
	case "Date":
		return "2026-10-29"
	case "Time":
		return "12:00:00"
	case "DateTime":
		return "2026-10-29T12:00:00Z"
	case "JSON":
		return map[string]any{}
	default:
		return "sample"
	}
}

func TestListComplexityWeightsEveryPaginatedRead(t *testing.T) {
	es := graph.NewExecutableSchema(graph.Config{Resolvers: &graph.Resolver{}, Complexity: graph.ListComplexity()})
	for name, definition := range es.Schema().Types {
		if definition.Kind != ast.Object || strings.HasPrefix(name, "__") || name == "Mutation" {
			continue
		}
		for _, field := range definition.Fields {
			if field.Arguments.ForName("limit") == nil {
				continue
			}
			t.Run(name+"."+field.Name, func(t *testing.T) {
				args := map[string]any{}
				for _, arg := range field.Arguments {
					if arg.Type.NonNull {
						args[arg.Name] = sampleValue(es.Schema(), arg.Type)
					}
				}
				args["limit"] = 10
				cost, ok := es.Complexity(context.Background(), name, field.Name, 2, args)
				if !ok || cost != 21 {
					t.Fatalf("cost=%d configured=%v, want 21", cost, ok)
				}
			})
		}
	}
}

func TestListComplexitySaturatesAndChargesPageOnce(t *testing.T) {
	es := graph.NewExecutableSchema(graph.Config{Resolvers: &graph.Resolver{}, Complexity: graph.ListComplexity()})
	for _, tc := range []struct {
		query string
		want  int
	}{
		{`{questArcs(limit: 10){items{id} total}}`, 31},
		{`{questArc(id:"11111111-1111-4111-8111-111111111111"){quests(limit:0){id shortCode}}}`, 4},
		{`{questArc(id:"11111111-1111-4111-8111-111111111111"){quests(limit:-1){id shortCode}}}`, 4},
		{`{home{recentByCategory{documents{id}}}}`, 38},
		{`{questArc(id:"11111111-1111-4111-8111-111111111111"){quests(limit: 2147483647){arc{quests(limit: 2147483647){id shortCode status}}}}}`, int(^uint(0) >> 1)},
	} {
		doc, errs := gqlparser.LoadQueryWithRules(es.Schema(), tc.query, nil)
		if len(errs) > 0 {
			t.Fatal(errs)
		}
		if got := complexity.Calculate(context.Background(), es, doc.Operations[0], nil); got != tc.want {
			t.Errorf("cost=%d want=%d query=%s", got, tc.want, tc.query)
		}
	}
}
