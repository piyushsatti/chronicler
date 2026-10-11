package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLiveMiddlewareUsesCurrentAuthorityOncePerRequest(t *testing.T) {
	roles := []Role{DM}
	profile := "approved"
	status := "active"
	reads := 0
	resolver := func(_ context.Context, id string) (Authority, error) {
		reads++
		return NewAuthority(id, roles, status, profile)
	}
	parse := func(string) (Claims, bool) { return Claims{MemberID: "member", Roles: []Role{Admin, DM}}, true }
	wantDM := true
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for range 3 {
			a, ok := AuthorityFromContext(r.Context())
			if !ok || a.LiveDM() != wantDM || FromContext(r.Context()).Has(Admin) {
				t.Fatalf("wrong live authority: %+v ok=%v", a, ok)
			}
		}
		w.WriteHeader(http.StatusNoContent)
	})
	h := LiveMiddleware(parse, resolver, next)
	request := func(want int) {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Authorization", "Bearer old-token")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("status=%d want=%d", w.Code, want)
		}
	}
	request(204)
	if reads != 1 {
		t.Fatalf("authority reads=%d", reads)
	}
	profile, wantDM = "rejected", false
	request(204)
	roles = []Role{Player}
	request(204)
	status = "banned"
	request(403)
	if reads != 4 {
		t.Fatalf("must refresh once on each request; reads=%d", reads)
	}
}

func TestLiveAuthorityFailsClosed(t *testing.T) {
	parse := func(string) (Claims, bool) { return Claims{MemberID: "member", Roles: []Role{Admin}}, true }
	for _, tt := range []struct {
		name    string
		resolve AuthorityResolver
		status  int
	}{
		{"missing resolver", nil, 500},
		{"read failure", func(context.Context, string) (Authority, error) {
			return Authority{}, errors.New("database unavailable")
		}, 500},
		{"wrong member", func(context.Context, string) (Authority, error) {
			return NewAuthority("other", []Role{Admin}, "active", "")
		}, 403},
		{"inactive", func(context.Context, string) (Authority, error) {
			return NewAuthority("member", []Role{Admin}, "inactive", "")
		}, 403},
		{"missing", func(context.Context, string) (Authority, error) { return NewAuthority("", nil, "", "") }, 403},
	} {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.Header.Set("Authorization", "Bearer token")
			w := httptest.NewRecorder()
			LiveMiddleware(parse, tt.resolve, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("request must not reach handler") })).ServeHTTP(w, r)
			if w.Code != tt.status {
				t.Fatalf("status=%d want=%d", w.Code, tt.status)
			}
		})
	}
}

func TestLiveDMRequiresCurrentRoleAndApproval(t *testing.T) {
	for _, tt := range []struct {
		roles   []Role
		profile string
		want    bool
	}{
		{[]Role{DM}, "approved", true}, {[]Role{DM}, "pending", false}, {[]Role{DM}, "", false}, {[]Role{Player}, "approved", false},
	} {
		a, err := NewAuthority("member", tt.roles, "active", tt.profile)
		if err != nil || a.LiveDM() != tt.want {
			t.Fatalf("roles=%v profile=%s authority=%+v err=%v", tt.roles, tt.profile, a, err)
		}
	}
}

func TestAuthorityRolesAreNotMutableThroughInputOrReadback(t *testing.T) {
	roles := []Role{Player}
	a, err := NewAuthority("member", roles, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	roles[0] = Admin
	c := a.Claims()
	c.Roles[0] = Admin
	if a.Claims().Has(Admin) {
		t.Fatal("external slice mutation changed request authority")
	}
}
