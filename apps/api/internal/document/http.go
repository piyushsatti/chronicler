package document

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type HTTP struct {
	Q Queries
}

func (h HTTP) Routes(mux httpserver.Router) {
	mux.Handle("GET /v1/documents/{id}/revisions", auth.Require(auth.Authenticated, http.HandlerFunc(h.revisions)))
	mux.Handle("GET /v1/documents/trash", auth.Require(auth.Authenticated, http.HandlerFunc(h.trash)))
}

type revisionResponse struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"documentId"`
	Reason     string    `json:"reason"`
	Title      string    `json:"title"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (h HTTP) revisions(w http.ResponseWriter, r *http.Request) {
	if h.Q.Repo == nil {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "document store not configured"))
		return
	}
	id := r.PathValue("id")
	rows, err := h.Q.ListRevisions(r.Context(), id, 50, 0)
	if err != nil {
		apierr.Write(w, r, err)
		return
	}
	out := make([]revisionResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, revisionResponse{
			ID: row.ID, DocumentID: row.DocumentID, Reason: row.Reason, Title: row.Title, CreatedAt: row.CreatedAt,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": out, "total": len(out)})
}

func (h HTTP) trash(w http.ResponseWriter, r *http.Request) {
	if h.Q.Repo == nil {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "document store not configured"))
		return
	}
	items, err := h.Q.ListTrash(r.Context(), 50, 0)
	if err != nil {
		apierr.Write(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": items, "total": len(items)})
}
