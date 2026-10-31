//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestProductionChainBodyRedactionEveryDocumentProjection(t *testing.T) {
	f := newAuthorityDBFixture(t)
	author := f.member(t, auth.Player)
	matching := f.member(t, auth.Player)
	other := f.member(t, auth.Player)
	dm := f.member(t, auth.DM)
	admin := f.member(t, auth.Admin)
	f.exec(t, `UPDATE members SET handle='Exact-Handle' WHERE id=$1`, matching.rowID)
	f.exec(t, `UPDATE members SET handle='Other' WHERE id=$1`, dm.rowID)
	f.profile(t, dm, "approved")
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	prefix := "body-projection-" + uuid.NewString()
	raw := strings.Join([]string{
		"PUBLIC-INTRO",
		"> [! DM ]", "> DM-SECRET",
		"", "> [!Dm:@Exact-Handle]", "> HANDLE-SECRET",
		"", "> [!dm:@Exact-Handle]", "> [!dm:]", "> MIXED-SECRET",
		"", "> [!dm", "> UNTERMINATED-SECRET",
		"", "> [!audience role:player]", "> UNKNOWN-AUDIENCE-SECRET",
		"", "> ordinary surrounding quote", ">> [!DM]", ">> NESTED-SECRET", "> ordinary surrounding tail",
		"", "Bare [!DM] BARE-SECRET", "BARE-FOLLOWING-VISIBLE",
		"", "```md", "[!DM] FENCE-SECRET", "```",
		"", "> [!spoiler]", "> SPOILER-VISIBLE",
		"", "> [!note]", "> ORDINARY-NOTE-VISIBLE", "> [!warning]", "> ORDINARY-WARNING-VISIBLE",
		"", "PUBLIC-END",
	}, "\n")
	// Explicit document grants exercise the same block projection as nullable
	// legacy policies; the legacy matrix below preserves its separate outer gate.
	f.exec(t, `UPDATE documents SET kind='codex_entry',title=$2,body=$3,policy='["role:player","role:dm"]'::jsonb WHERE id=$1`, d.rowID, prefix, raw)
	d.body = raw
	var questRow int64
	questID := uuid.NewString()
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO quests(public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by) VALUES($1::uuid,$2,ARRAY['standard'],$3,now()+interval '1 day',$4,$3) RETURNING id`, questID, "body-"+questID, author.rowID, d.rowID).Scan(&questRow); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { f.exec(t, `DELETE FROM quests WHERE id=$1`, questRow) })
	query := `query($id:ID!,$slug:String!,$search:String!,$quest:ID!){
        documentById(id:$id){effectiveBody}
        document(slug:$slug){effectiveBody}
        documents(filters:{search:$search}){total items{effectiveBody}}
        codexDirectory(search:$search){total items{effectiveBody}}
        quest(id:$quest){briefDocument{effectiveBody}}
    }`
	vars := map[string]any{"id": d.publicID, "slug": d.slug, "search": prefix, "quest": questID}
	for _, tc := range []struct {
		name   string
		member authorityDBMember
		roles  []auth.Role
		hidden []string
		raw    bool
	}{
		{"matching member", matching, []auth.Role{auth.Admin, auth.DM}, []string{"DM-SECRET", "MIXED-SECRET", "UNTERMINATED-SECRET", "UNKNOWN-AUDIENCE-SECRET", "NESTED-SECRET", "BARE-SECRET", "FENCE-SECRET"}, false},
		{"other member", other, []auth.Role{auth.Admin, auth.DM}, []string{"DM-SECRET", "HANDLE-SECRET", "MIXED-SECRET", "UNTERMINATED-SECRET", "UNKNOWN-AUDIENCE-SECRET", "NESTED-SECRET", "BARE-SECRET", "FENCE-SECRET"}, false},
		{"DM mismatch handle", dm, []auth.Role{auth.Admin}, []string{"HANDLE-SECRET", "MIXED-SECRET", "UNTERMINATED-SECRET", "UNKNOWN-AUDIENCE-SECRET"}, false},
		{"author", author, nil, nil, true}, {"admin", admin, nil, nil, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var audit bytes.Buffer
			previousLogger := slog.Default()
			if tc.name == "admin" {
				slog.SetDefault(slog.New(slog.NewJSONHandler(&audit, nil)))
				defer slog.SetDefault(previousLogger)
			}
			data, response := audienceGraph(t, f, f.token(t, tc.member.publicID, tc.roles...), query, vars)
			if tc.name == "admin" {
				if !strings.Contains(audit.String(), "audience.admin_override") {
					t.Fatalf("admin bypass audit missing: %s", &audit)
				}
				for _, secret := range []string{"DM-SECRET", "HANDLE-SECRET", "member:@Exact-Handle"} {
					if strings.Contains(audit.String(), secret) {
						t.Fatalf("audit leaked %q: %s", secret, &audit)
					}
				}
			}
			bodies := bodyProjectionStrings(t, data)
			if len(bodies) != 5 {
				t.Fatalf("projection count=%d response=%s", len(bodies), response)
			}
			for _, body := range bodies {
				if body != bodies[0] {
					t.Fatalf("the five projections disagree: %q vs %q", body, bodies[0])
				}
				for _, visible := range []string{"PUBLIC-INTRO", "PUBLIC-END", "SPOILER-VISIBLE", "ORDINARY-NOTE-VISIBLE", "ORDINARY-WARNING-VISIBLE", "BARE-FOLLOWING-VISIBLE"} {
					if !strings.Contains(body, visible) {
						t.Fatalf("ordinary text %q missing body=%q", visible, body)
					}
				}
				if tc.raw {
					if body != raw {
						t.Fatalf("author/admin raw body altered: %q", body)
					}
				} else {
					if !strings.Contains(body, "> [!redacted]") {
						t.Fatalf("missing redaction placeholder body=%q", body)
					}
					if tc.name == "matching member" && !strings.Contains(body, "HANDLE-SECRET") {
						t.Fatalf("matching handle lost entitled block: %q", body)
					}
					if tc.name == "DM mismatch handle" && !strings.Contains(body, "DM-SECRET") {
						t.Fatalf("literal role DM lost entitled block: %q", body)
					}
				}
			}
			for _, secret := range tc.hidden {
				if bytes.Contains(response, []byte(secret)) {
					t.Fatalf("hidden bytes %q escaped GraphQL projection: %s", secret, response)
				}
			}
		})
	}
	// Unchanged JWT and current member handle must change the block projection.
	token := f.token(t, matching.publicID, auth.Admin, auth.DM)
	f.exec(t, `UPDATE members SET handle='Renamed-Handle' WHERE id=$1`, matching.rowID)
	_, response := audienceGraph(t, f, token, query, vars)
	if bytes.Contains(response, []byte("HANDLE-SECRET")) {
		t.Fatalf("stale JWT/current handle rename leaked scoped block: %s", response)
	}
	// A known outer denial cannot be re-granted by a matching inner marker.
	f.exec(t, `UPDATE documents SET policy='[]'::jsonb WHERE id=$1`, d.rowID)
	payload, _ := json.Marshal(map[string]any{"query": `query($quest:ID!){quest(id:$quest){briefDocument{effectiveBody}}}`, "variables": map[string]string{"quest": questID}})
	w := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, payload)
	assertAuthorityDBCORS(t, w)
	var nested struct {
		Data struct {
			Quest struct {
				Brief *json.RawMessage `json:"briefDocument"`
			} `json:"quest"`
		} `json:"data"`
		Errors []json.RawMessage `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &nested); err != nil || w.Code != http.StatusOK || len(nested.Errors) != 0 || nested.Data.Quest.Brief != nil {
		t.Fatalf("hidden nested reference must be nullable: %s err=%v", w.Body, err)
	}
	for _, secret := range []string{"PUBLIC-INTRO", "DM-SECRET", "HANDLE-SECRET", "MIXED-SECRET"} {
		if bytes.Contains(w.Body.Bytes(), []byte(secret)) {
			t.Fatalf("denied outer leaked %q: %s", secret, w.Body)
		}
	}
}

