package member

import (
	"encoding/json"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type MeQuery func(memberID string) (Member, error)

func Routes(mux httpserver.Router, me MeQuery) {
	mux.Handle("POST /v1/me/personalization/reconcile", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
	mux.Handle("POST /v1/me/notifications/acknowledge-suppressed", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
	mux.Handle("GET /v1/members/me", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := auth.FromContext(r.Context())
		m, err := me(c.MemberID)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(m)
	})))
}
