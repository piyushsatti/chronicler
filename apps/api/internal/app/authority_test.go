package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestRequestAuthorityReachesDocumentPolicy(t *testing.T) {
	profile := "approved"
	runtime := API{Authority: func(context.Context, string) (auth.Authority, error) {
		return auth.NewAuthority("member", []auth.Role{auth.DM}, "active", profile)
	}}
	parse := func(string) (auth.Claims, bool) {
		return auth.Claims{MemberID: "member", Roles: []auth.Role{auth.Admin}}, true
	}
	want := true
	h := auth.LiveMiddleware(parse, runtime.Authority, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scope := (document.Queries{}).ScopeFromContext(r.Context())
		if scope.IsAdmin || scope.IsDM != want {
			t.Fatalf("scope=%+v wantDM=%v", scope, want)
		}
		if got := scope.Allows(document.VisibilityDMOnly, "doc", "author", nil); got != want {
			t.Fatalf("allows=%v want=%v", got, want)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	for range 2 {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Authorization", "Bearer old-token")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusNoContent {
			t.Fatalf("status=%d", w.Code)
		}
		profile, want = "rejected", false
	}
}