func TestProductionChainLegacyBodyScopesEveryProjection(t *testing.T) {
	f := newAuthorityDBFixture(t)
	author := f.member(t, auth.Player)
	matching := f.member(t, auth.Player)
	other := f.member(t, auth.Player)
	dm := f.member(t, auth.DM)
	archon := f.member(t, auth.Role("archon"))
	admin := f.member(t, auth.Admin)
	f.exec(t, `UPDATE members SET handle='Exact-Handle' WHERE id=$1`, matching.rowID)
	f.exec(t, `UPDATE members SET handle='DM-Other' WHERE id=$1`, dm.rowID)
	f.exec(t, `UPDATE members SET handle='Archon-Other' WHERE id=$1`, archon.rowID)
	f.profile(t, dm, "approved")
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	prefix := "legacy-body-projection-" + uuid.NewString()
	raw := "PUBLIC\n> [!DM]\n> DM-SECRET\n\n> [!dm:@Exact-Handle]\n> HANDLE-SECRET\n\n> [!dm:]\n> MALFORMED-SECRET\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	redacted := "PUBLIC\n> [!redacted]\n> ████████████████████\n\n> [!redacted]\n> ████████████████████\n\n> [!redacted]\n> ████████████████████\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	dmBody := "PUBLIC\n> [!DM]\n> DM-SECRET\n\n> [!redacted]\n> ████████████████████\n\n> [!redacted]\n> ████████████████████\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	memberBody := "PUBLIC\n> [!redacted]\n> ████████████████████\n\n> [!dm:@Exact-Handle]\n> HANDLE-SECRET\n\n> [!redacted]\n> ████████████████████\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	f.exec(t, `UPDATE documents SET kind='codex_entry',title=$2,body=$3 WHERE id=$1`, d.rowID, prefix, raw)
	d.body = raw
	f.exec(t, `INSERT INTO document_readers(document_id,member_id) VALUES($1,$2),($1,$3)`, d.rowID, dm.rowID, archon.rowID)
	var questRow int64
	questID := uuid.NewString()
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO quests(public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by) VALUES($1::uuid,$2,ARRAY['standard'],$3,now()+interval '1 day',$4,$3) RETURNING id`, questID, "body-"+questID, author.rowID, d.rowID).Scan(&questRow); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { f.exec(t, `DELETE FROM quests WHERE id=$1`, questRow) })
	query := `query($id:ID!,$slug:String!,$search:String!,$quest:ID!){
        documentById(id:$id){effectiveBody}
        document(slug:$slug){effectiveBody}
        documents(filters:{search:$search}){total items{effectiveBody}}
        codexDirectory(search:$search){total items{effectiveBody}}
        quest(id:$quest){briefDocument{effectiveBody}}
    }`
	vars := map[string]any{"id": d.publicID, "slug": d.slug, "search": prefix, "quest": questID}
	viewers := []struct {
		name   string
		member authorityDBMember
		want   string
		tier   bool
		raw    bool
	}{
		{"anonymous", authorityDBMember{}, redacted, false, false},
		{"matching player", matching, memberBody, false, false},
		{"other player", other, redacted, false, false},
		{"DM different handle", dm, dmBody, true, false},
		{"archon different handle without DM profile", archon, redacted, true, false},
		{"author", author, raw, true, true},
		{"admin", admin, raw, true, true},
	}
	for _, policy := range []string{"SQL NULL", "JSON null"} {
		t.Run(policy, func(t *testing.T) {
			if policy == "SQL NULL" {
				f.exec(t, `UPDATE documents SET policy=NULL WHERE id=$1`, d.rowID)
			} else {
				f.exec(t, `UPDATE documents SET policy='null'::jsonb WHERE id=$1`, d.rowID)
			}
			for _, visibility := range []document.Visibility{document.VisibilityPublic, document.VisibilityDMOnly, document.VisibilityRestricted} {
				f.exec(t, `UPDATE documents SET visibility=$2 WHERE id=$1`, d.rowID, string(visibility))
				for _, tc := range viewers {
					t.Run(string(visibility)+"/"+tc.name, func(t *testing.T) {
						var audit bytes.Buffer
						if tc.name == "admin" {
							previous := slog.Default()
							slog.SetDefault(slog.New(slog.NewJSONHandler(&audit, nil)))
							defer slog.SetDefault(previous)
						}
						token := ""
						ctx := context.Background()
						var actor auth.Authority
						if tc.member.publicID != "" {
							// Deliberately stale elevated JWT roles never grant a block.
							token = f.token(t, tc.member.publicID, auth.Admin, auth.DM)
							a, err := f.runtime.Authority(ctx, tc.member.publicID)
							if err != nil {
								t.Fatal(err)
							}
							actor = a
						}
						batch, err := f.runtime.Resolver.Services.DocumentQueries.BatchDocuments(ctx, actor, []document.DocumentKey{{ID: d.publicID}})
						if visibility != document.VisibilityPublic && !tc.tier {
							assertBodyProjectionDenied(t, f, token, query, vars, raw)
							if err != nil || len(batch) != 1 || batch[0].Err != nil || batch[0].Value != nil {
								t.Fatalf("outer-denied native batch=%+v err=%v", batch, err)
							}
							return
						}
						data, response := audienceGraph(t, f, token, query, vars)
						bodies := bodyProjectionStrings(t, data)
						if len(bodies) != 5 {
							t.Fatalf("projection count=%d response=%s", len(bodies), response)
						}
						for _, body := range bodies {
							if body != tc.want {
								t.Fatalf("body=%q want=%q response=%s", body, tc.want, response)
							}
						}
						if err != nil || len(batch) != 1 || batch[0].Err != nil || batch[0].Value == nil || batch[0].Value.EffectiveBody == nil || *batch[0].Value.EffectiveBody != tc.want {
							t.Fatalf("native batch=%+v want=%q err=%v", batch, tc.want, err)
						}
						for _, secret := range []string{"DM-SECRET", "HANDLE-SECRET", "MALFORMED-SECRET"} {
							if !strings.Contains(tc.want, secret) && bytes.Contains(response, []byte(secret)) {
								t.Fatalf("hidden raw bytes %q escaped response=%s", secret, response)
							}
						}
						if !tc.raw && strings.Contains(*batch[0].Value.EffectiveBody, "MALFORMED-SECRET") {
							t.Fatal("malformed raw bytes escaped native batch")
						}
						if tc.name == "admin" {
							if !strings.Contains(audit.String(), "audience.admin_override") {
								t.Fatalf("nullable-policy admin bypass audit missing: %s", &audit)
							}
							for _, secret := range []string{"DM-SECRET", "HANDLE-SECRET", "MALFORMED-SECRET", "member:@Exact-Handle"} {
								if strings.Contains(audit.String(), secret) {
									t.Fatalf("nullable-policy audit leaked %q: %s", secret, &audit)
								}
							}
						}
					})
				}
			}
		})
	}
	// An inner matching handle cannot rescue a missing restricted-reader grant.
	f.exec(t, `DELETE FROM document_readers WHERE document_id=$1 AND member_id=$2`, d.rowID, archon.rowID)
	// Release the unique handle after the matching-player matrix, before the
	// archon takes it for the missing-reader/non-regrant case.
	f.exec(t, `UPDATE members SET handle='Matching-Retired' WHERE id=$1`, matching.rowID)
	f.exec(t, `UPDATE members SET handle='Exact-Handle' WHERE id=$1`, archon.rowID)
	assertBodyProjectionDenied(t, f, f.token(t, archon.publicID, auth.Admin, auth.DM), query, vars, raw)
	a, err := f.runtime.Authority(context.Background(), archon.publicID)
	if err != nil {
		t.Fatal(err)
	}
	batch, err := f.runtime.Resolver.Services.DocumentQueries.BatchDocuments(context.Background(), a, []document.DocumentKey{{ID: d.publicID}})
	if err != nil || len(batch) != 1 || batch[0].Err != nil || batch[0].Value != nil {
		t.Fatalf("matching handle regranted missing reader in batch=%+v err=%v", batch, err)
	}
	// The same JWT must follow current member handles and literal role strings
	// on the next request. The public outer grant remains unchanged throughout.
	// Release Exact-Handle again before the DM member's live-handle transitions.
	f.exec(t, `UPDATE members SET handle='Archon-Retired' WHERE id=$1`, archon.rowID)
	f.exec(t, `UPDATE documents SET visibility='public' WHERE id=$1`, d.rowID)
	token := f.token(t, dm.publicID, auth.Admin, auth.DM)
	for _, step := range []struct {
		name, role, handle, want string
	}{
		{"current DM", "dm", "DM-Other", dmBody},
		{"current archon is not literal block DM", "archon", "DM-Other", redacted},
		{"matching current archon handle", "archon", "Exact-Handle", memberBody},
		{"renamed current archon handle", "archon", "Renamed-Handle", redacted},
	} {
		t.Run(step.name+" with unchanged JWT", func(t *testing.T) {
			f.exec(t, `UPDATE members SET roles=ARRAY[$2::text],handle=$3 WHERE id=$1`, dm.rowID, step.role, step.handle)
			data, response := audienceGraph(t, f, token, query, vars)
			bodies := bodyProjectionStrings(t, data)
			if len(bodies) != 5 {
				t.Fatalf("projection count=%d response=%s", len(bodies), response)
			}
			for _, body := range bodies {
				if body != step.want {
					t.Fatalf("current authority body=%q want=%q response=%s", body, step.want, response)
				}
			}
			for _, secret := range []string{"DM-SECRET", "HANDLE-SECRET", "MALFORMED-SECRET"} {
				if !strings.Contains(step.want, secret) && bytes.Contains(response, []byte(secret)) {
					t.Fatalf("current authority leaked %q response=%s", secret, response)
				}
			}
		})
	}
}

func assertBodyProjectionDenied(t *testing.T, f *authorityDBFixture, token, query string, vars map[string]any, raw string) {
	t.Helper()
	payload, err := json.Marshal(map[string]any{"query": query, "variables": vars})
	if err != nil {
		t.Fatal(err)
	}
	w := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, payload)
	assertAuthorityDBCORS(t, w)
	var result struct {
		Data   map[string]json.RawMessage `json:"data"`
		Errors []struct {
			Path       []string              `json:"path"`
			Extensions struct{ Code string } `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != http.StatusOK || len(result.Errors) != 2 {
		t.Fatalf("denial response=%s err=%v", w.Body, err)
	}
	for _, e := range result.Errors {
		if e.Extensions.Code != "FORBIDDEN" || len(e.Path) != 1 || e.Path[0] != "document" && e.Path[0] != "documentById" {
			t.Fatalf("denial code=%q response=%s", e.Extensions.Code, w.Body)
		}
	}
	var nested struct {
		Brief *json.RawMessage `json:"briefDocument"`
	}
	if err := json.Unmarshal(result.Data["quest"], &nested); err != nil || nested.Brief != nil {
		t.Fatalf("hidden nested reference=%s err=%v", result.Data["quest"], err)
	}
	if bodies := bodyProjectionStrings(t, result.Data); len(bodies) != 0 {
		t.Fatalf("outer-denied body projection=%q", bodies)
	}
	for _, name := range []string{"documents", "codexDirectory"} {
		var list struct {
			Total int               `json:"total"`
			Items []json.RawMessage `json:"items"`
		}
		if err := json.Unmarshal(result.Data[name], &list); err != nil || list.Total != 0 || len(list.Items) != 0 {
			t.Fatalf("denied enumeration %s=%s err=%v", name, result.Data[name], err)
		}
	}
	for _, secret := range []string{raw, "PUBLIC", "DM-SECRET", "HANDLE-SECRET", "MALFORMED-SECRET", "SPOILER-VISIBLE"} {
		if bytes.Contains(w.Body.Bytes(), []byte(secret)) {
			t.Fatalf("outer denial leaked %q: %s", secret, w.Body)
		}
	}
}

