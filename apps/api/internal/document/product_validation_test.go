package document

import (
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestValidateDocumentCategoryCodexAllowList(t *testing.T) {
	for _, category := range []string{"Artifact", "Event", "Lore", "NPC", "Faction", "Locations", "Entities", "Feature"} {
		category := category
		if err := validateDocumentCategory("codex_entry", &category); err != nil {
			t.Fatalf("category %q rejected: %v", category, err)
		}
	}
	for _, category := range []string{"", "Rules", "feature", "Hex"} {
		category := category
		err := validateDocumentCategory("codex_entry", &category)
		var apiErr *apierr.Error
		if !errors.As(err, &apiErr) || apiErr.Code != apierr.Invalid {
			t.Fatalf("category %q: want Invalid, got %v", category, err)
		}
	}
	if err := validateDocumentCategory("codex_entry", nil); err == nil {
		t.Fatal("nil codex category accepted")
	}
	if err := validateDocumentCategory("rule", nil); err != nil {
		t.Fatalf("non-codex kind must not require a category: %v", err)
	}
}
