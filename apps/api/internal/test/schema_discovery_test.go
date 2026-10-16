package test

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/99designs/gqlgen/codegen/config"
	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
)

func TestSchemaDiscovery(t *testing.T) {
	_, here, _, _ := runtime.Caller(0)
	repo := filepath.Clean(filepath.Join(filepath.Dir(here), "../../../.."))
	original, err := os.ReadFile(filepath.Join(repo, "scripts/merge-graphql-schema"))
	if err != nil {
		t.Fatal(err)
	}
	fixture := t.TempDir()
	source := filepath.Join(fixture, "packages/contracts/graphql")
	script := filepath.Join(fixture, "scripts/merge-graphql-schema")
	output := filepath.Join(fixture, "packages/contracts/schema.graphql")
	for _, dir := range []string{filepath.Dir(script), filepath.Join(source, "a"), filepath.Join(source, "z")} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(script, original, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(repo, "node_modules"), filepath.Join(fixture, "node_modules")); err != nil {
		t.Fatal(err)
	}
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(source, name), []byte(body), 0644); err != nil {
			t.Fatal(err)
		}
	}
	run := func(wantSuccess bool) []byte {
		t.Helper()
		cmd := exec.Command("bash", script)
		cmd.Dir = fixture
		b, err := cmd.CombinedOutput()
		if (err == nil) != wantSuccess {
			t.Fatalf("success=%v expected=%v: %s (%v)", err == nil, wantSuccess, b, err)
		}
		return b
	}
	write("z/base.graphql", "type Query { alpha: String }\n")
	write("a/extension.graphql", "extend type Query { beta: Int }\n")
	write("scalars.graphql", "scalar Date\n")
	run(true)
	first, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	run(true)
	second, _ := os.ReadFile(output)
	if !bytes.Equal(first, second) {
		t.Fatal("identical input must produce identical output")
	}
	a, b := bytes.Index(first, []byte("a/extension.graphql")), bytes.Index(first, []byte("z/base.graphql"))
	if a < 0 || b < a {
		t.Fatal("recursive sources missing or unsorted")
	}
	for name, invalid := range map[string]string{"duplicate-field": "extend type Query { alpha: Int }", "duplicate-type": "type Query { gamma: Int }", "syntax": "type Broken {", "undefined": "extend type Query { gamma: Missing }", "empty-source": "", "comment-only-source": "# No definition"} {
		t.Run(name, func(t *testing.T) {
			write("invalid.graphql", invalid)
			run(false)
			after, _ := os.ReadFile(output)
			if !bytes.Equal(first, after) {
				t.Fatal("invalid SDL changed previous output")
			}
			if err := os.Remove(filepath.Join(source, "invalid.graphql")); err != nil {
				t.Fatal(err)
			}
		})
	}
	cfgText := "schema:\n  - " + filepath.ToSlash(source) + "/**/*.graphql\n"
	cfg, err := config.ReadConfig(strings.NewReader(cfgText))
	if err != nil {
		t.Fatal(err)
	}
	discovered := []string{}
	for _, name := range cfg.SchemaFilename {
		rel, err := filepath.Rel(source, name)
		if err != nil {
			t.Fatal(err)
		}
		discovered = append(discovered, filepath.ToSlash(rel))
	}
	sort.Strings(discovered)
	want := []string{"a/extension.graphql", "scalars.graphql", "z/base.graphql"}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf("pinned gqlgen discovery mismatch: %v != %v", discovered, want)
	}
	schema, err := gqlparser.LoadSchema(&ast.Source{Name: "merged", Input: string(first)})
	if err != nil {
		t.Fatal(err)
	}
	server, err := gqlparser.LoadSchema(cfg.Sources...)
	if err != nil {
		t.Fatal(err)
	}
	if len(schema.Query.Fields) != len(server.Query.Fields) || schema.Query.Fields.ForName("beta") == nil {
		t.Fatal("server/client parsed schema mismatch")
	}
	if err := os.Symlink(filepath.Join(source, "z/base.graphql"), filepath.Join(source, "alias.graphql")); err != nil {
		t.Fatal(err)
	}
	run(false)
	after, _ := os.ReadFile(output)
	if !bytes.Equal(first, after) {
		t.Fatal("symlink rejection changed previous output")
	}
	if err := os.Remove(filepath.Join(source, "alias.graphql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range want {
		if err := os.Remove(filepath.Join(source, name)); err != nil {
			t.Fatal(err)
		}
	}
	run(false)
	after, _ = os.ReadFile(output)
	if !bytes.Equal(first, after) {
		t.Fatal("empty discovery changed previous valid output")
	}

}
