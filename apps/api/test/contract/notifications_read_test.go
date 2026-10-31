package contract_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNotificationsMarkReadUsesGraphQLWithoutLegacyMount(t *testing.T) {
	const operation = "POST /v1/me/notifications/read"
	for _, op := range mountMuxOperations(t) {
		if op == operation {
			t.Fatal("legacy mark-read route remains mounted")
		}
	}
	if _, ok := muxOnlyAllowlist[operation]; ok {
		t.Fatal("retired mark-read route remains allowlisted")
	}
	routing, err := os.ReadFile(filepath.Join(contractsDir(t), "field-routing.md"))
	if err != nil {
		t.Fatal(err)
	}
	mapped := false
	for _, line := range strings.Split(string(routing), "\n") {
		if strings.Contains(line, "`"+operation+"`") && strings.Contains(line, "GraphQL Mutation.markNotificationsRead") {
			mapped = true
		}
	}
	if !mapped {
		t.Fatal("retired REST operation lost its GraphQL replacement mapping")
	}
	schema, err := os.ReadFile(filepath.Join(contractsDir(t), "schema.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(schema), "markNotificationsRead(") {
		t.Fatal("markNotificationsRead GraphQL mutation missing")
	}
}
