package contract_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNotificationsUnreadCountCanonicalRoutingOpenAPIAndMount(t *testing.T) {
	const path = "/v1/me/notifications/unread-count"
	const operation = "GET " + path
	routing, err := os.ReadFile(filepath.Join(contractsDir(t), "field-routing.md"))
	if err != nil {
		t.Fatal(err)
	}
	mapped := false
	for _, line := range strings.Split(string(routing), "\n") {
		if strings.Contains(line, "myUnreadNotificationCount") && strings.Contains(line, "`"+operation+"`") {
			mapped = true
		}
	}
	if !mapped {
		t.Fatal("unread count lost canonical REST routing")
	}
	registrations := 0
	for _, got := range mountMuxOperations(t) {
		if got == operation {
			registrations++
		}
	}
	if registrations != 1 {
		t.Fatalf("unread count registrations=%d want=1", registrations)
	}
	if _, excepted := muxOnlyAllowlist[operation]; !excepted {
		t.Fatal("transitional REST unread-count must stay on muxOnlyAllowlist until deleted")
	}
	schema, err := os.ReadFile(filepath.Join(contractsDir(t), "schema.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(schema), "myUnreadNotificationCount:") {
		t.Fatal("myUnreadNotificationCount GraphQL query missing")
	}
}
