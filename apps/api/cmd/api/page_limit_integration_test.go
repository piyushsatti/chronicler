//go:build integration

package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestProductionChainPageLimitRejectsAboveMaximum(t *testing.T) {
	f := newAuthorityDBFixture(t)
	admin := f.member(t, auth.Admin, auth.Player)
	token := f.token(t, admin.publicID, auth.Admin)
	for _, tc := range []struct {
		name, query, path string
	}{
		{name: "quests", query: `{quests(limit:101){total}}`, path: "quests"},
		{name: "documents", query: `{documents(limit:101){total}}`, path: "documents"},
		{name: "members", query: `{members(limit:101){total}}`, path: "members"},
		{name: "characters", query: `{characters(limit:101){total}}`, path: "characters"},
		{name: "maps", query: `{maps(limit:101){id}}`, path: "maps"},
		{name: "regions", query: `{regions(limit:101){id}}`, path: "regions"},
		{name: "search", query: `{search(query:"x",limit:101){query}}`, path: "search"},
		{name: "adminOperations", query: `{adminOperations(limit:101){activeAlertCount}}`, path: "adminOperations"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			payload, err := json.Marshal(map[string]any{"query": tc.query})
			if err != nil {
				t.Fatal(err)
			}
			w := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, payload)
			assertAuthorityDBCORS(t, w)
			var result struct {
				Errors []struct {
					Path       []any                 `json:"path"`
					Extensions struct{ Code string } `json:"extensions"`
				} `json:"errors"`
			}
			if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &result) != nil {
				t.Fatalf("Graph HTTP status=%d body=%s", w.Code, w.Body)
			}
			if len(result.Errors) != 1 || result.Errors[0].Extensions.Code != "INVALID" || len(result.Errors[0].Path) != 1 || result.Errors[0].Path[0] != tc.path {
				t.Fatalf("errors=%+v want INVALID at %s", result.Errors, tc.path)
			}
		})
	}
}
