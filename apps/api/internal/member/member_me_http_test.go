package member_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

const meID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

func meAuthority(t *testing.T, roles []auth.Role) context.Context {
	t.Helper()
	a, err := auth.NewAuthorityWithHandle(meID, roles, "active", "", "current")
	if err != nil {
		t.Fatal(err)
	}
	// Even a separate claims value cannot replace verified Authority roles.
	return auth.WithClaims(auth.WithAuthority(context.Background(), a), auth.Claims{MemberID: meID, Roles: []auth.Role{auth.Admin}})
}

func TestMemberMeHasOnlyApprovedFieldsAndCurrentAuthorityRoles(t *testing.T) {
	for _, roles := range [][]auth.Role{{auth.Player}, nil} {
		mux := http.NewServeMux()
		member.Routes(mux, func(id string) (member.Member, error) {
			if id != meID {
				t.Fatalf("self lookup id=%q", id)
			}
			return member.Member{ID: strings.ToUpper(meID), DiscordID: "discarded-discord-id", Handle: "custom", DisplayName: "Current Name", Roles: []string{"admin"}, Status: member.StatusActive}, nil
		})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/v1/members/me", nil).WithContext(meAuthority(t, roles)))
		var got map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != 200 || w.Header().Get("Content-Type") != "application/json" {
			t.Fatalf("response=%d %s err=%v", w.Code, w.Body, err)
		}
		wantRoles := []any{}
		for _, role := range roles {
			wantRoles = append(wantRoles, string(role))
		}
		want := map[string]any{"id": meID, "handle": "custom", "displayName": "Current Name", "roles": wantRoles}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("response=%v want=%v", got, want)
		}
		if strings.Contains(w.Body.String(), "discarded-discord-id") || strings.Contains(w.Body.String(), "Status") || strings.Contains(w.Body.String(), "DiscordID") {
			t.Fatal("internal member fields escaped me DTO")
		}
	}
}

func TestMemberMeErrorsRemainTypedAndFailClosed(t *testing.T) {
	for _, tc := range []struct {
		name    string
		ctx     context.Context
		member  member.Member
		err     error
		status  int
		code    string
		queried bool
	}{
		{"anonymous", context.Background(), member.Member{}, nil, 401, "UNAUTHENTICATED", false},
		{"claims without verified authority", auth.WithClaims(context.Background(), auth.Claims{MemberID: meID, Roles: []auth.Role{auth.Admin}}), member.Member{}, nil, 500, "INTERNAL", false},
		{"not found", meAuthority(t, []auth.Role{auth.Player}), member.Member{}, member.ErrNotFound, 404, "NOT_FOUND", true},
		{"opaque lookup error", meAuthority(t, []auth.Role{auth.Player}), member.Member{}, errors.New("private lookup failure"), 500, "INTERNAL", true},
		{"invalid UUID", meAuthority(t, nil), member.Member{ID: "not-a-uuid", Handle: "custom", DisplayName: "Name"}, nil, 500, "INTERNAL", true},
		{"wrong self UUID", meAuthority(t, nil), member.Member{ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Handle: "custom", DisplayName: "Name"}, nil, 500, "INTERNAL", true},
		{"empty display name", meAuthority(t, nil), member.Member{ID: meID, Handle: "custom"}, nil, 500, "INTERNAL", true},
		{"empty handle", meAuthority(t, nil), member.Member{ID: meID, DisplayName: "Name"}, nil, 500, "INTERNAL", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			mux := http.NewServeMux()
			member.Routes(mux, func(string) (member.Member, error) { called = true; return tc.member, tc.err })
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/v1/members/me", nil).WithContext(tc.ctx))
			var got struct{ Code string }
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != tc.status || got.Code != tc.code || called != tc.queried || w.Header().Get("Content-Type") != "application/problem+json" {
				t.Fatalf("response=%d %s called=%v err=%v", w.Code, w.Body, called, err)
			}
			if strings.Contains(w.Body.String(), "private lookup failure") {
				t.Fatal("lookup error escaped opaque response")
			}
		})
	}
}
