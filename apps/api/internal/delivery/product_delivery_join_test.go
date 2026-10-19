package delivery_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// D-API-JOIN product-delivery half (fixture-only): API owns Discord product
// delivery GraphQL per D1/D40. The Discord bot must not call these ops
// (apps/discord sensor tests). Opt-in live GraphQL proof:
// TestLiveProductDiscordDelivery (CHRONICLER_LIVE_GRAPHQL_DISCORD=1).
func TestDiscordProductDeliveryOwnedByGraphQL(t *testing.T) {
	contracts := contractsDir(t)

	routing, err := os.ReadFile(filepath.Join(contracts, "field-routing.md"))
	if err != nil {
		t.Fatal(err)
	}
	doc := string(routing)
	cases := []struct {
		restPath string
		graphql  string
	}{
		{"`POST /v1/quests/{id}/discord/sync`", "Mutation.syncQuestDiscord"},
		{"`POST /v1/admin/discord-deliveries/{jobId}/redrive`", "Mutation.redriveDiscordDelivery"},
		{"`GET /v1/config/discord-delivery-mode`", "Query.discordDeliveryMode"},
	}
	for _, tc := range cases {
		if !strings.Contains(doc, tc.restPath) || !strings.Contains(doc, tc.graphql) {
			t.Errorf("field-routing.md missing product Discord seam %s → %s", tc.restPath, tc.graphql)
		}
	}

	schema, err := os.ReadFile(filepath.Join(contracts, "schema.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	gql := string(schema)
	for _, field := range []string{
		"syncQuestDiscord(",
		"redriveDiscordDelivery(",
		"discordDeliveryMode:",
	} {
		if !strings.Contains(gql, field) {
			t.Errorf("schema.graphql missing Discord product field %q", field)
		}
	}

	// Policy admits these as product GraphQL ops (not bot/ingest HTTP).
	const id = "10000000-0000-4000-8000-000000000010"
	if _, err := auth.ForQuest("Mutation.syncQuestDiscord", auth.QuestFacts{ID: id, DMID: id}); err != nil {
		t.Fatalf("syncQuestDiscord policy request: %v", err)
	}
	for _, op := range []auth.Operation{
		"Mutation.redriveDiscordDelivery",
		"Query.discordDeliveryMode",
	} {
		if _, err := auth.ForOperation(op); err != nil {
			t.Fatalf("%s policy request: %v", op, err)
		}
	}
}

func contractsDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// apps/api/internal/delivery → …/chronicler → packages/contracts
	dir := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "packages", "contracts"))
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		t.Fatalf("packages/contracts not found at %s: %v", dir, err)
	}
	return dir
}
