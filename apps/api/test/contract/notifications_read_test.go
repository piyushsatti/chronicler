package contract_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNotificationsMarkReadCanonicalContractAndMount(t *testing.T) {
	const path = "/v1/me/notifications/read"
	const operation = "POST " + path
	routing, err := os.ReadFile(filepath.Join(contractsDir(t), "field-routing.md"))
	if err != nil {
		t.Fatal(err)
	}
	mapped := false
	for _, line := range strings.Split(string(routing), "\n") {
		if strings.Contains(line, "markNotificationsRead") && strings.Contains(line, "`"+operation+"`") {
			mapped = true
		}
	}
	if !mapped {
		t.Fatal("mark-read lost canonical REST routing")
	}
	registrations := 0
	for _, op := range mountMuxOperations(t) {
		if op == operation {
			registrations++
		}
	}
	if registrations != 1 {
		t.Fatalf("mark-read registrations=%d", registrations)
	}
	if _, ok := muxOnlyAllowlist[operation]; !ok {
		t.Fatal("transitional REST mark-read must stay on muxOnlyAllowlist until deleted")
	}
	schema, err := os.ReadFile(filepath.Join(contractsDir(t), "schema.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	doc := string(schema)
	if !strings.Contains(doc, "markNotificationsRead(") {
		t.Fatal("markNotificationsRead GraphQL mutation missing")
	}
}
