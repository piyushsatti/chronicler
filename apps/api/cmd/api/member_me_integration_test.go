//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestProductionChainMemberMeCanonicalWireAndCurrentRoles(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	handle := "custom-" + m.publicID
	f.exec(t, `UPDATE members SET handle=$2,display_name='Current Name' WHERE id=$1`, m.rowID, handle)
	token := f.token(t, m.publicID, auth.Admin, auth.DM)
	for _, roles := range [][]string{{"player"}, {"dm", "archon"}, {"admin"}, {"player"}} {
		f.exec(t, `UPDATE members SET roles=$2 WHERE id=$1`, m.rowID, roles)
		w := authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", token, nil)
		assertAuthorityDBCORS(t, w)
		var got map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != 200 {
			t.Fatalf("me=%d %s err=%v", w.Code, w.Body, err)
		}
		wantRoles := []any{}
		for _, role := range roles {
			wantRoles = append(wantRoles, role)
		}
		want := map[string]any{"id": m.publicID, "handle": handle, "displayName": "Current Name", "roles": wantRoles}
		if !reflect.DeepEqual(got, want) || w.Header().Get("Content-Type") != "application/json" {
			t.Fatalf("me=%v want=%v", got, want)
		}
		for _, discarded := range []string{"DiscordID", "Status", "DisplayName", "\"ID\"", "authority-" + m.publicID} {
			if strings.Contains(w.Body.String(), discarded) {
				t.Fatalf("internal field %q escaped me DTO", discarded)
			}
		}
	}
}

func TestProductionChainMemberMeTypedFailuresAndInvalidData(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	token := f.token(t, m.publicID, auth.Admin)
	for _, badToken := range []string{"", "invalid-bearer"} {
		w := authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", badToken, nil)
		assertAuthorityDBProblem(t, w, 401, "UNAUTHENTICATED")
	}
	f.exec(t, `UPDATE members SET status='inactive' WHERE id=$1`, m.rowID)
	w := authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", token, nil)
	assertAuthorityDBProblem(t, w, 403, "FORBIDDEN")
	f.exec(t, `UPDATE members SET status='active',display_name='' WHERE id=$1`, m.rowID)
	w = authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", token, nil)
	assertAuthorityDBProblem(t, w, 500, "INTERNAL")
	f.exec(t, `UPDATE members SET display_name='Restored' WHERE id=$1`, m.rowID)
	// Controlled concurrent disappearance after the genuine authority read.
	handler := apiHandler(f.mux, f.cfg, func(ctx context.Context, id string) (auth.Authority, error) {
		a, err := f.runtime.Authority(ctx, id)
		if err == nil {
			_, err = f.pool.Exec(ctx, `DELETE FROM members WHERE public_id=$1::uuid`, id)
		}
		return a, err
	})
	w = authorityDBRequest(handler, http.MethodGet, "/v1/members/me", token, nil)
	assertAuthorityDBProblem(t, w, 404, "NOT_FOUND")
	// This genuine pool failure uses the unchanged production chain. Fixture
	// cleanup has its own pool; no ambient or external database is admitted.
	f.runtime.Pool.Close()
	w = authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", token, nil)
	assertAuthorityDBProblem(t, w, 500, "INTERNAL")
}
