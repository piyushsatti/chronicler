//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

// These tests use the repository's migrated, seeded ephemeral Postgres and the
// actual Wire -> MountFromAPI -> apiHandler path. Only fixture rows are changed;
// tokens remain unchanged while database authority is granted or revoked.
type authorityDBFixture struct {
	pool      *db.Pool
	runtime   app.API
	cfg       config.Config
	mux       *http.ServeMux
	handler   http.Handler
	members   []string
	documents []string
}

type authorityDBMember struct {
	publicID string
	rowID    int64
}

type authorityDBDocument struct {
	publicID string
	rowID    int64
	body     string
	title    string
	slug     string
}

func newAuthorityDBFixture(t *testing.T) *authorityDBFixture {
	t.Helper()
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("authority integration tests require dbtest's ephemeral Postgres; omit DATABASE_URL")
	}
	f := &authorityDBFixture{
		pool: dbtest.Pool(t),
		cfg: config.Config{
			DatabaseURL: dbtest.DSN(t), RequireDatabase: true,
			JWTSecret: "authority-db-integration-key", CORSOrigins: []string{testOrigin},
		},
		mux: http.NewServeMux(),
	}
	f.runtime = wireForTest(context.Background(), f.cfg)
	if f.runtime.Pool == nil || f.runtime.Authority == nil || f.runtime.Members == nil {
		t.Fatal("Wire did not select Postgres member authority")
	}
	t.Cleanup(f.runtime.Pool.Close)
	t.Cleanup(func() {
		// Each test creates independent internal entities; never change seed rows.
		for _, statement := range []struct {
			sql string
			ids []string
		}{
			{"DELETE FROM documents WHERE public_id::text = ANY($1::text[])", f.documents},
			{"DELETE FROM idempotency_keys WHERE actor_id IN (SELECT id FROM members WHERE public_id::text = ANY($1::text[]))", f.members},
			{"DELETE FROM notifications WHERE member_id IN (SELECT id FROM members WHERE public_id::text = ANY($1::text[]))", f.members},
			{"DELETE FROM members WHERE public_id::text = ANY($1::text[])", f.members},
		} {
			if len(statement.ids) > 0 {
				if _, err := f.pool.Exec(context.Background(), statement.sql, statement.ids); err != nil {
					t.Errorf("clean fixture rows: %v", err)
				}
			}
		}
	})
	app.MountFromAPI(f.mux, f.runtime, f.cfg)
	f.handler = apiHandler(f.mux, f.cfg, f.runtime.Authority)
	return f
}

func (f *authorityDBFixture) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	if _, err := f.pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("fixture update: %v", err)
	}
}

func (f *authorityDBFixture) member(t *testing.T, roles ...auth.Role) authorityDBMember {
	t.Helper()
	m := authorityDBMember{publicID: uuid.NewString()}
	values := make([]string, len(roles))
	for i, role := range roles {
		values[i] = string(role)
	}
	err := f.pool.QueryRow(context.Background(), `
		INSERT INTO members (public_id, discord_id, handle, display_name, roles)
		VALUES ($1::uuid, $2, $2, 'Authority integration member', $3)
		RETURNING id`, m.publicID, "authority-"+m.publicID, values).Scan(&m.rowID)
	if err != nil {
		t.Fatalf("insert member: %v", err)
	}
	f.members = append(f.members, m.publicID)
	return m
}

func (f *authorityDBFixture) profile(t *testing.T, m authorityDBMember, status string) {
	t.Helper()
	f.exec(t, `INSERT INTO dm_profiles (member_id, status) VALUES ($1, $2)
		ON CONFLICT (member_id) DO UPDATE SET status = EXCLUDED.status`, m.rowID, status)
}

func (f *authorityDBFixture) doc(t *testing.T, publicID string, author *authorityDBMember, status document.Status, visibility document.Visibility) authorityDBDocument {
	t.Helper()
	if publicID == "" {
		publicID = uuid.NewString()
	}
	d := authorityDBDocument{publicID: publicID, body: "private-body-" + publicID, title: "Authority integration document", slug: "authority-" + publicID}
	var authorRow any
	if author != nil {
		authorRow = author.rowID
	}
	err := f.pool.QueryRow(context.Background(), `
		INSERT INTO documents (public_id, kind, slug, title, author_id, status, visibility, body)
		VALUES ($1::uuid, 'rule', $2, 'Authority integration document', $3, $4, $5, $6)
		RETURNING id`, d.publicID, "authority-"+d.publicID, authorRow, string(status), string(visibility), d.body).Scan(&d.rowID)
	if err != nil {
		t.Fatalf("insert document: %v", err)
	}
	f.documents = append(f.documents, d.publicID)
	return d
}

