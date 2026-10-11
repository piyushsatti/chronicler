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
	if _, ok := muxOnlyAllowlist[operation]; ok {
		t.Fatal("mark-read cannot use a parity exception")
	}
	raw, err := os.ReadFile(filepath.Join(contractsDir(t), "openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Paths map[string]map[string]struct {
			ID          string                `yaml:"operationId"`
			Description string                `yaml:"description"`
			Security    []map[string][]string `yaml:"security"`
			Parameters  []yaml.Node           `yaml:"parameters"`
			RequestBody struct {
				Required bool `yaml:"required"`
				Content  map[string]struct {
					Schema yaml.Node `yaml:"schema"`
				} `yaml:"content"`
			} `yaml:"requestBody"`
			Responses map[string]struct {
				Ref     string `yaml:"$ref"`
				Content map[string]struct {
					Schema struct {
						Ref string `yaml:"$ref"`
					} `yaml:"schema"`
				} `yaml:"content"`
			} `yaml:"responses"`
		} `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	methods := doc.Paths[path]
	op := methods["post"]
	if len(methods) != 1 || op.ID != "markNotificationsRead" || len(op.Security) != 1 || len(op.Security[0]) != 1 || len(op.Parameters) != 0 {
		t.Fatal("mark-read method/identity/security/parameters changed")
	}
	if scopes, ok := op.Security[0]["bearer"]; !ok || len(scopes) != 0 {
		t.Fatal("existing bearer security required")
	}
	if !op.RequestBody.Required || len(op.RequestBody.Content) != 1 {
		t.Fatal("required JSON body missing")
	}
	var schema struct {
		Type                 string   `yaml:"type"`
		AdditionalProperties *bool    `yaml:"additionalProperties"`
		Required             []string `yaml:"required"`
		Properties           map[string]struct {
			Type     string                                 `yaml:"type"`
			MaxItems int                                    `yaml:"maxItems"`
			Items    struct{ Type, Format, Pattern string } `yaml:"items"`
		} `yaml:"properties"`
	}
	node := op.RequestBody.Content["application/json"].Schema
	if err := node.Decode(&schema); err != nil {
		t.Fatal(err)
	}
	ids, ok := schema.Properties["ids"]
	if schema.Type != "object" || schema.AdditionalProperties == nil || *schema.AdditionalProperties || !reflect.DeepEqual(schema.Required, []string{"ids"}) || len(schema.Properties) != 1 || !ok || ids.Type != "array" || ids.MaxItems != 100 || ids.Items.Type != "string" || ids.Items.Format != "uuid" || ids.Items.Pattern != `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` {
		t.Fatal("approved exact bounded UUID body changed")
	}
	if !strings.Contains(op.Description, "8192") || !strings.Contains(op.Description, "duplicate keys") || !strings.Contains(op.Description, "unknown outcome") {
		t.Fatal("wire limits/commit ambiguity must remain documented")
	}
	codes := []string{}
	for code := range op.Responses {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	if !reflect.DeepEqual(codes, []string{"204", "401", "403", "422", "500"}) {
		t.Fatalf("responses=%v", codes)
	}
	success := op.Responses["204"]
	if success.Ref != "" || len(success.Content) != 0 {
		t.Fatal("204 must have no response content")
	}
	for _, code := range []string{"401", "403", "500"} {
		if op.Responses[code].Ref != "#/components/responses/Problem" {
			t.Fatalf("%s must use existing Problem", code)
		}
	}
	invalid := op.Responses["422"]
	if len(invalid.Content) != 1 || invalid.Content["application/problem+json"].Schema.Ref != "#/components/schemas/Problem" {
		t.Fatal("422 must use existing Problem vocabulary")
	}
}
