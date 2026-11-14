package document

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestFrontmatterFromYAMLMalformed(t *testing.T) {
	_, err := frontmatterFromYAML(pgtype.Text{String: "hex: [unterminated", Valid: true})
	if err == nil {
		t.Fatal("want unmarshal error for malformed YAML")
	}
}

func TestFeatureHexFromFields(t *testing.T) {
	feature, lore := "Feature", "Lore"
	cases := []struct {
		name     string
		kind     string
		category *string
		fm       map[string]any
		want     string
		wantErr  bool
	}{
		{"not a Feature keeps any hex key", "codex_entry", &lore, map[string]any{"hex": "junk"}, "", false},
		{"not a Codex entry", "rule", &feature, nil, "", false},
		{"missing hex", "codex_entry", &feature, map[string]any{}, "", true},
		{"blank hex", "codex_entry", &feature, map[string]any{"hex": "  "}, "", true},
		{"number only", "codex_entry", &feature, map[string]any{"hex": "7008"}, "", true},
		{"wrong type", "codex_entry", &feature, map[string]any{"hex": 7008}, "", true},
		{"centre", "codex_entry", &feature, map[string]any{"hex": "LFC1001"}, "LFC1001", false},
		{"lower case trimmed", "codex_entry", &feature, map[string]any{"hex": " lfr7008 "}, "LFR7008", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := featureHexFromFields(tc.kind, tc.category, tc.fm)
			if (err != nil) != tc.wantErr || got != tc.want {
				t.Fatalf("got %q, %v; want %q, error=%v", got, err, tc.want, tc.wantErr)
			}
		})
	}
}
