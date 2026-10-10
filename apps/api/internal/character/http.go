package character

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type ReadAPI struct {
	Progression          func(ctx context.Context, characterID string, limit int) ([]ProgressionEntry, error)
	Logs                 func(ctx context.Context, characterID string, limit int) ([]LogEntry, error)
	VerificationHistory  func(ctx context.Context, characterID string, limit int) ([]VerificationEntry, error)
}

func (a ReadAPI) Routes(mux httpserver.Router) {
	limitFrom := func(r *http.Request) int {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 200 {
			return 50
		}
		return limit
	}
	if a.Progression != nil {
		mux.HandleFunc("GET /v1/characters/{id}/progression", func(w http.ResponseWriter, r *http.Request) {
			rows, err := a.Progression(r.Context(), r.PathValue("id"), limitFrom(r))
			if err != nil {
				apierr.Write(w, r, err)
				return
			}
			writeJSON(w, map[string]any{"items": rows})
		})
	}
	if a.Logs != nil {
		mux.HandleFunc("GET /v1/characters/{id}/logs", func(w http.ResponseWriter, r *http.Request) {
			rows, err := a.Logs(r.Context(), r.PathValue("id"), limitFrom(r))
			if err != nil {
				apierr.Write(w, r, err)
				return
			}
			writeJSON(w, map[string]any{"items": rows})
		})
	}
	if a.VerificationHistory != nil {
		mux.HandleFunc("GET /v1/characters/{id}/verification-history", func(w http.ResponseWriter, r *http.Request) {
			rows, err := a.VerificationHistory(r.Context(), r.PathValue("id"), limitFrom(r))
			if err != nil {
				apierr.Write(w, r, err)
				return
			}
			writeJSON(w, map[string]any{"items": rows})
		})
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
