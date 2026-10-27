//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestProductionChainPrivilegedSQLSurfaceBypassIsAudited(t *testing.T) {
	f := newAuthorityDBFixture(t)
	admin := f.member(t, auth.Admin)
	author := f.member(t, auth.Player)
	private := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	target := f.doc(t, "", nil, document.StatusPublished, document.VisibilityPublic)
	prefix := "audit-filter-" + uuid.NewString()
	f.exec(t, `UPDATE documents SET kind='codex_entry',category='location/fixture',title=$2,body='AUDIT-BODY-SECRET',policy='[]'::jsonb WHERE id=$1`, private.rowID, prefix+" AUDIT-TITLE-SECRET")
	f.exec(t, `INSERT INTO document_links(source_id,document_target_id,relation) VALUES($1,$2,'fixture')`, private.rowID, target.rowID)
	var mapID, nodeA, nodeB int64
	atlas := "AUDIT-" + uuid.NewString()
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO maps(name,atlas_code,map_kind) VALUES($1,$1,'pointcrawl') RETURNING id`, atlas).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		f.exec(t, `DELETE FROM pointcrawl_edges WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM pointcrawl_entry_links WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM pointcrawl_nodes WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM maps WHERE id=$1`, mapID)
	})
	for i, target := range []*int64{&nodeA, &nodeB} {
		if err := f.pool.QueryRow(context.Background(), `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) VALUES($1,$2,0,0,now()) RETURNING id`, mapID, fmt.Sprintf("audit-node-%d", i)).Scan(target); err != nil {
			t.Fatal(err)
		}
	}
	f.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,'location',now(),$4)`, mapID, nodeA, private.rowID, author.rowID)
	f.exec(t, `INSERT INTO pointcrawl_edges(map_id,node_a,node_b,directed,kind,document_id) VALUES($1,$2,$3,false,'path',$4)`, mapID, nodeA, nodeB, private.rowID)
	var audit bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&audit, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	audienceGraph(t, f, f.token(t, admin.publicID), `query($search:String!,$slug:String!,$atlas:String!){
        documents(filters:{search:$search}){total items{id}}
        documentBacklinks(slug:$slug){documentId}
        map(atlasCode:$atlas){pointcrawlNodes{ id linkedEntries{documentId} } pointcrawlEdges{id documentId}}
    }`, map[string]any{"search": prefix, "slug": target.slug, "atlas": atlas})
	a, err := f.runtime.Authority(context.Background(), admin.publicID)
	if err != nil {
		t.Fatal(err)
	}
	count, err := f.runtime.Documents.CountBacklinks(auth.WithAuthority(context.Background(), a), target.slug)
	if err != nil || count != 1 {
		t.Fatalf("admin backlink count=%d err=%v", count, err)
	}
	found := map[string]bool{}
	for _, line := range strings.Split(strings.TrimSpace(audit.String()), "\n") {
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		if event["msg"] == "audience.admin_override" && event["scope"] == "listing" {
			if event["member_id"] != admin.publicID {
				t.Fatalf("wrong audit actor: %+v", event)
			}
			surface, _ := event["surface"].(string)
			operation, _ := event["operation"].(string)
			found[surface+":"+operation] = true
			for _, field := range []string{"body", "title", "slug", "policy", "query", "total", "count", "length"} {
				if _, present := event[field]; present {
					t.Fatalf("audit exposes protected field %s: %+v", field, event)
				}
			}
		}
	}
	for _, needed := range []string{"documents:list", "documents:count", "backlinks:list", "backlinks:count", "pointcrawl_nodes:list", "pointcrawl_edges:list", "pointcrawl_links:list"} {
		if !found[needed] {
			t.Fatalf("missing SQL bypass audit %s; audit=%s", needed, &audit)
		}
	}
	for _, secret := range []string{prefix, "AUDIT-BODY-SECRET", "AUDIT-TITLE-SECRET", private.slug, target.slug, atlas} {
		if strings.Contains(audit.String(), secret) {
			t.Fatalf("listing audit disclosed %q: %s", secret, &audit)
		}
	}
	// A privileged call that uses an ordinary explicit grant is not a bypass.
	f.exec(t, `UPDATE documents SET policy='["role:admin"]'::jsonb WHERE id=$1`, private.rowID)
	audit.Reset()
	audienceGraph(t, f, f.token(t, admin.publicID), `query($search:String!){documents(filters:{search:$search}){total items{id}}}`, map[string]any{"search": prefix})
	if strings.Contains(audit.String(), "audience.admin_override") {
		t.Fatalf("ordinary explicit grant incorrectly audited as bypass: %s", &audit)
	}
}

