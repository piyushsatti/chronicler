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
	rootsPath := filepath.Join(contractsDir(t), "graphql", "_roots.graphql")
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
			if len(want) == 0 {
				// M1: product fields live on domain extend blocks; _roots may hold placeholders only.
				return
			}
			if missing := diffSorted(want, got); len(missing) > 0 {
				t.Fatalf("_roots.graphql %s fields missing from gqlgen schema:\n  %s",
					tc.root, strings.Join(missing, "\n  "))
			}
		})
	}
}

func TestGraphQLQueryResolverImplementsRoots(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(contractsDir(t), "graphql", "_roots.graphql"))
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
		t.Fatalf("QueryResolver missing methods for _roots.graphql fields:\n  %s", strings.Join(missing, "\n  "))
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
		if name == "_contractLayoutStub" {
			continue
		}
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
	var sources []*ast.Source
	var walk func(string)
	walk = func(current string) {
		entries, err := os.ReadDir(current)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range entries {
			path := filepath.Join(current, e.Name())
			if e.IsDir() {
				walk(path)
				continue
			}
			if !strings.HasSuffix(e.Name(), ".graphql") {
				continue
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			sources = append(sources, &ast.Source{Name: path, Input: string(raw)})
		}
	}
	walk(dir)
	sort.Slice(sources, func(i, j int) bool {
		return sources[i].Name < sources[j].Name
	})
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
