package contract_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Loop commands and ingest. The rest of field-routing.md is out of this pass.
var loopOperations = []string{
	"POST /v1/quests",
	"POST /v1/quests/{id}/transition",
	"POST /v1/quests/{id}/close",
	"POST /v1/quests/{id}/signup",
	"POST /v1/quests/{id}/discord/sync",
	"POST /v1/ingest/discord-event",
	"POST /v1/ingest/heartbeat",
}

func TestLoopFieldRoutingIsOnMuxAndOpenAPI(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(contractsDir(t), "field-routing.md"))
	if err != nil {
		t.Fatal(err)
	}
	doc := string(raw)
	for _, path := range []string{
		"`POST /v1/quests`",
		"`POST /v1/quests/{id}/transition`",
		"`POST /v1/quests/{id}/close`",
		"`POST /v1/quests/{id}/signup`",
		"`POST /v1/quests/{id}/discord/sync`",
		"`POST /v1/ingest/discord-event`",
		"`POST /v1/ingest/heartbeat`",
	} {
		if !strings.Contains(doc, path) {
			t.Errorf("field-routing.md missing %s", path)
		}
	}

	openapi := map[string]struct{}{}
	for _, op := range loadOpenAPIOperations(t) {
		openapi[op] = struct{}{}
	}
	mux := map[string]struct{}{}
	for _, op := range mountMuxOperations(t) {
		mux[op] = struct{}{}
	}
	for _, op := range loopOperations {
		// Ingest stays in OpenAPI; product quest loop is GraphQL-first and
		// allowlisted on the mux until REST handlers are removed.
		if strings.HasPrefix(op, "POST /v1/ingest/") {
			if _, ok := openapi[op]; !ok {
				t.Errorf("OpenAPI missing %s", op)
			}
			if _, hidden := muxOnlyAllowlist[op]; hidden {
				t.Errorf("%s must not be hidden on the mux allowlist", op)
			}
		} else if _, hidden := muxOnlyAllowlist[op]; !hidden {
			t.Errorf("%s must stay on muxOnlyAllowlist until REST product routes are deleted", op)
		}
		if _, ok := mux[op]; !ok {
			t.Errorf("mux missing %s", op)
		}
	}
}