func (f *authorityDBFixture) token(t *testing.T, memberID string, roles ...auth.Role) string {
	t.Helper()
	token, err := login.Mint(f.cfg.JWTSecret, login.Claims{
		MemberID: memberID, Roles: roles, Exp: time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func authorityDBRequest(handler http.Handler, method, path, token string, body []byte) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, bytes.NewReader(body))
	r.Header.Set("Origin", testOrigin)
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func assertAuthorityDBCORS(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != testOrigin {
		t.Fatalf("CORS origin=%q want=%q", got, testOrigin)
	}
}

func assertAuthorityDBProblem(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	assertAuthorityDBCORS(t, w)
	if w.Code != status || w.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("status=%d content-type=%q body=%s", w.Code, w.Header().Get("Content-Type"), w.Body)
	}
	var problem struct {
		Code   string `json:"code"`
		Status int    `json:"status"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &problem); err != nil || problem.Code != code || problem.Status != status {
		t.Fatalf("problem=%+v err=%v want=%s/%d", problem, err, code, status)
	}
}

func (f *authorityDBFixture) assertDocument(t *testing.T, token string, d authorityDBDocument, allowed bool) {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"query":     `query($id: ID!) { documentById(id: $id) { id effectiveBody } }`,
		"variables": map[string]string{"id": d.publicID},
	})
	if err != nil {
		t.Fatal(err)
	}
	w := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, body)
	assertAuthorityDBCORS(t, w)
	if w.Code != http.StatusOK {
		t.Fatalf("GraphQL status=%d body=%s", w.Code, w.Body)
	}
	var result struct {
		Data struct {
			Document *struct {
				ID   string `json:"id"`
				Body string `json:"effectiveBody"`
			} `json:"documentById"`
		} `json:"data"`
		Errors []struct {
			Extensions struct {
				Code string `json:"code"`
			} `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("GraphQL result=%s err=%v", w.Body, err)
	}
	if !allowed {
		// Accepted D15 transition: an existing denied document now reports
		// FORBIDDEN explicitly; the earlier null-without-error expectation was
		// an implementation gap, not a superseding owner decision.
		if len(result.Errors) != 1 || result.Errors[0].Extensions.Code != "FORBIDDEN" {
			t.Fatalf("denied document must report D15 FORBIDDEN: %s", w.Body)
		}
		if result.Data.Document != nil || bytes.Contains(w.Body.Bytes(), []byte(d.body)) {
			t.Fatalf("denied document returned: %s", w.Body)
		}
		return
	}
	if len(result.Errors) != 0 || result.Data.Document == nil || result.Data.Document.ID != d.publicID || result.Data.Document.Body != d.body {
		t.Fatalf("allowed document missing or wrong: %s", w.Body)
	}
}

func TestProductionChainPostgresRolesReplaceSignedTokenRoles(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	token := f.token(t, m.publicID, auth.Admin, auth.DM)
	for _, step := range []struct {
		name   string
		roles  []string
		status int
	}{
		{"forged admin denied", []string{"player"}, http.StatusForbidden},
		{"current admin allowed despite unchanged token", []string{"admin", "player"}, http.StatusOK},
		{"admin removal invalidates stale token", []string{"player"}, http.StatusForbidden},
	} {
		t.Run(step.name, func(t *testing.T) {
			f.exec(t, "UPDATE members SET roles = $2 WHERE id = $1", m.rowID, step.roles)
			w := authorityDBRequest(f.handler, http.MethodGet, "/v1/documents/trash", token, nil)
			if step.status == http.StatusForbidden {
				assertAuthorityDBProblem(t, w, step.status, "FORBIDDEN")
			} else if w.Code != step.status {
				t.Fatalf("current admin status=%d body=%s", w.Code, w.Body)
			}
			assertAuthorityDBCORS(t, w)
			a, err := f.runtime.Authority(context.Background(), m.publicID)
			want := make([]auth.Role, len(step.roles))
			for i, role := range step.roles {
				want[i] = auth.Role(role)
			}
			if err != nil || !slices.Equal(a.Claims().Roles, want) || a.LiveDM() {
				t.Fatalf("live SQL authority=%+v liveDM=%v err=%v wantRoles=%v", a.Claims(), a.LiveDM(), err, want)
			}
		})
	}
}

func TestProductionChainPostgresDMProfileAndRoleRevocation(t *testing.T) {
	f := newAuthorityDBFixture(t)
	reader := f.member(t, auth.DM, auth.Player)
	author := f.member(t, auth.Player)
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityDMOnly)
	token := f.token(t, reader.publicID, auth.Admin, auth.DM)
	for _, step := range []struct {
		name    string
		profile string
		allowed bool
	}{
		{"approved profile", "approved", true},
		{"pending profile", "pending", false},
		{"approval restored", "approved", true},
		{"approval revoked", "rejected", false},
		{"absent profile", "", false},
	} {
		t.Run(step.name, func(t *testing.T) {
			if step.profile == "" {
				f.exec(t, "DELETE FROM dm_profiles WHERE member_id = $1", reader.rowID)
			} else {
				f.profile(t, reader, step.profile)
			}
			f.assertDocument(t, token, d, step.allowed)
		})
	}
	f.profile(t, reader, "approved")
	f.exec(t, "UPDATE members SET roles = ARRAY['player'] WHERE id = $1", reader.rowID)
	f.assertDocument(t, token, d, false)
	// Current DB roles can grant DM authority even when the signed token has no DM.
	f.exec(t, "UPDATE members SET roles = ARRAY['dm', 'player'] WHERE id = $1", reader.rowID)
	f.assertDocument(t, f.token(t, reader.publicID, auth.Player), d, true)
}

