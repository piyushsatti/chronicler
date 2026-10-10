package member

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type ReadAPI struct {
	ByDiscordID  func(ctx context.Context, discordID string) (Member, error)
	RoleHistory  func(ctx context.Context, memberID string, limit int) ([]RoleChange, error)
	Availability func(ctx context.Context, memberID string) ([]AvailabilityWindow, error)
}

func (a ReadAPI) Routes(mux httpserver.Router) {
	// Go's ServeMux rejects registering both
	//   GET /v1/members/by-discord/{discordId}
	// and GET /v1/members/{id}/role-history (they overlap on
	// /v1/members/by-discord/role-history). One dispatcher keeps the public URLs.
	if a.ByDiscordID != nil {
		httpserver.Announce(mux, "GET /v1/members/by-discord/{discordId}")
	}
	if a.RoleHistory != nil {
		httpserver.Announce(mux, "GET /v1/members/{id}/role-history")
	}
	if a.Availability != nil {
		httpserver.Announce(mux, "GET /v1/members/{id}/availability")
	}
	if a.ByDiscordID == nil && a.RoleHistory == nil && a.Availability == nil {
		return
	}
	httpserver.HandleFuncUntracked(mux, "GET /v1/members/{first}/{second}", a.dispatch)
}

func (a ReadAPI) dispatch(w http.ResponseWriter, r *http.Request) {
	first, second := r.PathValue("first"), r.PathValue("second")
	switch {
	case first == "by-discord" && a.ByDiscordID != nil:
		m, err := a.ByDiscordID(r.Context(), second)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		writeJSON(w, m)
	case second == "role-history" && a.RoleHistory != nil:
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 200 {
			limit = 50
		}
		rows, err := a.RoleHistory(r.Context(), first, limit)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		writeJSON(w, map[string]any{"items": rows})
	case second == "availability" && a.Availability != nil:
		rows, err := a.Availability(r.Context(), first)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		writeJSON(w, map[string]any{"windows": rows})
	default:
		apierr.Write(w, r, apierr.New(apierr.NotFound, "not found"))
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	apierr.Write(w, r, err)
}
