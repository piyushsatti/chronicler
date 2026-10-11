//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

const nativeUnreadPath = "/v1/me/notifications/unread-count"

type observedUnreadRepository struct {
	next  notification.Repository
	calls *int
}

func (p observedUnreadRepository) UnreadCount(ctx context.Context, id string) (int64, error) {
	*p.calls = *p.calls + 1
	return p.next.UnreadCount(ctx, id)
}

func unreadNativeHandler(f *authorityDBFixture, q notification.Queries, resolve auth.AuthorityResolver) http.Handler {
	runtime := f.runtime
	runtime.Notifications = q
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, f.cfg)
	return apiHandler(mux, f.cfg, resolve)
}

func assertNativeUnreadCount(t *testing.T, w *httptest.ResponseRecorder, count int64) {
	t.Helper()
	assertAuthorityDBCORS(t, w)
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != 200 || w.Header().Get("Content-Type") != "application/json" || !reflect.DeepEqual(got, map[string]any{"count": float64(count)}) {
		t.Fatalf("count response=%d %s want=%d err=%v", w.Code, w.Body, count, err)
	}
	assertUnreadNativeCORS(t, w)
}

func assertUnreadNativeCORS(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	assertAuthorityDBCORS(t, w)
	if w.Header().Get("Access-Control-Allow-Credentials") != "true" || w.Header().Get("Vary") != "Origin" {
		t.Fatalf("CORS headers=%v", w.Header())
	}
}

func assertNativeUnreadProblem(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	assertAuthorityDBProblem(t, w, status, code)
	assertUnreadNativeCORS(t, w)
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || len(body) != 3 {
		t.Fatalf("Problem must have exactly three keys: %s", w.Body)
	}
	if _, ok := body["count"]; ok {
		t.Fatal("failed count returned a count")
	}
	if status == 500 && body["title"] != "Internal error" {
		t.Fatalf("count failure was not opaque: %s", w.Body)
	}
}

