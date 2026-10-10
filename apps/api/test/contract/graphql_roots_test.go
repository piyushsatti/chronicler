package contract_test

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"unicode"

	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
)

func TestGraphQLRootsMatchExecutableSchema(t *testing.T) {
	rootsPath := filepath.Join(contractsDir(t), "graphql", "roots.graphql")
	raw, err := os.ReadFile(rootsPath)
	if err != nil {
		t.Fatal(err)
	}
	exec := graph.NewExecutableSchema(graph.Config{Resolvers: &graph.Resolver{}})
	execSchema := exec.Schema()

	cases := []struct {
		root string
		got  *ast.Definition
	}{
		{"Query", execSchema.Query},
		{"Mutation", execSchema.Mutation},
	}
	for _, tc := range cases {
		t.Run(tc.root, func(t *testing.T) {
			want := fieldNamesFromRootsSource(t, string(raw), tc.root)
			got := fieldNames(tc.got)
			if tc.root == "Mutation" && len(want) == 0 {
				if len(got) > 0 {
					t.Fatalf("executable schema has Mutation fields %v but roots.graphql has no Mutation", got)
				}
				return
			}
			if tc.root == "Query" && len(want) == 0 {
				t.Fatal("roots.graphql has no Query fields")
			}
			if missing := diffSorted(want, got); len(missing) > 0 {
				t.Fatalf("roots.graphql %s fields missing from gqlgen schema:\n  %s",
					tc.root, strings.Join(missing, "\n  "))
			}
		})
	}
}

func TestGraphQLQueryResolverImplementsRoots(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(contractsDir(t), "graphql", "roots.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	fields := fieldNamesFromRootsSource(t, string(raw), "Query")
	qr := reflect.TypeOf((*graph.QueryResolver)(nil)).Elem()
	methods := map[string]struct{}{}
	for i := 0; i < qr.NumMethod(); i++ {
		methods[qr.Method(i).Name] = struct{}{}
	}

	var missing []string
	for _, field := range fields {
		goName := gqlFieldToGoMethod(field)
		if _, ok := methods[goName]; !ok {
			missing = append(missing, field+" → "+goName)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("QueryResolver missing methods for roots.graphql fields:\n  %s", strings.Join(missing, "\n  "))
	}
}

func fieldNames(def *ast.Definition) []string {
	if def == nil {
		return nil
	}
	var names []string
	for _, f := range def.Fields {
		if strings.HasPrefix(f.Name, "__") {
			continue
		}
		names = append(names, f.Name)
	}
	sort.Strings(names)
	return names
}

func fieldNamesFromRootsSource(t *testing.T, src, typeName string) []string {
	t.Helper()
	schema := loadContractsGraphQL(t)
	all := fieldNames(schema.Types[typeName])
	var out []string
	for _, name := range all {
		if strings.Contains(src, "\n  "+name+"(") || strings.Contains(src, "\n  "+name+":") {
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

func loadContractsGraphQL(t *testing.T) *ast.Schema {
	t.Helper()
	dir := filepath.Join(contractsDir(t), "graphql")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var sources []*ast.Source
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".graphql") {
			continue
		}
		path := filepath.Join(dir, e.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		sources = append(sources, &ast.Source{Name: path, Input: string(raw)})
	}
	schema, err := gqlparser.LoadSchema(sources...)
	if err != nil {
		t.Fatalf("load contracts graphql: %v", err)
	}
	return schema
}

func gqlFieldToGoMethod(field string) string {
	var b strings.Builder
	upperNext := true
	for _, r := range field {
		if r == '_' {
			upperNext = true
			continue
		}
		if upperNext {
			b.WriteRune(unicode.ToUpper(r))
			upperNext = false
			continue
		}
		b.WriteRune(r)
	}
	name := b.String()
	// gqlgen maps trailing/embedded "Id" → "ID" (documentById → DocumentByID).
	name = strings.ReplaceAll(name, "Id", "ID")
	return name
}

func diffSorted(want, have []string) []string {
	set := map[string]struct{}{}
	for _, h := range have {
		set[h] = struct{}{}
	}
	var missing []string
	for _, w := range want {
		if _, ok := set[w]; !ok {
			missing = append(missing, w)
		}
	}
	return missing
}
