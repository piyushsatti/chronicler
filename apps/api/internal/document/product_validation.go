package document

import (
	"encoding/json"
	"strings"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func validateDocumentCategory(kind string, category *string) error {
	if kind != "codex_entry" {
		return nil
	}
	if category != nil {
		switch *category {
		// Entities and Feature are plain categories (D2): ungated like NPC/Faction.
		// Only Locations carries region-linked archon gating.
		case "Artifact", "Event", "Lore", "NPC", "Faction", "Locations", "Entities", "Feature":
			return nil
		}
	}
	return apierr.New(apierr.Invalid, "invalid Codex category")
}

func validateDocumentTitle(title string) error {
	if strings.TrimSpace(title) == "" || utf8.RuneCountInString(title) > 200 {
		return apierr.New(apierr.Invalid, "invalid document title")
	}
	return nil
}

func validateDocumentBody(body string) error {
	if len(body) > 128*1024 {
		return apierr.New(apierr.Invalid, "document body exceeds 128 KiB")
	}
	return nil
}

func validateDocumentFrontmatter(raw json.RawMessage) error {
	var value map[string]json.RawMessage
	if err := json.Unmarshal(raw, &value); err != nil || value == nil {
		return apierr.New(apierr.Invalid, "document frontmatter must be an object")
	}
	return nil
}

func validateDocumentEdit(input DocumentEditFields) error {
	if input.ExpectedRevision < 1 {
		return apierr.New(apierr.Invalid, "document version required")
	}
	if input.Body.Set && input.Body.Value == nil {
		return apierr.New(apierr.Invalid, "document body cannot be null")
	}
	if input.Body.Set {
		if err := validateDocumentBody(*input.Body.Value); err != nil {
			return err
		}
	}
	if input.Title.Set {
		if input.Title.Value == nil {
			return apierr.New(apierr.Invalid, "document title cannot be null")
		}
		if err := validateDocumentTitle(*input.Title.Value); err != nil {
			return err
		}
	}
	if input.Frontmatter.Set {
		if input.Frontmatter.Value == nil {
			return apierr.New(apierr.Invalid, "document frontmatter cannot be null")
		}
		return validateDocumentFrontmatter(*input.Frontmatter.Value)
	}
	return nil
}

func validateDocumentVisibility(visibility string) error {
	switch visibility {
	case "public", "dm_only", "restricted":
		return nil
	default:
		return apierr.New(apierr.Invalid, "invalid document visibility")
	}
}

func validateDocumentAudience(input DocumentAudienceFields) error {
	if err := validateDocumentVisibility(input.Visibility); err != nil {
		return err
	}
	if !input.Policy.Set || input.Policy.Value == nil {
		return nil
	}
	policy, err := policyBytes(*input.Policy.Value)
	if err != nil {
		return err
	}
	if policy != nil && !Specify(Document{Policy: policy}).valid {
		return apierr.New(apierr.Invalid, "invalid document audience policy")
	}
	return nil
}