func TestNotificationsUnreadCountProductionRecipientReadFilterAndNoWrites(t *testing.T) {
	f := newAuthorityDBFixture(t)
	a, b, c := f.member(t, auth.Player), f.member(t, auth.Player), f.member(t, auth.Player)
	f.exec(t, `INSERT INTO notifications (member_id,kind,subject_type,subject_id,read_at) VALUES
        ($1,'quest_notice','quest',NULL,NULL),($1,'quest_notice','quest',-1,NULL),($1,'read_notice',NULL,NULL,now()),
        ($2,'quest_notice',NULL,NULL,NULL),($2,'event_notice',NULL,NULL,NULL),($2,'other_notice',NULL,NULL,NULL)`, a.rowID, b.rowID)
	snapshot := func() string {
		var got string
		err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.id),'[]'::jsonb)::text
            FROM notifications n WHERE member_id=ANY($1::bigint[])`, []int64{a.rowID, b.rowID, c.rowID}).Scan(&got)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	before := snapshot()
	for range 2 {
		for _, actor := range []struct {
			m     authorityDBMember
			count int64
		}{{a, 2}, {b, 3}, {c, 0}} {
			// Signed staff role claims do not widen the actual recipient scope.
			w := authorityDBRequest(f.handler, http.MethodGet, nativeUnreadPath+"?member_id="+b.publicID+"&unread_only=false", f.token(t, actor.m.publicID, auth.Admin), []byte(`{"memberId":"other"}`))
			assertNativeUnreadCount(t, w, actor.count)
		}
	}
	if after := snapshot(); after != before {
		t.Fatalf("GET changed notifications: before=%s after=%s", before, after)
	}
}

func TestNotificationsUnreadCountProductionCurrentAuthorityAndCredentials(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	token := f.token(t, m.publicID, auth.Admin)
	countCalls := 0
	q := notification.Queries{Repo: observedUnreadRepository{next: f.runtime.Notifications.Repo, calls: &countCalls}}
	handler := unreadNativeHandler(f, q, f.runtime.Authority)
	assertNativeUnreadCount(t, authorityDBRequest(handler, http.MethodGet, nativeUnreadPath, token, nil), 0)
	expired, err := login.Mint(f.cfg.JWTSecret, login.Claims{MemberID: m.publicID, Roles: []auth.Role{auth.Admin}, Exp: time.Now().Add(-time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	if countCalls != 1 {
		t.Fatalf("active count calls=%d", countCalls)
	}
	for _, bad := range []string{"", "invalid-bearer", expired} {
		assertNativeUnreadProblem(t, authorityDBRequest(handler, http.MethodGet, nativeUnreadPath, bad, nil), 401, "UNAUTHENTICATED")
		if countCalls != 1 {
			t.Fatal("invalid credential reached count")
		}
	}
	r := httptest.NewRequest(http.MethodGet, nativeUnreadPath, nil)
	r.Header.Set("Origin", testOrigin)
	r.Header.Set("Authorization", "Basic invalid")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	assertNativeUnreadProblem(t, w, 401, "UNAUTHENTICATED")
	if countCalls != 1 {
		t.Fatal("malformed authorization reached count")
	}
	f.exec(t, `UPDATE members SET status='inactive' WHERE id=$1`, m.rowID)
	assertNativeUnreadProblem(t, authorityDBRequest(handler, http.MethodGet, nativeUnreadPath, token, nil), 403, "FORBIDDEN")
	if countCalls != 1 {
		t.Fatal("inactive or deleted member reached count")
	}
	f.exec(t, `UPDATE members SET status='active' WHERE id=$1`, m.rowID)
	f.exec(t, `DELETE FROM members WHERE id=$1`, m.rowID)
	assertNativeUnreadProblem(t, authorityDBRequest(handler, http.MethodGet, nativeUnreadPath, token, nil), 403, "FORBIDDEN")
	if countCalls != 1 {
		t.Fatal("inactive or deleted member reached count")
	}
}

func TestNotificationsUnreadCountProductionCountDBFailureAfterAuthority(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	// This second genuine pool is exclusively the count collaborator. Close it
	// only after the unchanged production authority resolver successfully reads.
	countPool, err := db.Connect(context.Background(), f.cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(countPool.Close)
	authorityCalls, countCalls := 0, 0
	q := notification.Queries{Repo: observedUnreadRepository{next: notification.NewPostgresRepository(dbgen.New(countPool.Pool)), calls: &countCalls}}
	handler := unreadNativeHandler(f, q, func(ctx context.Context, id string) (auth.Authority, error) {
		authorityCalls++
		a, err := f.runtime.Authority(ctx, id)
		if err == nil {
			countPool.Close()
		}
		return a, err
	})
	w := authorityDBRequest(handler, http.MethodGet, nativeUnreadPath, f.token(t, m.publicID), nil)
	assertNativeUnreadProblem(t, w, 500, "INTERNAL")
	if authorityCalls != 1 || countCalls != 1 {
		t.Fatalf("failure isolation authority=%d count=%d", authorityCalls, countCalls)
	}
	if strings.Contains(w.Body.String(), "closed") || strings.Contains(w.Body.String(), "SELECT") {
		t.Fatal("count DB details escaped")
	}
}

func TestNotificationsUnreadCountProductionAuthorityDBFailureDoesNotQueryCount(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	calls := 0
	q := notification.Queries{Repo: observedUnreadRepository{next: f.runtime.Notifications.Repo, calls: &calls}}
	handler := unreadNativeHandler(f, q, f.runtime.Authority)
	f.runtime.Pool.Close()
	w := authorityDBRequest(handler, http.MethodGet, nativeUnreadPath, f.token(t, m.publicID), nil)
	assertNativeUnreadProblem(t, w, 500, "INTERNAL")
	if calls != 0 {
		t.Fatal("authority DB failure reached count")
	}
}

func TestNotificationsUnreadCountProductionPreflightAndDisallowedOrigin(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	token := f.token(t, m.publicID)
	authorityCalls, countCalls := 0, 0
	q := notification.Queries{Repo: observedUnreadRepository{next: f.runtime.Notifications.Repo, calls: &countCalls}}
	handler := unreadNativeHandler(f, q, func(ctx context.Context, id string) (auth.Authority, error) {
		authorityCalls++
		return f.runtime.Authority(ctx, id)
	})
	r := httptest.NewRequest(http.MethodOptions, nativeUnreadPath, nil)
	r.Header.Set("Origin", testOrigin)
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("Access-Control-Request-Method", http.MethodGet)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 204 || authorityCalls != 0 || countCalls != 0 {
		t.Fatalf("preflight status=%d authority=%d count=%d", w.Code, authorityCalls, countCalls)
	}
	assertUnreadNativeCORS(t, w)
	r = httptest.NewRequest(http.MethodGet, nativeUnreadPath, nil)
	r.Header.Set("Origin", "https://untrusted.example.test")
	r.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("Access-Control-Allow-Origin") != "" || authorityCalls != 1 || countCalls != 1 {
		t.Fatalf("disallowed-origin response=%d headers=%v authority=%d count=%d", w.Code, w.Header(), authorityCalls, countCalls)
	}
}

func TestNotificationsUnreadCountProductionHundredRowsRemainExact(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	f.exec(t, `INSERT INTO notifications (member_id,kind) SELECT $1,'badge_boundary' FROM generate_series(1,100)`, m.rowID)
	assertNativeUnreadCount(t, authorityDBRequest(f.handler, http.MethodGet, nativeUnreadPath, f.token(t, m.publicID), nil), 100)
}
