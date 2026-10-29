package contract_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Ingest retains its HTTP protocol after product commands move to GraphQL.
var loopOperations = []string{
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
		if _, ok := openapi[op]; !ok {
			t.Errorf("OpenAPI missing %s", op)
		}
		if _, hidden := muxOnlyAllowlist[op]; hidden {
			t.Errorf("%s must not be hidden on the mux allowlist", op)
		}
		if _, ok := mux[op]; !ok {
			t.Errorf("mux missing %s", op)
		}
	}
}