func TestProductionChainPostgresDocumentReaderGrantUsesDocumentIdentity(t *testing.T) {
	f := newAuthorityDBFixture(t)
	reader := f.member(t, auth.DM, auth.Player)
	author := f.member(t, auth.Player)
	f.profile(t, reader, "approved")
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityRestricted)
	// Member and document public IDs are independent entity namespaces. This
	// decoy detects accidentally testing ReaderOf[authorID] instead of [docID].
	decoy := f.doc(t, author.publicID, &author, document.StatusPublished, document.VisibilityRestricted)
	token := f.token(t, reader.publicID, auth.Admin, auth.DM)
	f.exec(t, "INSERT INTO document_readers (document_id, member_id) VALUES ($1, $2)", decoy.rowID, reader.rowID)
	f.assertDocument(t, token, decoy, true)
	f.assertDocument(t, token, d, false)
	f.exec(t, "INSERT INTO document_readers (document_id, member_id) VALUES ($1, $2)", d.rowID, reader.rowID)
	f.assertDocument(t, token, d, true)
	f.profile(t, reader, "pending")
	f.assertDocument(t, token, d, false)
	f.profile(t, reader, "rejected")
	f.assertDocument(t, token, d, false)
	f.profile(t, reader, "approved")
	f.exec(t, "UPDATE members SET roles = ARRAY['player'] WHERE id = $1", reader.rowID)
	f.assertDocument(t, token, d, false)
	f.exec(t, "UPDATE members SET roles = ARRAY['dm', 'player'] WHERE id = $1", reader.rowID)
	f.assertDocument(t, token, d, true)
	f.exec(t, "DELETE FROM document_readers WHERE document_id = $1 AND member_id = $2", d.rowID, reader.rowID)
	f.assertDocument(t, token, d, false)
}