func TestProductionChainLegacyPublicAnonymousHasNoRawBodyFallback(t *testing.T) {
	f := newAuthorityDBFixture(t)
	author := f.member(t, auth.Player)
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	raw := "> [!DM]\n> LEGACY-UPPERCASE-SECRET\n\n> [!dm:@Exact-Handle]\n> LEGACY-HANDLE-SECRET\n\n> [!dm:\n> LEGACY-MALFORMED-SECRET\n\n> [!note]\n> LEGACY-PUBLIC-NOTE"
	f.exec(t, `UPDATE documents SET body=$2 WHERE id=$1`, d.rowID, raw)
	for _, policy := range []string{"null", ""} {
		if policy == "" {
			f.exec(t, `UPDATE documents SET policy=NULL WHERE id=$1`, d.rowID)
		} else {
			f.exec(t, `UPDATE documents SET policy='null'::jsonb WHERE id=$1`, d.rowID)
		}
		data, response := audienceGraph(t, f, "", `query($id:ID!,$slug:String!){documentById(id:$id){effectiveBody} document(slug:$slug){effectiveBody}}`, map[string]any{"id": d.publicID, "slug": d.slug})
		bodies := bodyProjectionStrings(t, data)
		if len(bodies) != 2 {
			t.Fatalf("legacy public projections missing: %s", response)
		}
		for _, body := range bodies {
			if !strings.Contains(body, "LEGACY-PUBLIC-NOTE") || !strings.Contains(body, "> [!redacted]") {
				t.Fatalf("legacy public projection=%q", body)
			}
		}
		for _, secret := range []string{"LEGACY-UPPERCASE-SECRET", "LEGACY-HANDLE-SECRET", "LEGACY-MALFORMED-SECRET"} {
			if bytes.Contains(response, []byte(secret)) {
				t.Fatalf("legacy null policy fallback leaked %q: %s", secret, response)
			}
		}
	}
}

func bodyProjectionStrings(t *testing.T, data map[string]json.RawMessage) []string {
	t.Helper()
	bodies := []string{}
	var walk func(any)
	walk = func(value any) {
		switch node := value.(type) {
		case map[string]any:
			for key, child := range node {
				if key == "effectiveBody" {
					body, ok := child.(string)
					if !ok {
						t.Fatalf("effectiveBody is not scoped text: %v", child)
					}
					bodies = append(bodies, body)
				} else {
					walk(child)
				}
			}
		case []any:
			for _, child := range node {
				walk(child)
			}
		}
	}
	for _, raw := range data {
		var value any
		if err := json.Unmarshal(raw, &value); err != nil {
			t.Fatal(err)
		}
		walk(value)
	}
	return bodies
}
