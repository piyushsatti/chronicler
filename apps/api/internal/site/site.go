package site

import (
	"encoding/json"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type Stats struct {
	TotalMembers     int `json:"totalMembers"`
	ActiveCharacters int `json:"activeCharacters"`
	TotalQuests      int `json:"totalQuests"`
}

type SearchKind struct {
	Key             string  `json:"key"`
	Label           string  `json:"label"`
	Searchable      bool    `json:"searchable"`
	ExclusionReason *string `json:"exclusionReason"`
}

func SearchableKinds() []SearchKind {
	return []SearchKind{
		{Key: "codex_entry", Label: "Codex entries", Searchable: true},
		{Key: "rule", Label: "Rules", Searchable: true},
		{Key: "summary", Label: "Summaries", Searchable: true},
		{Key: "quest_brief", Label: "Quest briefs", Searchable: true},
		{Key: "community", Label: "Community", Searchable: true},
		{Key: "member", Label: "Members", Searchable: true},
	}
}

func Routes(mux httpserver.Router, stats func() Stats) {
	mux.HandleFunc("GET /v1/stats", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(stats())
	})
	mux.HandleFunc("GET /v1/search/kinds", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(SearchableKinds())
	})
}