func TestProductionChainPointcrawlAuditUsesOnlySelectedActualBypass(t *testing.T) {
	f := newAuthorityDBFixture(t)
	admin := f.member(t, auth.Admin)
	author := f.member(t, auth.Player)
	location := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	annotation := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	alternative := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	var mapID, a, b int64
	atlas := "AUDIT-MATRIX-" + uuid.NewString()
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO maps(name,atlas_code,map_kind) VALUES($1,$1,'pointcrawl') RETURNING id`, atlas).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		f.exec(t, `DELETE FROM pointcrawl_edges WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM pointcrawl_entry_links WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM pointcrawl_nodes WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM maps WHERE id=$1`, mapID)
	})
	for i, target := range []*int64{&a, &b} {
		if err := f.pool.QueryRow(context.Background(), `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) VALUES($1,$2,0,0,now()) RETURNING id`, mapID, fmt.Sprintf("matrix-node-%d", i)).Scan(target); err != nil {
			t.Fatal(err)
		}
	}
	f.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,'location',now(),$4)`, mapID, a, location.rowID, author.rowID)
	f.exec(t, `INSERT INTO pointcrawl_edges(map_id,node_a,node_b,directed,kind) VALUES($1,$2,$3,false,'path')`, mapID, a, b)
	// A hex may hold many Locations (migration 0006); linking a second one succeeds.
	f.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,'location',now(),$4)`, mapID, a, alternative.rowID, author.rowID)
	// The same Location cannot be linked to the same hex twice.
	_, duplicateErr := f.pool.Exec(context.Background(), `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,'location',now(),$4)`, mapID, a, alternative.rowID, author.rowID)
	var constraint *pgconn.PgError
	if !errors.As(duplicateErr, &constraint) || constraint.Code != "23505" || constraint.ConstraintName != "pointcrawl_entry_links_pkey" {
		t.Fatalf("duplicate location link err=%v", duplicateErr)
	}
	f.exec(t, `DELETE FROM pointcrawl_entry_links WHERE node_id=$1 AND document_id=$2 AND relation='location'`, a, alternative.rowID)
	f.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,'subject',now(),$4)`, mapID, a, alternative.rowID, author.rowID)

	var audit bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&audit, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	token := f.token(t, admin.publicID, auth.Admin)
	for _, tc := range []struct {
		name, locationPolicy, annotationPolicy string
		locationAuthor, annotationID           int64
		deleted, revoked                       bool
		offset, linkOffset                     int
		nodes, edges                           int
		annotationSelected                     bool
		audited                                []string
	}{
		{name: "public endpoints unannotated edge", locationPolicy: "null", locationAuthor: author.rowID, nodes: 2, edges: 1},
		{name: "explicit admin grants", locationPolicy: `["role:admin"]`, locationAuthor: author.rowID, annotationID: annotation.rowID, annotationPolicy: `["role:admin"]`, nodes: 2, edges: 1, annotationSelected: true},
		{name: "document author", locationPolicy: `[]`, locationAuthor: admin.rowID, nodes: 2, edges: 1},
		{name: "hidden location admission", locationPolicy: `[]`, locationAuthor: author.rowID, nodes: 2, edges: 1, audited: []string{"pointcrawl_nodes", "pointcrawl_edges", "pointcrawl_links"}},
		{name: "hidden location selected public subject", locationPolicy: `[]`, locationAuthor: author.rowID, linkOffset: 1, nodes: 2, edges: 1, audited: []string{"pointcrawl_nodes", "pointcrawl_edges", "pointcrawl_links"}},
		{name: "selected hidden annotation", locationPolicy: "null", locationAuthor: author.rowID, annotationID: annotation.rowID, annotationPolicy: `[]`, nodes: 2, edges: 1, annotationSelected: true, audited: []string{"pointcrawl_edges"}},
		{name: "deleted annotation omitted", locationPolicy: "null", locationAuthor: author.rowID, annotationID: annotation.rowID, annotationPolicy: `[]`, deleted: true, nodes: 2, edges: 1},
		{name: "past end sentinels", locationPolicy: `[]`, locationAuthor: author.rowID, offset: 99, nodes: 0, edges: 0},
		{name: "past end links", locationPolicy: `[]`, locationAuthor: author.rowID, linkOffset: 99, nodes: 2, edges: 1, audited: []string{"pointcrawl_nodes", "pointcrawl_edges"}},
		{name: "unchanged JWT revoked admin hidden annotation", locationPolicy: "null", locationAuthor: author.rowID, annotationID: annotation.rowID, annotationPolicy: `[]`, revoked: true, nodes: 2, edges: 1},
		{name: "unchanged JWT revoked admin hidden endpoint", locationPolicy: `[]`, locationAuthor: author.rowID, revoked: true, nodes: 1, edges: 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			roles := []string{"admin"}
			if tc.revoked {
				roles = []string{"player"}
			}
			f.exec(t, `UPDATE members SET roles=$2 WHERE id=$1`, admin.rowID, roles)
			f.exec(t, `UPDATE documents SET policy=$2::jsonb,author_id=$3 WHERE id=$1`, location.rowID, tc.locationPolicy, tc.locationAuthor)
			f.exec(t, `UPDATE documents SET policy=$2::jsonb,deleted_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$1`, annotation.rowID, defaultPolicy(tc.annotationPolicy), tc.deleted)
			var documentID any
			if tc.annotationID != 0 {
				documentID = tc.annotationID
			}
			f.exec(t, `UPDATE pointcrawl_edges SET document_id=$2 WHERE map_id=$1`, mapID, documentID)
			audit.Reset()
			data, raw := audienceGraph(t, f, token, `query($atlas:String!,$offset:Int!,$linkOffset:Int!){map(atlasCode:$atlas){pointcrawlNodes(limit:20,offset:$offset){id linkedEntries(limit:20,offset:$linkOffset){documentId}} pointcrawlEdges(limit:20,offset:$offset){id documentId}}}`, map[string]any{"atlas": atlas, "offset": tc.offset, "linkOffset": tc.linkOffset})
			var got struct {
				Nodes []struct {
					Links []struct {
						ID string `json:"documentId"`
					} `json:"linkedEntries"`
				} `json:"pointcrawlNodes"`
				Edges []struct {
					DocumentID *string `json:"documentId"`
				} `json:"pointcrawlEdges"`
			}
			if err := json.Unmarshal(data["map"], &got); err != nil || len(got.Nodes) != tc.nodes || len(got.Edges) != tc.edges {
				t.Fatalf("projection=%s nodes=%d edges=%d err=%v", raw, tc.nodes, tc.edges, err)
			}
			if len(got.Edges) > 0 && (got.Edges[0].DocumentID != nil) != tc.annotationSelected {
				t.Fatalf("selected annotation differs: %s", raw)
			}
			if tc.linkOffset == 1 {
				var selected []string
				for _, node := range got.Nodes {
					for _, link := range node.Links {
						selected = append(selected, link.ID)
					}
				}
				if !slices.Equal(selected, []string{alternative.publicID}) {
					t.Fatalf("offset1 must select only the public subject: %s", raw)
				}
			}
			if tc.revoked && (bytes.Contains(raw, []byte(annotation.publicID)) || (tc.locationPolicy == "[]" && bytes.Contains(raw, []byte(location.publicID)))) {
				t.Fatalf("current-role revocation leaked protected reference: %s", raw)
			}
			found := map[string]int{}
			for _, line := range strings.Split(strings.TrimSpace(audit.String()), "\n") {
				if line == "" {
					continue
				}
				var event map[string]any
				if err := json.Unmarshal([]byte(line), &event); err != nil {
					t.Fatal(err)
				}
				if event["msg"] != "audience.admin_override" {
					continue
				}
				if event["member_id"] != admin.publicID || event["scope"] != "listing" || event["operation"] != "list" {
					t.Fatalf("unsafe bypass event: %+v", event)
				}
				for key := range event {
					if !slices.Contains([]string{"time", "level", "msg", "member_id", "scope", "surface", "operation"}, key) {
						t.Fatalf("unsafe bypass field %s: %+v", key, event)
					}
				}
				found[event["surface"].(string)]++
			}
			if len(found) != len(tc.audited) {
				t.Fatalf("audit surfaces=%v want=%v raw=%s", found, tc.audited, &audit)
			}
			for _, surface := range tc.audited {
				if found[surface] != 1 {
					t.Fatalf("audit surface=%s count=%d want=1 raw=%s", surface, found[surface], &audit)
				}
			}
		})
	}
}

