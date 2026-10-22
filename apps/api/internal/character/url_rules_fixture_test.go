package character

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The web client keeps UX-only copies of these rules; both suites run the same
// vectors from packages/contracts so any drift fails CI.
type urlRuleVectors struct {
	DdbCharacterURL struct {
		Valid   []string `json:"valid"`
		Invalid []string `json:"invalid"`
	} `json:"ddbCharacterUrl"`
	CharacterImageURL struct {
		MaxLength    int      `json:"max_length"`
		LengthPrefix string   `json:"length_prefix"`
		Valid        []string `json:"valid"`
		Invalid      []string `json:"invalid"`
	} `json:"characterImageUrl"`
}

func loadURLRuleVectors(t *testing.T) urlRuleVectors {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "contracts", "fixtures", "url-rules.v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var vectors urlRuleVectors
	if err := json.Unmarshal(raw, &vectors); err != nil {
		t.Fatal(err)
	}
	if len(vectors.DdbCharacterURL.Valid) == 0 || len(vectors.DdbCharacterURL.Invalid) == 0 || len(vectors.CharacterImageURL.Valid) == 0 || len(vectors.CharacterImageURL.Invalid) == 0 || vectors.CharacterImageURL.MaxLength == 0 {
		t.Fatal("url rule vectors incomplete")
	}
	return vectors
}

func TestDdbCharacterURLSharedVectors(t *testing.T) {
	vectors := loadURLRuleVectors(t)
	for _, value := range vectors.DdbCharacterURL.Valid {
		if _, err := canonicalDdbCharacterID(value); err != nil {
			t.Errorf("valid DDB URL %q rejected: %v", value, err)
		}
	}
	for _, value := range vectors.DdbCharacterURL.Invalid {
		if _, err := canonicalDdbCharacterID(value); err == nil {
			t.Errorf("invalid DDB URL %q accepted", value)
		}
	}
}

func TestCharacterImageURLSharedVectors(t *testing.T) {
	vectors := loadURLRuleVectors(t)
	image := vectors.CharacterImageURL
	padded := func(length int) string {
		return image.LengthPrefix + strings.Repeat("a", length-len(image.LengthPrefix))
	}
	for _, value := range append(image.Valid, padded(image.MaxLength)) {
		if err := validateCharacterImageURL(value); err != nil {
			t.Errorf("valid image URL %q rejected: %v", value, err)
		}
	}
	for _, value := range append(image.Invalid, padded(image.MaxLength+1)) {
		if err := validateCharacterImageURL(value); err == nil {
			t.Errorf("invalid image URL %q accepted", value)
		}
	}
}
