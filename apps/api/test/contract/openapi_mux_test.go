package contract_test

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/ingest"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
	"gopkg.in/yaml.v3"
)

// HTTP methods we care about on the public surface.
var httpMethods = []string{"get", "post", "put", "patch", "delete"}

// muxOnlyAllowlist: product REST routes still mounted on the mux while
// openapi.yaml is GraphQL-first (product REST removed in 9daaef2). Ingest,
// agent, and auth paths remain real OpenAPI entries and must NOT appear here.
// Shrink this list as REST handlers are deleted.
var muxOnlyAllowlist = map[string]struct{}{
	"POST /v1/graphql":                                 {}, // described in openapi info; not a REST path entry
	"GET /v1/documents/{id}/revisions":      {},
	"GET /v1/documents/trash":               {},
	"GET /v1/me/notifications/unread-count": {},
	"GET /v1/members/me":                    {},
	"GET /v1/search/kinds":                  {},
	"GET /v1/stats":                         {},
	"GET /v1/time/game-date":                {},
	"GET /v1/time/real-dates":               {},
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

func TestMemberMeCanonicalGraphQLAndMount(t *testing.T) {
	// Product identity is GraphQL Query.memberMe; REST /v1/members/me remains
	// mounted during transition and is allowlisted out of OpenAPI.
	routing, err := os.ReadFile(filepath.Join(contractsDir(t), "field-routing.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(routing), "`GET /v1/members/me`") || !strings.Contains(string(routing), "Query.memberMe") {
		t.Fatal("memberMe lost canonical field-routing")
	}
	schema, err := os.ReadFile(filepath.Join(contractsDir(t), "schema.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	doc := string(schema)
	if !strings.Contains(doc, "memberMe:") || !strings.Contains(doc, "type MemberType") {
		t.Fatal("memberMe GraphQL surface missing")
	}
	for _, field := range []string{"id: ID!", "handle: String!", "displayName: String!", "roles: [String!]!"} {
		if !strings.Contains(doc, field) {
			t.Fatalf("MemberType missing %s", field)
		}
	}
	registrations := 0
	for _, got := range mountMuxOperations(t) {
		if got == "GET /v1/members/me" {
			registrations++
		}
	}
	if registrations != 1 {
		t.Fatalf("members/me registrations=%d want=1", registrations)
	}
	if _, ok := muxOnlyAllowlist["GET /v1/members/me"]; !ok {
		t.Fatal("transitional REST members/me must stay on muxOnlyAllowlist until deleted")
	}
}

func mountMuxOperations(t *testing.T) []string {
	t.Helper()
	mux := httpserver.NewRecordingMux()
	app.Mount(mux, app.HTTPDeps{
		Resolver:  &graph.Resolver{},
		SiteStats: func(context.Context) (site.Stats, error) { return site.Stats{}, nil },
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
		Agent:       agent.New("test-ingest", nil, false),
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
