package spatial

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type ReadAPI struct {
	HexHistory   func(ctx context.Context, hexID string, limit int) ([]HexChange, error)
	RegionCounts func(ctx context.Context, regionID string) (RegionCounts, error)
	MapActivity  func(ctx context.Context, atlasCode string) (MapActivity, error)
}

func (a ReadAPI) Routes(mux httpserver.Router) {
	if a.HexHistory != nil {
		mux.HandleFunc("GET /v1/hexes/{id}/history", func(w http.ResponseWriter, r *http.Request) {
			limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
			if limit <= 0 || limit > 200 {
				limit = 50
			}
			rows, err := a.HexHistory(r.Context(), r.PathValue("id"), limit)
			if err != nil {
				apierr.Write(w, r, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"items": rows})
		})
	}
	if a.RegionCounts != nil {
		mux.HandleFunc("GET /v1/regions/{id}/counts", func(w http.ResponseWriter, r *http.Request) {
			c, err := a.RegionCounts(r.Context(), r.PathValue("id"))
			if err != nil {
				apierr.Write(w, r, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(c)
		})
	}
	if a.MapActivity != nil {
		mux.HandleFunc("GET /v1/maps/{atlasCode}/activity", func(w http.ResponseWriter, r *http.Request) {
			act, err := a.MapActivity(r.Context(), r.PathValue("atlasCode"))
			if err != nil {
				apierr.Write(w, r, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(act)
		})
	}
}
