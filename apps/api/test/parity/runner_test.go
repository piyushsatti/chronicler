package parity_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestQuestTransitionFixtureShape(t *testing.T) {
	path := filepath.Join("fixtures", "quest.transition.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Request struct {
			Method string `json:"method"`
			Path   string `json:"path"`
		} `json:"request"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Request.Path != "/v1/quests/{id}/transition" {
		t.Fatalf("path = %q", doc.Request.Path)
	}
}
