package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"unicode/utf16"
)

func TestPhase3TaskS06Acceptance(t *testing.T) {
	t.Run("dated rows survive exact catalog purge", func(t *testing.T) {
		var purge struct {
			Catalog  []line `json:"cosmetic_catalog"`
			Grants   []line `json:"cosmetic_grants"`
			Retained int    `json:"unchanged_old_records"`
			SHA256   string `json:"unchanged_old_rowset_sha256"`
		}
		raw, err := os.ReadFile("../api/testdata/product/qa-catalog-purge-fixture.json")
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(raw, &purge); err != nil {
			t.Fatal(err)
		}
		if len(purge.Catalog) != 9 || len(purge.Grants) != 5 || purge.Retained != 623 || purge.SHA256 != "0826a2ba053711cb5aec86be57da384d75bf7c56ad4525b0a5cd9b9e35ea30ee" {
			t.Fatal("dated purge contract changed")
		}
		oldRaw, err := os.ReadFile("../api/testdata/product/qa-v2-2026-10-14.jsonl")
		if err != nil {
			t.Fatal(err)
		}
		if got := fmt.Sprintf("%x", sha256.Sum256(oldRaw)); got != "15c9cccba4bc50b96b77f1657e665379083a635ff89f12a3fc03f130c244a9c8" {
			t.Fatalf("dated QA snapshot hash=%s", got)
		}
		oldRows, err := parseJSONL(oldRaw)
		if err != nil {
			t.Fatal(err)
		}
		oldCounts := map[string]int{}
		var oldRetained, removed []line
		for _, row := range oldRows {
			oldCounts[row.Table]++
			if row.Table == "unlockables" || row.Table == "member_unlocks" {
				removed = append(removed, row)
			} else {
				oldRetained = append(oldRetained, row)
			}
		}
		if len(oldRows) != 637 || len(oldCounts) != 45 || !reflect.DeepEqual(removed, append(purge.Catalog, purge.Grants...)) {
			t.Fatal("dated snapshot no longer has the exact admitted upgrade rows and removals")
		}

		var current []line
		if err := json.Unmarshal(qaJSON(t, generateQA()), &current); err != nil {
			t.Fatal(err)
		}
		var retained []line
		for _, row := range current {
			if row.Table == "dm_profile_review_events" {
				continue
			}
			if row.Table == "unlockables" || row.Table == "member_unlocks" {
				t.Fatalf("purged catalog/grant row retained: %s", row.Table)
			}
			switch row.Table {
			case "member_settings":
				row.Row["theme_mode"] = row.Row["mode"]
				for _, key := range []string{"mode", "theme", "density", "effects_enabled", "colorblind_safe", "reduced_motion", "notify_character_verification", "notify_quest_signup", "notify_document_activity", "notify_quest_scheduled", "notify_dm_mentioned", "notify_dm_request_decided"} {
					delete(row.Row, key)
				}
			case "documents":
				for _, key := range []string{"version", "published_by", "deleted_by"} {
					delete(row.Row, key)
				}
			case "document_revisions":
				for _, key := range []string{"rev", "visibility", "policy", "published_at", "published_by", "old_value", "new_value"} {
					delete(row.Row, key)
				}
			case "document_links":
				if !reflect.DeepEqual(row.Conflict, []string{"source_id", "target_type", "target_id", "relation"}) {
					t.Fatalf("typed link conflict target=%v", row.Conflict)
				}
				row.Refs["target_id"] = row.Refs["document_target_id"]
				delete(row.Refs, "document_target_id")
				row.Conflict = []string{"source_id", "target_id", "relation"}
			case "maps":
				delete(row.Row, "family")
			case "notifications":
				delete(row.Row, "event_id")
			case "idempotency_keys":
				if !reflect.DeepEqual(row.Conflict, []string{"endpoint", "actor_id", "key"}) {
					t.Fatalf("receipt conflict target=%v", row.Conflict)
				}
				row.Conflict = []string{"endpoint", "key"}
				for _, key := range []string{"fingerprint", "receipt", "completed_at"} {
					delete(row.Row, key)
				}
			}
			retained = append(retained, row)
		}
		if len(retained) != purge.Retained {
			t.Fatalf("retained dated rows=%d want=%d", len(retained), purge.Retained)
		}
		if !bytes.Equal(qaCanonicalASCII(t, retained), qaCanonicalASCII(t, oldRetained)) {
			t.Fatal("current fixture changed a dated row beyond the enumerated schema adaptations")
		}

		if got := fmt.Sprintf("%x", sha256.Sum256(qaCanonicalASCII(t, retained))); got != purge.SHA256 {
			t.Fatalf("unrelated dated values, references, identities, order or conflict metadata changed: %s", got)
		}
	})

	t.Run("migration admission baselines", func(t *testing.T) {
		profiles := map[string]line{}
		baselines := map[string]line{}
		for _, row := range generateQA() {
			member := row.Refs["member_id"].PublicID
			switch row.Table {
			case "dm_profiles":
				profiles[member] = row
			case "dm_profile_review_events":
				if _, duplicate := baselines[member]; duplicate {
					t.Fatalf("duplicate baseline for %s", member)
				}
				baselines[member] = row
			}
		}
		if len(profiles) != 5 || len(baselines) != 5 {
			t.Fatalf("profiles=%d baselines=%d", len(profiles), len(baselines))
		}
		for member, profile := range profiles {
			baseline, exists := baselines[member]
			if !exists {
				t.Fatalf("missing baseline for %s", member)
			}
			if baseline.Row["kind"] != "BASELINE" || baseline.Row["revision"] != profile.Row["review_revision"] || !reflect.DeepEqual(baseline.Conflict, []string{"member_id", "revision"}) || baseline.Refs["member_id"].Table != "members" {
				t.Errorf("invalid baseline for %s", member)
			}
			want := map[string]any{"tagline": profile.Row["tagline"], "philosophy": profile.Row["philosophy"], "houseRules": profile.Row["house_rules"], "tableInfo": profile.Row["table_info"], "acceptingPlayers": profile.Row["accepting_players"], "status": profile.Row["status"]}
			if !reflect.DeepEqual(baseline.Row["snapshot"], want) {
				t.Errorf("baseline snapshot differs from admitted profile %s", member)
			}
			qaAssertUnknown(t, baseline, "recorded_at", "recorded_by", "verification_id")
		}
	})

	t.Run("typed defaults and legacy unknowns", func(t *testing.T) {
		counts := map[string]int{}
		for _, row := range generateQA() {
			counts[row.Table]++
			switch row.Table {
			case "member_settings":
				want := map[string]any{"theme": "parchment", "density": "comfortable", "effects_enabled": true, "colorblind_safe": false, "reduced_motion": false, "notify_character_verification": true, "notify_quest_signup": true, "notify_document_activity": true, "notify_quest_scheduled": true, "notify_dm_mentioned": true, "notify_dm_request_decided": true}
				for key, value := range want {
					if !reflect.DeepEqual(row.Row[key], value) {
						t.Errorf("settings %s=%v want=%v", key, row.Row[key], value)
					}
				}
				if _, present := row.Row["theme_mode"]; present {
					t.Error("removed theme_mode column remains")
				}
			case "documents":
				if row.Row["version"] != 0 {
					t.Errorf("legacy document version=%v", row.Row["version"])
				}
				qaAssertUnknown(t, row, "published_by", "deleted_by")
			case "document_revisions":
				if row.Row["rev"] != 1 {
					t.Errorf("legacy single revision ordinal=%v", row.Row["rev"])
				}
				qaAssertUnknown(t, row, "visibility", "policy", "published_at", "published_by", "old_value", "new_value")
			case "maps":
				if row.Row["family"] != "campaign" {
					t.Errorf("legacy map family=%v", row.Row["family"])
				}
			case "notifications":
				qaAssertUnknown(t, row, "event_id")
			case "idempotency_keys":
				qaAssertUnknown(t, row, "fingerprint", "receipt", "completed_at")
			}
		}
		for table, count := range map[string]int{"member_settings": 17, "documents": 140, "document_revisions": 9, "maps": 2, "notifications": 6, "idempotency_keys": 1, "background_jobs": 7} {
			if counts[table] != count {
				t.Errorf("%s rows=%d want=%d", table, counts[table], count)
			}
		}
	})
}

func qaAssertUnknown(t *testing.T, row line, keys ...string) {
	t.Helper()
	for _, key := range keys {
		value, present := row.Row[key]
		if !present || value != nil {
			t.Errorf("%s.%s must explicitly preserve unknown provenance, got=%v present=%t", row.Table, key, value, present)
		}
	}
}

func qaCanonicalASCII(t *testing.T, value any) []byte {
	t.Helper()
	var generic any
	if err := json.Unmarshal(qaJSON(t, value), &generic); err != nil {
		t.Fatal(err)
	}
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(generic); err != nil {
		t.Fatal(err)
	}
	var ascii strings.Builder
	for _, r := range strings.TrimSuffix(encoded.String(), "\n") {
		if r <= 127 {
			ascii.WriteRune(r)
		} else if r <= 0xffff {
			fmt.Fprintf(&ascii, "\\u%04x", r)
		} else {
			high, low := utf16.EncodeRune(r)
			fmt.Fprintf(&ascii, "\\u%04x\\u%04x", high, low)
		}
	}
	return []byte(ascii.String())
}
