package contract_test

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/ingest"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
	"gopkg.in/yaml.v3"
)

// HTTP methods we care about on the public surface.
var httpMethods = []string{"get", "post", "put", "patch", "delete"}

// muxOnlyAllowlist: /v1 routes registered in Go but not yet listed under
// openapi.yaml paths. Quest loop + ingest paths must NOT appear here — they
// are real OpenAPI entries. Keep this list shrinking as OpenAPI catches up.
var muxOnlyAllowlist = map[string]struct{}{
	"POST /v1/graphql":                 {}, // described in openapi info; not a REST path entry
	"GET /v1/documents/{id}/revisions": {}, // field-routing; OpenAPI pending
	"GET /v1/documents/trash":          {}, // field-routing; OpenAPI pending
}

func TestOpenAPIMatchesMux(t *testing.T) {
	openapiOps := loadOpenAPIOperations(t)
	muxOps := mountMuxOperations(t)

	openapiSet := map[string]struct{}{}
	for _, op := range openapiOps {
		openapiSet[op] = struct{}{}
	}
	muxSet := map[string]struct{}{}
	for _, op := range muxOps {
		muxSet[op] = struct{}{}
	}

	var missingOnMux []string
	for _, op := range openapiOps {
		if _, ok := muxSet[op]; !ok {
			missingOnMux = append(missingOnMux, op)
		}
	}
	if len(missingOnMux) > 0 {
		t.Fatalf("OpenAPI operations missing on mux:\n  %s", strings.Join(missingOnMux, "\n  "))
	}

	var missingInOpenAPI []string
	for _, op := range muxOps {
		if !strings.Contains(op, " /v1/") && !strings.HasSuffix(op, " /v1") {
			// Unversioned routes (/health, /auth/*) need not be in OpenAPI for the reverse check,
			// but they currently are — only enforce /v1 → OpenAPI.
			continue
		}
		if _, ok := openapiSet[op]; ok {
			continue
		}
		if _, ok := muxOnlyAllowlist[op]; ok {
			continue
		}
		missingInOpenAPI = append(missingInOpenAPI, op)
	}
	if len(missingInOpenAPI) > 0 {
		t.Fatalf("mux /v1 routes missing from OpenAPI (add to openapi.yaml or muxOnlyAllowlist):\n  %s",
			strings.Join(missingInOpenAPI, "\n  "))
	}
}

func TestMuxOnlyAllowlistStillRegistered(t *testing.T) {
	muxSet := map[string]struct{}{}
	for _, op := range mountMuxOperations(t) {
		muxSet[op] = struct{}{}
	}
	for op := range muxOnlyAllowlist {
		if _, ok := muxSet[op]; !ok {
			t.Errorf("allowlisted op %q not registered on mux — remove from muxOnlyAllowlist", op)
		}
	}
}

func TestMemberMeCanonicalOpenAPIShape(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(contractsDir(t), "openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	type schema struct {
		Type      string `yaml:"type"`
		Format    string `yaml:"format"`
		MinLength int    `yaml:"minLength"`
		Items     struct {
			Type string `yaml:"type"`
		} `yaml:"items"`
	}
	var doc struct {
		Paths map[string]map[string]struct {
			ID        string                `yaml:"operationId"`
			Security  []map[string][]string `yaml:"security"`
			Responses map[string]struct {
				Ref     string `yaml:"$ref"`
				Content map[string]struct {
					Schema struct {
						Ref string `yaml:"$ref"`
					} `yaml:"schema"`
				} `yaml:"content"`
			} `yaml:"responses"`
		} `yaml:"paths"`
		Components struct {
			// Other OpenAPI 3.1 schemas may use nullable type arrays. Decode
			// only the canonical me schema into the strict nonnullable shape.
			Schemas map[string]yaml.Node `yaml:"schemas"`
		} `yaml:"components"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	op := doc.Paths["/v1/members/me"]["get"]
	if op.ID != "memberMe" || len(op.Security) != 1 {
		t.Fatal("me operation/security missing")
	}
	if roles, ok := op.Security[0]["bearer"]; !ok || len(roles) != 0 || len(op.Security[0]) != 1 {
		t.Fatal("me bearer security changed")
	}
	if op.Responses["200"].Content["application/json"].Schema.Ref != "#/components/schemas/MemberMe" {
		t.Fatal("me success does not use canonical schema")
	}
	for _, code := range []string{"401", "403", "404", "500"} {
		if op.Responses[code].Ref != "#/components/responses/Problem" {
			t.Fatalf("me %s must use existing Problem", code)
		}
	}
	node, ok := doc.Components.Schemas["MemberMe"]
	if !ok {
		t.Fatal("canonical me schema missing")
	}
	var s struct {
		Type                 string            `yaml:"type"`
		AdditionalProperties *bool             `yaml:"additionalProperties"`
		Required             []string          `yaml:"required"`
		Properties           map[string]schema `yaml:"properties"`
	}
	if err := node.Decode(&s); err != nil {
		t.Fatalf("me must have the exact nonnullable schema: %v", err)
	}
	sort.Strings(s.Required)
	keys := []string{}
	for key := range s.Properties {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	want := "displayName,handle,id,roles"
	if s.Type != "object" || s.AdditionalProperties == nil || *s.AdditionalProperties || strings.Join(s.Required, ",") != want || strings.Join(keys, ",") != want {
		t.Fatal("me must have exactly four required properties and no extras")
	}
	if s.Properties["id"].Type != "string" || s.Properties["id"].Format != "uuid" || s.Properties["handle"].Type != "string" || s.Properties["handle"].MinLength != 1 || s.Properties["displayName"].Type != "string" || s.Properties["displayName"].MinLength != 1 || s.Properties["roles"].Type != "array" || s.Properties["roles"].Items.Type != "string" {
		t.Fatal("me property shape differs from existing adapter")
	}
	if _, ok := muxOnlyAllowlist["GET /v1/members/me"]; ok {
		t.Fatal("canonical me route cannot retain parity exception")
	}
}

func mountMuxOperations(t *testing.T) []string {
	t.Helper()
	mux := httpserver.NewRecordingMux()
	cmd := quest.NewCommands(quest.MemoryRunner(), time.Now)
	app.Mount(mux, app.HTTPDeps{
		Resolver:  &graph.Resolver{Services: graph.Services{QuestCmd: cmd}},
		QuestCmd:  cmd,
		SiteStats: func() site.Stats { return site.Stats{} },
		MemberMe: func(id string) (member.Member, error) {
			return member.Member{ID: id, Handle: "me", DisplayName: "Me", Status: member.StatusActive}, nil
		},
		Login: login.New(login.Config{
			ClientID:     "test",
			ClientSecret: "dev",
			RedirectURI:  "http://localhost/auth/discord/callback",
			JWTSecret:    "test-secret",
		}, login.StaticMemberStore{}),
		Ingest:      ingest.New("test-ingest", &ingest.MemoryStore{}),
		Agent:       agent.New("test-ingest", nil),
		SpatialTime: spatial.EmptyTimeMap{},
	})
	out := append([]string(nil), mux.Patterns...)
	sort.Strings(out)
	return out
}

func loadOpenAPIOperations(t *testing.T) []string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(contractsDir(t), "openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	var ops []string
	for path, methods := range doc.Paths {
		for _, m := range httpMethods {
			if _, ok := methods[m]; ok {
				ops = append(ops, strings.ToUpper(m)+" "+path)
			}
		}
	}
	sort.Strings(ops)
	if len(ops) == 0 {
		t.Fatal("openapi.yaml produced zero operations")
	}
	return ops
}