func TestProductionChainPostgresDraftOwnershipAndActiveStatus(t *testing.T) {
	f := newAuthorityDBFixture(t)
	author := f.member(t, auth.Player)
	other := f.member(t, auth.Player)
	owned := f.doc(t, "", &author, document.StatusDraft, document.VisibilityRestricted)
	authorless := f.doc(t, "", nil, document.StatusDraft, document.VisibilityPublic)
	token := f.token(t, author.publicID, auth.Admin, auth.DM)
	f.assertDocument(t, token, owned, true)
	f.assertDocument(t, f.token(t, other.publicID, auth.Admin), owned, false)
	f.assertDocument(t, "", authorless, false)
	f.assertDocument(t, "", owned, false)
	for _, status := range []string{"inactive", "banned"} {
		t.Run(status+" author rejected before document lookup", func(t *testing.T) {
			f.exec(t, "UPDATE members SET status = $2 WHERE id = $1", author.rowID, status)
			w := authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", token, nil)
			assertAuthorityDBProblem(t, w, http.StatusForbidden, "FORBIDDEN")
			body, err := json.Marshal(map[string]any{
				"query":     `query($id: ID!) { documentById(id: $id) { id effectiveBody } }`,
				"variables": map[string]string{"id": owned.publicID},
			})
			if err != nil {
				t.Fatal(err)
			}
			w = authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, body)
			assertAuthorityDBCORS(t, w)
			if w.Code != http.StatusOK {
				t.Fatalf("GraphQL status=%d body=%s", w.Code, w.Body)
			}
			var result struct {
				Errors []struct {
					Extensions struct {
						Code string `json:"code"`
					} `json:"extensions"`
				} `json:"errors"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || len(result.Errors) != 1 || result.Errors[0].Extensions.Code != "FORBIDDEN" {
				t.Fatalf("GraphQL failure=%s err=%v", w.Body, err)
			}
			if bytes.Contains(w.Body.Bytes(), []byte(owned.body)) {
				t.Fatal("inactive author response contains draft body")
			}
		})
	}
	f.exec(t, "UPDATE members SET status = 'active' WHERE id = $1", author.rowID)
	f.assertDocument(t, token, owned, true)
}

func TestProductionChainPostgresMissingAuthorityAndLookupFailureKeepCORS(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	for _, identity := range []struct {
		name string
		id   string
	}{
		{"missing member", uuid.NewString()},
		{"malformed member ID", "malformed-member-uuid"},
	} {
		t.Run(identity.name, func(t *testing.T) {
			w := authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", f.token(t, identity.id, auth.Admin), nil)
			assertAuthorityDBProblem(t, w, http.StatusForbidden, "FORBIDDEN")
		})
	}
	token := f.token(t, m.publicID, auth.Admin)
	w := authorityDBRequest(apiHandler(f.mux, f.cfg, nil), http.MethodGet, "/v1/members/me", token, nil)
	assertAuthorityDBProblem(t, w, http.StatusInternalServerError, "INTERNAL")
	// This closes only Wire's test pool, leaving the fixture's separate pool
	// connected for cleanup. A genuine repository failure must fail closed.
	f.runtime.Pool.Close()
	w = authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", token, nil)
	assertAuthorityDBProblem(t, w, http.StatusInternalServerError, "INTERNAL")
}

func TestProductionChainPostgresRevocationWhileEarlierRequestInFlight(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Admin, auth.Player)
	token := f.token(t, m.publicID, auth.Admin)
	entered, release := make(chan struct{}), make(chan struct{})
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
	}()
	f.mux.HandleFunc("GET /authority-test/in-flight", func(w http.ResponseWriter, r *http.Request) {
		// Middleware has already resolved the real SQL authority for this request.
		close(entered)
		<-release
		if !auth.FromContext(r.Context()).Has(auth.Admin) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	completed := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		completed <- authorityDBRequest(f.handler, http.MethodGet, "/authority-test/in-flight", token, nil)
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("request did not reach handler after SQL authority resolution")
	}
	f.exec(t, "UPDATE members SET roles = ARRAY['player'] WHERE id = $1", m.rowID)
	w := authorityDBRequest(f.handler, http.MethodGet, "/v1/documents/trash", token, nil)
	assertAuthorityDBProblem(t, w, http.StatusForbidden, "FORBIDDEN")
	close(release)
	select {
	case first := <-completed:
		if first.Code != http.StatusNoContent {
			t.Fatalf("already admitted request lost its authority snapshot: status=%d", first.Code)
		}
		assertAuthorityDBCORS(t, first)
	case <-time.After(5 * time.Second):
		t.Fatal("admitted request did not finish")
	}
}
