package site

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
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

func Routes(mux httpserver.Router, stats func(context.Context) (Stats, error)) {
	mux.HandleFunc("GET /v1/stats", func(w http.ResponseWriter, r *http.Request) {
		value, err := stats(r.Context())
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(value)
	})
	mux.HandleFunc("GET /v1/search/kinds", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(SearchableKinds())
	})
}
