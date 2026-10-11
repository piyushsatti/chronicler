package member

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type MeQuery func(memberID string) (Member, error)

// memberMeResponse is this endpoint's approved wire shape, not a Member model.
type memberMeResponse struct {
	ID          string   `json:"id"`
	Handle      string   `json:"handle"`
	DisplayName string   `json:"displayName"`
	Roles       []string `json:"roles"`
}

func Routes(mux httpserver.Router, me MeQuery) {
	mux.Handle("POST /v1/me/personalization/reconcile", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
	mux.Handle("POST /v1/me/notifications/acknowledge-suppressed", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
	mux.Handle("GET /v1/members/me", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a, ok := auth.AuthorityFromContext(r.Context())
		if !ok {
			apierr.Write(w, r, apierr.New(apierr.Internal, "member authority unavailable"))
			return
		}
		claims := a.Claims()
		m, err := me(claims.MemberID)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		id, err := uuid.Parse(m.ID)
		viewerID, viewerErr := uuid.Parse(claims.MemberID)
		if err != nil || viewerErr != nil || id != viewerID || m.Handle == "" || m.DisplayName == "" {
			apierr.Write(w, r, apierr.New(apierr.Internal, "invalid member response"))
			return
		}
		roles := make([]string, 0, len(claims.Roles))
		for _, role := range claims.Roles {
			roles = append(roles, string(role))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(memberMeResponse{ID: id.String(), Handle: m.Handle, DisplayName: m.DisplayName, Roles: roles})
	})))
}
