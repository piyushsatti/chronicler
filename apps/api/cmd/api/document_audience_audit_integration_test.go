//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"

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
	f.exec(t, `INSERT INTO document_links(source_id,target_id,relation) VALUES($1,$2,'fixture')`, private.rowID, target.rowID)
	var regionID, mapID, hexID int64
	atlas := "AUDIT-" + uuid.NewString()
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO regions(name,kind) VALUES($1,'uncharted') RETURNING id`, atlas).Scan(&regionID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		f.exec(t, `DELETE FROM maps WHERE id=$1`, mapID)
		f.exec(t, `DELETE FROM regions WHERE id=$1`, regionID)
	})
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO maps(name,atlas_code,map_kind,region_id,cols,rows) VALUES($1,$1,'hexgrid',$2,1,1) RETURNING id`, atlas, regionID).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(context.Background(), `INSERT INTO hexes(map_id,col,row) VALUES($1,0,0) RETURNING id`, mapID).Scan(&hexID); err != nil {
		t.Fatal(err)
	}
	f.exec(t, `INSERT INTO hex_entry_links(hex_id,document_id,relation) VALUES($1,$2,'fixture')`, hexID, private.rowID)
	var audit bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&audit, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	audienceGraph(t, f, f.token(t, admin.publicID), `query($search:String!,$slug:String!,$atlas:String!){
        documents(filters:{search:$search}){total items{id}}
        documentBacklinks(slug:$slug){documentId}
        mapView(atlasCode:$atlas){totalPlaces places{documentId}}
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
	for _, needed := range []string{"documents:list", "documents:count", "backlinks:list", "backlinks:count", "map_places:list", "map_places:count"} {
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
