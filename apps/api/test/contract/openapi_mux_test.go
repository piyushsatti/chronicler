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
	"POST /v1/graphql":                       {}, // described in openapi info; not a REST path entry
	"GET /v1/members/me":                     {}, // field-routing; OpenAPI pending
	"GET /v1/documents/{id}/revisions":       {}, // field-routing; OpenAPI pending
	"GET /v1/documents/trash":                {}, // field-routing; OpenAPI pending
	"POST /v1/agent/questions/{id}/complete": {}, // agent completion; OpenAPI pending until agent ships
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

func mountMuxOperations(t *testing.T) []string {
	t.Helper()
	mux := httpserver.NewRecordingMux()
	cmd := quest.NewCommands(quest.MemoryRunner(), time.Now)
	app.Mount(mux, app.HTTPDeps{
		Resolver: &graph.Resolver{Services: graph.Services{QuestCmd: cmd}},
		QuestCmd: cmd,
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
