//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"testing"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func audienceGraph(t *testing.T, f *authorityDBFixture, token, query string, vars map[string]any) (map[string]json.RawMessage, []byte) {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": vars})
	if err != nil {
		t.Fatal(err)
	}
	w := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, body)
	assertAuthorityDBCORS(t, w)
	var result struct {
		Data   map[string]json.RawMessage `json:"data"`
		Errors []json.RawMessage          `json:"errors"`
	}
	if w.Code != 200 {
		t.Fatalf("GraphQL HTTP status=%d body=%s", w.Code, w.Body)
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || len(result.Errors) > 0 {
		t.Fatalf("GraphQL body=%s err=%v", w.Body, err)
	}
	return result.Data, w.Body.Bytes()
}

func TestProductionChainAudienceHandleAndFlatRoleMutationWithUnchangedJWT(t *testing.T) {
	f := newAuthorityDBFixture(t)
	m := f.member(t, auth.Player)
	author := f.member(t, auth.Player)
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	f.exec(t, `UPDATE members SET handle='Exact-Handle' WHERE id=$1`, m.rowID)
	f.exec(t, `UPDATE documents SET policy='["member:@Exact-Handle"]'::jsonb WHERE id=$1`, d.rowID)
	token := f.token(t, m.publicID, auth.Admin, auth.DM)
	f.assertDocument(t, token, d, true)
	f.exec(t, `UPDATE members SET handle='Renamed-Handle' WHERE id=$1`, m.rowID)
	f.assertDocument(t, token, d, false)
	f.exec(t, `UPDATE documents SET policy='["!member:@Exact-Handle","role:player"]'::jsonb WHERE id=$1`, d.rowID)
	f.assertDocument(t, token, d, true)
	f.exec(t, `UPDATE members SET handle='Exact-Handle' WHERE id=$1`, m.rowID)
	f.assertDocument(t, token, d, false)
	// Member allow outranks exact role deny; role deny outranks role allow.
	f.exec(t, `UPDATE documents SET policy='["member:@Exact-Handle","!role:player"]'::jsonb WHERE id=$1`, d.rowID)
	f.assertDocument(t, token, d, true)
	for _, role := range []string{"player", "dm", "archon", "lieutenant", "verifier", "admin"} {
		t.Run(role, func(t *testing.T) {
			f.exec(t, `UPDATE members SET roles=ARRAY[$2::text] WHERE id=$1`, m.rowID, role)
			f.exec(t, `UPDATE documents SET policy=$2::jsonb WHERE id=$1`, d.rowID, `["role:`+role+`"]`)
			f.assertDocument(t, token, d, true)
			if role != "admin" { // Shared admin bypass deliberately overrides denies.
				f.exec(t, `UPDATE documents SET policy=$2::jsonb WHERE id=$1`, d.rowID, `["role:`+role+`","!role:`+role+`"]`)
				f.assertDocument(t, token, d, false)
			}
		})
	}
	f.exec(t, `UPDATE members SET roles=ARRAY['player'] WHERE id=$1`, m.rowID)
	f.exec(t, `UPDATE documents SET policy='["role:admin"]'::jsonb WHERE id=$1`, d.rowID)
	f.assertDocument(t, token, d, false)
}

