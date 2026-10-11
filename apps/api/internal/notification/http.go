package notification

import (
	"encoding/json"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type unreadCountResponse struct {
	Count int64 `json:"count"`
}

// Routes registers the fixed CQRS read independently of repository availability.
func Routes(mux httpserver.Router, q Queries) {
	mux.Handle("GET /v1/me/notifications/unread-count", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authority, ok := auth.AuthorityFromContext(r.Context())
		if !ok {
			apierr.Write(w, r, errAuthorityUnavailable)
			return
		}
		count, err := q.UnreadCount(r.Context(), authority.Claims().MemberID)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(unreadCountResponse{Count: count})
	})))
}
