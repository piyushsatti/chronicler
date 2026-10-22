package graph

import (
	"encoding/json"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
)

func TestDmProfileReplacementMapping(t *testing.T) {
	missing := toUpdateDmProfileFields(UpdateDmProfileInput{})
	if missing.Tagline != nil || missing.Philosophy != nil || missing.HouseRules != nil || missing.TableInfo != nil {
		t.Fatal("omitted fields did not remain replacement clears")
	}
	for _, raw := range []json.RawMessage{nil, json.RawMessage(`null`)} {
		if got := toUpdateDmProfileFields(UpdateDmProfileInput{TableInfo: raw}); got.TableInfo != nil {
			t.Fatal("JSON null became a nonnull replacement")
		}
	}
	text, raw := "", json.RawMessage(`{"table":"round"}`)
	values := toUpdateDmProfileFields(UpdateDmProfileInput{Tagline: &text, TableInfo: raw, AcceptingPlayers: true})
	if values.Tagline == nil || *values.Tagline != "" || values.TableInfo == nil || string(*values.TableInfo) != string(raw) || !values.AcceptingPlayers {
		t.Fatal("supplied replacement values changed")
	}
}

func TestSummaryAuthoringMapping(t *testing.T) {
	if toSummaryDerivedType(document.SummaryDerivedView{}).Authoring != nil {
		t.Fatal("absent permission projection became authoring data")
	}
	characterID := "character"
	view := toSummaryDerivedType(document.SummaryDerivedView{Authoring: &document.SummaryAuthoringView{CharacterId: &characterID, Complete: false, QuestIds: []string{"quest"}}})
	if view.Authoring == nil || view.Authoring.CharacterID == nil || *view.Authoring.CharacterID != characterID || view.Authoring.Complete || len(view.Authoring.QuestIds) != 1 || view.Authoring.QuestIds[0] != "quest" {
		t.Fatal("source authoring attribution or incompleteness lost")
	}
}