func TestProductionChainAudienceDirectDenialIsDistinctFromMissing(t *testing.T) {
	f := newAuthorityDBFixture(t)
	author := f.member(t, auth.Player)
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	f.exec(t, `UPDATE documents SET policy='[]'::jsonb WHERE id=$1`, d.rowID)
	for _, tc := range []struct{ name, query, id, code string }{
		{"denied ID", `query($value:ID!){ documentById(id:$value){id slug title effectiveBody}}`, d.publicID, "FORBIDDEN"},
		{"missing ID", `query($value:ID!){ documentById(id:$value){id slug title effectiveBody}}`, uuid.NewString(), ""},
		{"denied slug", `query($value:String!){ document(slug:$value){id slug title effectiveBody}}`, "authority-" + d.publicID, "FORBIDDEN"},
		{"missing slug", `query($value:String!){ document(slug:$value){id slug title effectiveBody}}`, "missing-" + uuid.NewString(), ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]any{"query": tc.query, "variables": map[string]string{"value": tc.id}})
			w := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", "", body)
			assertAuthorityDBCORS(t, w)
			var result struct {
				Data   map[string]json.RawMessage `json:"data"`
				Errors []struct {
					Extensions struct {
						Code string `json:"code"`
					} `json:"extensions"`
				} `json:"errors"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 {
				t.Fatalf("response=%s err=%v", w.Body, err)
			}
			if tc.code == "" {
				if len(result.Errors) != 0 || len(result.Data) != 1 {
					t.Fatalf("missing identity response=%s", w.Body)
				}
				for _, value := range result.Data {
					if string(value) != "null" {
						t.Fatalf("missing identity must be null: %s", w.Body)
					}
				}
			} else if len(result.Errors) != 1 || result.Errors[0].Extensions.Code != tc.code {
				t.Fatalf("denied identity response=%s", w.Body)
			}
			for _, secret := range []string{d.body, d.publicID, "authority-" + d.publicID, d.title} {
				if bytes.Contains(w.Body.Bytes(), []byte(secret)) {
					t.Fatalf("denied/missing response leaked %q: %s", secret, w.Body)
				}
			}
		})
	}
	// NULL-policy outer access stays public, while the same direct boundaries
	// now return only the approved per-viewer body projection.
	f.exec(t, `UPDATE documents SET policy='null'::jsonb,body=$2 WHERE id=$1`, d.rowID, "PUBLIC-INTRO\n> [!DM]\n> DIRECT-RAW-SECRET\n\nPUBLIC-END")
	d.body = "PUBLIC-INTRO\n> [!redacted]\n> ████████████████████\n\nPUBLIC-END"
	f.assertDocument(t, "", d, true)
	data, response := audienceGraph(t, f, "", `query($id:ID!,$slug:String!){documentById(id:$id){effectiveBody} document(slug:$slug){effectiveBody}}`, map[string]any{"id": d.publicID, "slug": d.slug})
	if bodies := bodyProjectionStrings(t, data); len(bodies) != 2 || bodies[0] != d.body || bodies[1] != d.body || bytes.Contains(response, []byte("DIRECT-RAW-SECRET")) {
		t.Fatalf("direct body projections differ or leak: %s", response)
	}
}

func TestProductionChainAudienceFullPagesReadableTotalsBacklinksAndMap(t *testing.T) {
	f := newAuthorityDBFixture(t)
	reader := f.member(t, auth.Player)
	author := f.member(t, auth.Player)
	f.exec(t, `UPDATE members SET handle='Exact-Handle' WHERE id=$1`, reader.rowID)
	token := f.token(t, reader.publicID, auth.Admin, auth.DM)
	prefix := "audience-page-" + uuid.NewString()
	docs := make([]authorityDBDocument, 0, 8)
	fixtureIDs := []string{
		"90000000-0000-4000-8000-000000000003", "90000000-0000-4000-8000-000000000001",
		"90000000-0000-4000-8000-000000000002", "90000000-0000-4000-8000-000000000004",
		"90000000-0000-4000-8000-000000000005", "90000000-0000-4000-8000-000000000006",
		"90000000-0000-4000-8000-000000000007", "90000000-0000-4000-8000-000000000008",
	}
	for i := 0; i < 8; i++ {
		d := f.doc(t, fixtureIDs[i], &author, document.StatusPublished, document.VisibilityPublic)
		title := prefix + " " + string(rune('A'+i))
		d.title = title
		f.exec(t, `UPDATE documents SET kind='codex_entry',category='location/fixture',title=$2,updated_at='2020-01-01T00:00:00Z' WHERE id=$1`, d.rowID, title)
		docs = append(docs, d)
	}
	// First three are readable (two public and one intentional exact-handle
	// grant). Newer hidden rows precede them in the raw ordering.
	f.exec(t, `UPDATE documents SET policy='["member:@Exact-Handle"]'::jsonb WHERE id=$1`, docs[1].rowID)
	f.exec(t, `UPDATE documents SET policy='["!member:@Exact-Handle","role:player"]'::jsonb,updated_at='2030-01-01T00:00:00Z' WHERE id=$1`, docs[3].rowID)
	f.exec(t, `UPDATE documents SET status='draft',policy='["role:player"]'::jsonb,updated_at='2030-01-01T00:00:00Z' WHERE id=$1`, docs[4].rowID)
	f.exec(t, `UPDATE documents SET visibility='restricted',updated_at='2030-01-01T00:00:00Z' WHERE id=$1`, docs[5].rowID)
	f.exec(t, `UPDATE documents SET policy='{}'::jsonb,updated_at='2030-01-01T00:00:00Z' WHERE id=$1`, docs[6].rowID)
	f.exec(t, `UPDATE documents SET deleted_at=now(),updated_at='2030-01-01T00:00:00Z' WHERE id=$1`, docs[7].rowID)
	// Equal matching title terms and update timestamps leave the public UUID
	// descending tie-break; insertion order deliberately differs.
	expected := []string{"90000000-0000-4000-8000-000000000003", "90000000-0000-4000-8000-000000000002", "90000000-0000-4000-8000-000000000001"}
	for _, tc := range []struct {
		offset int
		want   []string
	}{{0, expected[:2]}, {2, expected[2:]}, {3, []string{}}} {
		data, raw := audienceGraph(t, f, token, `query($search:String!,$offset:Int!){documents(filters:{search:$search},limit:2,offset:$offset){total items{id title slug}} search(query:$search,limit:2,offset:$offset){documentTotal documents{id title slug}} codexDirectory(search:$search,limit:2,offset:$offset){total items{id title slug}}}`, map[string]any{"search": prefix, "offset": tc.offset})
		var list struct {
			Total int `json:"total"`
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
		}
		var directory struct {
			Total int `json:"total"`
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
		}
		var search struct {
			Total int `json:"documentTotal"`
			Items []struct {
				ID string `json:"id"`
			} `json:"documents"`
		}
		if err := json.Unmarshal(data["documents"], &list); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(data["codexDirectory"], &directory); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(data["search"], &search); err != nil {
			t.Fatal(err)
		}
		listIDs, searchIDs, directoryIDs := []string{}, []string{}, []string{}
		for _, item := range list.Items {
			listIDs = append(listIDs, item.ID)
		}
		for _, item := range search.Items {
			searchIDs = append(searchIDs, item.ID)
		}
		for _, item := range directory.Items {
			directoryIDs = append(directoryIDs, item.ID)
		}
		if directory.Total != 3 || !slices.Equal(directoryIDs, tc.want) || list.Total != 3 || search.Total != 3 || !slices.Equal(listIDs, tc.want) || !slices.Equal(searchIDs, tc.want) {
			t.Fatalf("offset %d list=%+v search=%+v want=%v response=%s", tc.offset, list, search, tc.want, raw)
		}
		assertNoHiddenAudienceDocuments(t, raw, docs[3:])
	}
	// The same verified handle participates in SQL denial. The next request
	// with an unchanged JWT loses the old grant and the old deny.
	f.exec(t, `UPDATE members SET handle='Renamed-Handle' WHERE id=$1`, reader.rowID)
	data, raw := audienceGraph(t, f, token, `query($search:String!){documents(filters:{search:$search},limit:50){total items{id}}}`, map[string]any{"search": prefix})
	var renamed struct {
		Total int `json:"total"`
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data["documents"], &renamed); err != nil {
		t.Fatal(err)
	}
	if renamed.Total != 3 {
		t.Fatalf("renamed readable total=%d response=%s", renamed.Total, raw)
	}
	found := []string{}
	for _, item := range renamed.Items {
		found = append(found, item.ID)
	}
	if !slices.Contains(found, docs[3].publicID) || slices.Contains(found, docs[1].publicID) {
		t.Fatalf("handle SQL grant/deny not current: %s", raw)
	}
	f.exec(t, `UPDATE members SET handle='Exact-Handle' WHERE id=$1`, reader.rowID)

	target := f.doc(t, "", nil, document.StatusPublished, document.VisibilityPublic)
	for _, source := range docs {
		f.exec(t, `INSERT INTO document_links(source_id,document_target_id,relation) VALUES($1,$2,'fixture')`, source.rowID, target.rowID)
	}
	data, raw = audienceGraph(t, f, token, `query($slug:String!){documentBacklinks(slug:$slug){documentId targetId relation}}`, map[string]any{"slug": "authority-" + target.publicID})
	var links []struct {
		ID string `json:"documentId"`
	}
	if err := json.Unmarshal(data["documentBacklinks"], &links); err != nil {
		t.Fatal(err)
	}
	linkIDs := []string{}
	for _, link := range links {
		linkIDs = append(linkIDs, link.ID)
	}
	if !slices.Equal(linkIDs, expected) {
		t.Fatalf("backlinks=%v want=%v response=%s", linkIDs, expected, raw)
	}
	assertNoHiddenAudienceDocuments(t, raw, docs[3:])
	assertAudienceBacklinkCount(t, f, reader, "authority-"+target.publicID, 3)

	var mapID int64
	atlas := "AUDIENCE-" + uuid.NewString()
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO maps(name,atlas_code,map_kind) VALUES($1,$1,'pointcrawl') RETURNING id`, atlas).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		f.exec(t, `DELETE FROM pointcrawl_edges WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM pointcrawl_entry_links WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM pointcrawl_nodes WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM maps WHERE id=$1`, mapID)
	})
	for i, d := range docs {
		nodeID := fmt.Sprintf("80000000-0000-4000-8000-%012d", i+1)
		var rowID int64
		if err := f.pool.QueryRow(context.Background(), `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) VALUES($1,$2,'audience-node',0,0,now()) RETURNING id`, nodeID, mapID).Scan(&rowID); err != nil {
			t.Fatal(err)
		}
		f.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,'location',now(),$4)`, mapID, rowID, d.rowID, author.rowID)
	}
	type pointcrawlPage struct {
		Nodes []struct {
			ID    string `json:"id"`
			Links []struct {
				ID string `json:"documentId"`
			} `json:"linkedEntries"`
		} `json:"pointcrawlNodes"`
	}
	for _, tc := range []struct {
		offset int
		want   []string
	}{{0, []string{docs[0].publicID, docs[1].publicID}}, {2, []string{docs[2].publicID}}, {3, []string{}}} {
		data, raw := audienceGraph(t, f, token, `query($atlas:String!,$offset:Int!){map(atlasCode:$atlas){pointcrawlNodes(limit:2,offset:$offset){id linkedEntries{documentId}}}}`, map[string]any{"atlas": atlas, "offset": tc.offset})
		var page pointcrawlPage
		if err := json.Unmarshal(data["map"], &page); err != nil {
			t.Fatal(err)
		}
		ids := []string{}
		for _, node := range page.Nodes {
			if len(node.Links) != 1 {
				t.Fatalf("expected one visible location per node: %s", raw)
			}
			ids = append(ids, node.Links[0].ID)
		}
		if !slices.Equal(ids, tc.want) {
			t.Fatalf("pointcrawl offset=%d ids=%v want=%v response=%s", tc.offset, ids, tc.want, raw)
		}
		assertNoHiddenAudienceDocuments(t, raw, docs[3:])
	}
	// Pointcrawl locations use canonical readability, without the retired
	// MapView category/kind classifier.
	for _, change := range []struct{ sql, value string }{
		{"UPDATE documents SET category=$2 WHERE id=$1", "event/fixture"},
		{"UPDATE documents SET kind=$2 WHERE id=$1", "rule"},
	} {
		f.exec(t, change.sql, docs[0].rowID, change.value)
		data, raw := audienceGraph(t, f, token, `query($atlas:String!){map(atlasCode:$atlas){pointcrawlNodes{ id linkedEntries{documentId}}}}`, map[string]any{"atlas": atlas})
		var page pointcrawlPage
		if err := json.Unmarshal(data["map"], &page); err != nil {
			t.Fatal(err)
		}
		if len(page.Nodes) != 3 || !bytes.Contains(raw, []byte(docs[0].publicID)) {
			t.Fatalf("readable location lost after metadata-only change: %s", raw)
		}
		f.exec(t, `UPDATE documents SET category='location/fixture',kind='codex_entry' WHERE id=$1`, docs[0].rowID)
	}
	admin := f.member(t, auth.Admin)
	data, raw = audienceGraph(t, f, f.token(t, admin.publicID), `query($atlas:String!){map(atlasCode:$atlas){pointcrawlNodes{id linkedEntries{documentId}}}}`, map[string]any{"atlas": atlas})
	var privilegedMap pointcrawlPage
	if err := json.Unmarshal(data["map"], &privilegedMap); err != nil {
		t.Fatal(err)
	}
	if len(privilegedMap.Nodes) != 7 || !bytes.Contains(raw, []byte(docs[4].publicID)) || bytes.Contains(raw, []byte(docs[7].publicID)) {
		t.Fatalf("pointcrawl admin admission/deleted boundary differs: %s", raw)
	}
	// Policy changes alter retained node/link membership on the next request.
	f.exec(t, `UPDATE documents SET policy='[]'::jsonb WHERE id=$1`, docs[0].rowID)
	data, raw = audienceGraph(t, f, token, `query($atlas:String!,$slug:String!){map(atlasCode:$atlas){pointcrawlNodes{id linkedEntries{documentId}}} documentBacklinks(slug:$slug){documentId}}`, map[string]any{"atlas": atlas, "slug": "authority-" + target.publicID})
	var page pointcrawlPage
	if err := json.Unmarshal(data["map"], &page); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data["documentBacklinks"], &links); err != nil {
		t.Fatal(err)
	}
	assertAudienceBacklinkCount(t, f, reader, "authority-"+target.publicID, 2)
	if len(page.Nodes) != 2 || len(links) != 2 || bytes.Contains(raw, []byte(docs[0].publicID)) {
		t.Fatalf("policy change did not change scoped link/node membership: %s", raw)
	}

}

func assertNoHiddenAudienceDocuments(t *testing.T, raw []byte, docs []authorityDBDocument) {
	t.Helper()
	for _, d := range docs {
		for _, secret := range []string{d.publicID, d.slug, d.body, d.title} {
			if bytes.Contains(raw, []byte(secret)) {
				t.Fatalf("hidden document bytes %q in response=%s", secret, raw)
			}
		}
	}
}

func TestProductionChainRevisionsAndTrashUsePrivilegedQueryBoundary(t *testing.T) {
	f := newAuthorityDBFixture(t)
	author := f.member(t, auth.Player)
	other := f.member(t, auth.Player)
	dm := f.member(t, auth.DM)
	verifier := f.member(t, auth.Role("verifier"))
	admin := f.member(t, auth.Admin)
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	f.exec(t, `INSERT INTO document_revisions(document_id,rev,reason,title,body) VALUES($1,1,'private-reason','private-revision-title','private-revision-body')`, d.rowID)
	for _, tc := range []struct {
		name, token string
		status      int
	}{
		{"anonymous", "", 401}, {"unrelated player", f.token(t, other.publicID, auth.Admin), 403},
		{"unrelated DM", f.token(t, dm.publicID, auth.Admin), 403}, {"unrelated verifier", f.token(t, verifier.publicID, auth.Admin), 403},
		{"author", f.token(t, author.publicID), 200}, {"admin", f.token(t, admin.publicID), 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := authorityDBRequest(f.handler, http.MethodGet, "/v1/documents/"+d.publicID+"/revisions", tc.token, nil)
			assertAuthorityDBCORS(t, w)
			if tc.status == 200 {
				if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte("private-revision-title")) {
					t.Fatalf("revision response=%d %s", w.Code, w.Body)
				}
			} else {
				code := "FORBIDDEN"
				if tc.status == 401 {
					code = "UNAUTHENTICATED"
				}
				assertAuthorityDBProblem(t, w, tc.status, code)
				if bytes.Contains(w.Body.Bytes(), []byte("private-revision")) {
					t.Fatal("revision title leaked")
				}
			}
			w = authorityDBRequest(f.handler, http.MethodGet, "/v1/documents/trash", tc.token, nil)
			if tc.name == "admin" {
				if w.Code != 200 {
					t.Fatalf("admin trash status=%d %s", w.Code, w.Body)
				}
			} else {
				status, code := 403, "FORBIDDEN"
				if tc.token == "" {
					status, code = 401, "UNAUTHENTICATED"
				}
				assertAuthorityDBProblem(t, w, status, code)
			}
		})
	}
	// Soft deletion must preserve the former author/admin revision recovery
	// behavior; the privilege gate loads only the revision target's author.
	f.exec(t, `UPDATE documents SET deleted_at=now() WHERE id=$1`, d.rowID)
	for _, m := range []authorityDBMember{author, admin} {
		w := authorityDBRequest(f.handler, http.MethodGet, "/v1/documents/"+d.publicID+"/revisions", f.token(t, m.publicID), nil)
		assertAuthorityDBCORS(t, w)
		if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte("private-revision-title")) {
			t.Fatalf("trashed revision recovery failed: %d %s", w.Code, w.Body)
		}
	}
	w := authorityDBRequest(f.handler, http.MethodGet, "/v1/documents/"+d.publicID+"/revisions", f.token(t, other.publicID, auth.Admin), nil)
	assertAuthorityDBProblem(t, w, 403, "FORBIDDEN")

}

func assertAudienceBacklinkCount(t *testing.T, f *authorityDBFixture, member authorityDBMember, slug string, want int64) {
	t.Helper()
	a, err := f.runtime.Authority(context.Background(), member.publicID)
	if err != nil {
		t.Fatal(err)
	}
	count, err := f.runtime.Documents.CountBacklinks(auth.WithAuthority(context.Background(), a), slug)
	if err != nil || count != want {
		t.Fatalf("scoped backlink count=%d err=%v want=%d", count, err, want)
	}
}