func defaultPolicy(policy string) string {
	if policy == "" {
		return "null"
	}
	return policy
}

func TestProductionChainRegionCountsAuditUsesOnlyIncludedNodes(t *testing.T) {
	f := newAuthorityDBFixture(t)
	admin := f.member(t, auth.Admin)
	author := f.member(t, auth.Player)
	location := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	var regionID, mapID, nodeID int64
	var regionPublicID string
	name := "REGION-COUNT-AUDIT-" + uuid.NewString()
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO regions(name,kind) VALUES($1,'server') RETURNING id,public_id`, name).Scan(&regionID, &regionPublicID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		f.exec(t, `DELETE FROM pointcrawl_entry_links WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM pointcrawl_nodes WHERE map_id=$1`, mapID)
		f.exec(t, `DELETE FROM maps WHERE id=$1`, mapID)
		f.exec(t, `DELETE FROM regions WHERE id=$1`, regionID)
	})
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO maps(name,atlas_code,map_kind,region_id) VALUES($1,$1,'pointcrawl',$2) RETURNING id`, name, regionID).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	for i := range 2 {
		var id int64
		if err := f.pool.QueryRow(context.Background(), `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) VALUES($1,$2,0,0,now()) RETURNING id`, mapID, fmt.Sprintf("region-count-node-%d", i)).Scan(&id); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			nodeID = id
		}
	}
	var audit bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&audit, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	token := f.token(t, admin.publicID, auth.Admin)
	for _, tc := range []struct {
		name, policy                                           string
		authored, noLocation, subject, deleted, empty, revoked bool
		count                                                  int
		overridden                                             bool
	}{
		{name: "public", policy: "null", count: 2},
		{name: "explicit grant", policy: `["role:admin"]`, count: 2},
		{name: "author", policy: `[]`, authored: true, count: 2},
		{name: "included private location", policy: `[]`, count: 2, overridden: true},
		{name: "no location", noLocation: true, count: 2},
		{name: "private subject is not location admission", policy: `[]`, subject: true, count: 2},
		{name: "deleted location", policy: `[]`, deleted: true, count: 1},
		{name: "empty region excludes private node", policy: `[]`, empty: true, count: 0},
		{name: "unchanged JWT revoked admin", policy: `[]`, revoked: true, count: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			roles := []string{"admin"}
			if tc.revoked {
				roles = []string{"player"}
			}
			f.exec(t, `UPDATE members SET roles=$2 WHERE id=$1`, admin.rowID, roles)
			docAuthor := author.rowID
			if tc.authored {
				docAuthor = admin.rowID
			}
			f.exec(t, `UPDATE documents SET policy=$2::jsonb,author_id=$3,deleted_at=CASE WHEN $4 THEN now() ELSE NULL END WHERE id=$1`, location.rowID, defaultPolicy(tc.policy), docAuthor, tc.deleted)
			var mapRegion any = regionID
			if tc.empty {
				mapRegion = nil
			}
			f.exec(t, `UPDATE maps SET region_id=$2 WHERE id=$1`, mapID, mapRegion)
			f.exec(t, `DELETE FROM pointcrawl_entry_links WHERE node_id=$1`, nodeID)
			if !tc.noLocation {
				relation := "location"
				if tc.subject {
					relation = "subject"
				}
				f.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,$4,now(),$5)`, mapID, nodeID, location.rowID, relation, author.rowID)
			}
			audit.Reset()
			data, raw := audienceGraph(t, f, token, `query($region:ID!){regionCounts(regionId:$region){regionId pointcrawlNodeCount featureCount questCount}}`, map[string]any{"region": regionPublicID})
			var counts struct {
				ID       string `json:"regionId"`
				Nodes    int    `json:"pointcrawlNodeCount"`
				Features int    `json:"featureCount"`
				Quests   int    `json:"questCount"`
			}
			if err := json.Unmarshal(data["regionCounts"], &counts); err != nil {
				t.Fatal(err)
			}
			if counts.ID != regionPublicID || counts.Nodes != tc.count || counts.Features != 0 || counts.Quests != 0 {
				t.Fatalf("count projection=%s want=%d", raw, tc.count)
			}
			observed := 0
			for _, line := range strings.Split(strings.TrimSpace(audit.String()), "\n") {
				if line == "" {
					continue
				}
				var event map[string]any
				if err := json.Unmarshal([]byte(line), &event); err != nil {
					t.Fatal(err)
				}
				if event["msg"] != "audience.admin_override" {
					continue
				}
				if event["member_id"] != admin.publicID || event["scope"] != "listing" || event["surface"] != "region_counts" || event["operation"] != "count" {
					t.Fatalf("unexpected count audit: %+v", event)
				}
				for key := range event {
					if !slices.Contains([]string{"time", "level", "msg", "member_id", "scope", "surface", "operation"}, key) {
						t.Fatalf("unsafe count audit field=%s: %+v", key, event)
					}
				}
				observed++
			}
			want := 0
			if tc.overridden {
				want = 1
			}
			if observed != want {
				t.Fatalf("count audit events=%d want=%d raw=%s", observed, want, &audit)
			}
			for _, secret := range []string{name, location.publicID, location.slug, location.body, location.title} {
				if strings.Contains(audit.String(), secret) {
					t.Fatalf("count audit discloses protected fixture bytes %q", secret)
				}
			}
		})
	}
}
