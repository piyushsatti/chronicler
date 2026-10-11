package notification

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

const unreadMemberID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const unreadPath = "/v1/me/notifications/unread-count"

func unreadAuthority(t *testing.T) context.Context {
	t.Helper()
	a, err := auth.NewAuthority(unreadMemberID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	return auth.WithAuthority(context.Background(), a)
}

func TestUnreadCountHTTPHasExactOneFieldAndNoRecipientSelector(t *testing.T) {
	for _, count := range []int64{0, 2, 100} {
		ctx := context.WithValue(unreadAuthority(t), unreadContextKey{}, "http")
		// Even internal Claims cannot replace the verified Authority identity.
		ctx = auth.WithClaims(ctx, auth.Claims{MemberID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Roles: []auth.Role{auth.Admin}})
		called := 0
		mux := http.NewServeMux()
		Routes(mux, Queries{Repo: unreadRepoFunc(func(got context.Context, id string) (int64, error) {
			called++
			if got != ctx || id != unreadMemberID {
				t.Fatal("request identity/context was replaced")
			}
			return count, nil
		})})
		r := httptest.NewRequest(http.MethodGet, unreadPath+"?member_id=other&unread_only=false", strings.NewReader(`{"memberId":"other"}`)).WithContext(ctx)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		var got map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != 200 || w.Header().Get("Content-Type") != "application/json" || called != 1 || !reflect.DeepEqual(got, map[string]any{"count": float64(count)}) {
			t.Fatalf("response=%d %s calls=%d err=%v", w.Code, w.Body, called, err)
		}
	}
}

func TestUnreadCountHTTPFailsClosedWithOpaqueProblems(t *testing.T) {
	for _, tc := range []struct {
		name   string
		ctx    context.Context
		repo   Repository
		status int
		code   string
		calls  int
	}{
		{"anonymous", context.Background(), unreadRepoFunc(func(context.Context, string) (int64, error) { return 2, nil }), 401, "UNAUTHENTICATED", 0},
		{"claims only", auth.WithClaims(context.Background(), auth.Claims{MemberID: unreadMemberID}), unreadRepoFunc(func(context.Context, string) (int64, error) { return 2, nil }), 500, "INTERNAL", 0},
		{"missing repository", unreadAuthority(t), nil, 500, "INTERNAL", 0},
		{"negative count", unreadAuthority(t), unreadRepoFunc(func(context.Context, string) (int64, error) { return -1, nil }), 500, "INTERNAL", 1},
		{"private DB error", unreadAuthority(t), unreadRepoFunc(func(context.Context, string) (int64, error) { return 5, errors.New("private DB address and SQL") }), 500, "INTERNAL", 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := 0
			q := Queries{}
			if tc.repo != nil {
				q.Repo = unreadRepoFunc(func(ctx context.Context, id string) (int64, error) { called++; return tc.repo.UnreadCount(ctx, id) })
			}
			mux := http.NewServeMux()
			Routes(mux, q)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, unreadPath, nil).WithContext(tc.ctx))
			var got map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || len(got) != 3 || w.Code != tc.status || got["status"] != float64(tc.status) || got["code"] != tc.code || called != tc.calls || w.Header().Get("Content-Type") != "application/problem+json" {
				t.Fatalf("response=%d %s calls=%d err=%v", w.Code, w.Body, called, err)
			}
			if _, ok := got["count"]; ok || strings.Contains(w.Body.String(), "private DB") {
				t.Fatal("failure escaped as count/private error")
			}
			if tc.status == 500 && got["title"] != "Internal error" {
				t.Fatalf("internal error was not opaque: %s", w.Body)
			}
		})
	}
}
