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
		{Key: "document", Label: "Documents", Searchable: true},
		{Key: "member", Label: "Members", Searchable: true},
		{Key: "quest", Label: "Quests", Searchable: false, ExclusionReason: strPtr("use quest board")},
		{Key: "character", Label: "Characters", Searchable: false, ExclusionReason: strPtr("use character directory")},
		{Key: "hex", Label: "Hexes", Searchable: false, ExclusionReason: strPtr("use map view")},
		{Key: "region", Label: "Regions", Searchable: false, ExclusionReason: strPtr("use region list")},
		{Key: "map", Label: "Maps", Searchable: false, ExclusionReason: strPtr("use map list")},
	}
}

func strPtr(s string) *string { return &s }

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
