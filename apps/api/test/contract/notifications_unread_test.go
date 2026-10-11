package contract_test

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
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
	if _, excepted := muxOnlyAllowlist[operation]; excepted {
		t.Fatal("unread count cannot use a parity exception")
	}
	raw, err := os.ReadFile(filepath.Join(contractsDir(t), "openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Paths map[string]map[string]struct {
			ID          string                `yaml:"operationId"`
			Security    []map[string][]string `yaml:"security"`
			Parameters  []yaml.Node           `yaml:"parameters"`
			RequestBody yaml.Node             `yaml:"requestBody"`
			Responses   map[string]struct {
				Ref     string `yaml:"$ref"`
				Content map[string]struct {
					Schema yaml.Node `yaml:"schema"`
				} `yaml:"content"`
			} `yaml:"responses"`
		} `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	methods := doc.Paths[path]
	op := methods["get"]
	if len(methods) != 1 || op.ID != "myUnreadNotificationCount" || len(op.Security) != 1 || len(op.Security[0]) != 1 || len(op.Parameters) != 0 || op.RequestBody.Kind != 0 {
		t.Fatal("count method/identity/security/inputs differ from approved seam")
	}
	scopes, ok := op.Security[0]["bearer"]
	if !ok || len(scopes) != 0 {
		t.Fatal("count must use existing bearer security")
	}
	codes := []string{}
	for code := range op.Responses {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	if !reflect.DeepEqual(codes, []string{"200", "401", "403", "500"}) {
		t.Fatalf("count responses=%v", codes)
	}
	for _, code := range []string{"401", "403", "500"} {
		if op.Responses[code].Ref != "#/components/responses/Problem" {
			t.Fatalf("count%s does not use existing Problem", code)
		}
	}
	success := op.Responses["200"]
	if len(success.Content) != 1 || success.Ref != "" {
		t.Fatal("count must have one inline application/json success")
	}
	node := success.Content["application/json"].Schema
	var schema struct {
		Ref                  string   `yaml:"$ref"`
		Type                 string   `yaml:"type"`
		AdditionalProperties *bool    `yaml:"additionalProperties"`
		Required             []string `yaml:"required"`
		Properties           map[string]struct {
			Type    string   `yaml:"type"`
			Minimum *float64 `yaml:"minimum"`
		} `yaml:"properties"`
	}
	if err := node.Decode(&schema); err != nil {
		t.Fatal(err)
	}
	count, hasCount := schema.Properties["count"]
	if schema.Ref != "" || schema.Type != "object" || schema.AdditionalProperties == nil || *schema.AdditionalProperties || !reflect.DeepEqual(schema.Required, []string{"count"}) || len(schema.Properties) != 1 || !hasCount || count.Type != "integer" || count.Minimum == nil || *count.Minimum != 0 {
		t.Fatal("success must be exactly {count: nonnegative integer} with no extra fields")
	}
}
