//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	productgraphql "github.com/piyushsatti/chronicler/apps/api/internal/platform/graphql"
)

func TestProductionDocumentReadBoundarySeparatesDeniedMissingAndNested(t *testing.T) {
	f := newAuthorityDBFixture(t)
	author := f.member(t, auth.Player)
	reader := f.member(t, auth.Player)
	dm := f.member(t, auth.DM)
	f.profile(t, dm, "approved")
	admin := f.member(t, auth.Admin)
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	raw := "Boundary public\n> [!DM]\n> BOUNDARY-RAW-SECRET\n\nBoundary end"
	projected := "Boundary public\n> [!redacted]\n\nBoundary end"
	f.exec(t, `UPDATE documents SET kind='codex_entry',title=$2,body=$3 WHERE id=$1`, d.rowID, "boundary-"+d.publicID, raw)
	questID := uuid.NewString()
	f.exec(t, `INSERT INTO quests(public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by) VALUES($1,$2,ARRAY['standard'],$3,now()+interval '1 day',$4,$3)`, questID, "boundary-"+questID, author.rowID, d.rowID)
	t.Cleanup(func() { f.exec(t, `DELETE FROM quests WHERE public_id=$1`, questID) })
	query := `query($id:ID!,$slug:String!,$quest:ID!,$search:String!){
      byId:documentById(id:$id){id effectiveBody}
      bySlug:document(slug:$slug){id effectiveBody}
      codex:codexEntry(slug:$slug){document{id effectiveBody}}
      quest(id:$quest){id briefDocument{id effectiveBody}}
      documents(filters:{search:$search}){total items{id effectiveBody}}
    }`
	type bodyView struct {
		ID   string `json:"id"`
		Body string `json:"effectiveBody"`
	}
	type boundaryResult struct {
		Data struct {
			ByID   *bodyView                    `json:"byId"`
			BySlug *bodyView                    `json:"bySlug"`
			Codex  *struct{ Document bodyView } `json:"codex"`
			Quest  *struct {
				ID    string    `json:"id"`
				Brief *bodyView `json:"briefDocument"`
			} `json:"quest"`
			Documents struct {
				Total int
				Items []bodyView
			} `json:"documents"`
		} `json:"data"`
		Errors []struct {
			Path       []string              `json:"path"`
			Extensions struct{ Code string } `json:"extensions"`
		} `json:"errors"`
	}
	call := func(token, id, slug string) (boundaryResult, []byte) {
		t.Helper()
		payload, err := json.Marshal(map[string]any{"query": query, "variables": map[string]string{"id": id, "slug": slug, "quest": questID, "search": "boundary-" + d.publicID}})
		if err != nil {
			t.Fatal(err)
		}
		response := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, payload)
		assertAuthorityDBCORS(t, response)
		var result boundaryResult
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != http.StatusOK {
			t.Fatalf("boundary response=%s err=%v", response.Body, err)
		}
		return result, response.Body.Bytes()
	}
	assertBodies := func(token, want string) {
		t.Helper()
		result, response := call(token, d.publicID, d.slug)
		if len(result.Errors) != 0 || result.Data.ByID == nil || result.Data.BySlug == nil || result.Data.Codex == nil || result.Data.Quest == nil || result.Data.Quest.Brief == nil || result.Data.Documents.Total != 1 || len(result.Data.Documents.Items) != 1 {
			t.Fatalf("readable boundary=%s", response)
		}
		for _, view := range []bodyView{*result.Data.ByID, *result.Data.BySlug, result.Data.Codex.Document, *result.Data.Quest.Brief, result.Data.Documents.Items[0]} {
			if view.ID != d.publicID || view.Body != want {
				t.Fatalf("projected=%+v want=%q", view, want)
			}
		}
	}
	assertDenied := func(token string) {
		t.Helper()
		result, response := call(token, d.publicID, d.slug)
		if len(result.Errors) != 3 || result.Data.ByID != nil || result.Data.BySlug != nil || result.Data.Codex != nil || result.Data.Quest == nil || result.Data.Quest.Brief != nil || result.Data.Documents.Total != 0 || len(result.Data.Documents.Items) != 0 {
			t.Fatalf("denied direct/nested boundary=%s", response)
		}
		paths := map[string]bool{}
		for _, failure := range result.Errors {
			if failure.Extensions.Code != "FORBIDDEN" || len(failure.Path) != 1 {
				t.Fatalf("denial=%+v response=%s", failure, response)
			}
			paths[failure.Path[0]] = true
		}
		if len(paths) != 3 || !paths["byId"] || !paths["bySlug"] || !paths["codex"] {
			t.Fatalf("wrong denial paths=%+v", paths)
		}
		for _, protected := range []string{d.publicID, d.slug, raw, "BOUNDARY-RAW-SECRET", "Boundary public"} {
			if bytes.Contains(response, []byte(protected)) {
				t.Fatalf("denied protected bytes=%q response=%s", protected, response)
			}
		}
	}
	snapshot := func() string {
		t.Helper()
		var result string
		if err := f.pool.QueryRow(context.Background(), `SELECT jsonb_build_object('document',to_jsonb(d),'revisions',(SELECT count(*) FROM document_revisions),'receipts',(SELECT count(*) FROM idempotency_keys))::text FROM documents d WHERE d.id=$1`, d.rowID).Scan(&result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	before := snapshot()
	assertBodies("", projected)
	assertBodies(f.token(t, reader.publicID, auth.Admin, auth.DM), projected)
	assertBodies(f.token(t, dm.publicID), raw)
	assertBodies(f.token(t, author.publicID), raw)
	assertBodies(f.token(t, admin.publicID), raw)
	if snapshot() != before {
		t.Fatal("reads changed authored source/version/revision/receipt state")
	}
	// Each new request resolves current authority even while the JWT stays unchanged.
	token := f.token(t, reader.publicID, auth.Admin, auth.DM)
	f.exec(t, `UPDATE documents SET policy='["role:player"]'::jsonb WHERE id=$1`, d.rowID)
	assertBodies(token, projected)
	f.exec(t, `UPDATE members SET roles=ARRAY['verifier'] WHERE id=$1`, reader.rowID)
	assertDenied(token)
	f.exec(t, `UPDATE members SET roles=ARRAY['player'] WHERE id=$1`, reader.rowID)
	assertBodies(token, projected)
	f.exec(t, `UPDATE documents SET policy='[]'::jsonb WHERE id=$1`, d.rowID)
	assertDenied("")
	assertDenied(token)
	assertBodies(f.token(t, author.publicID), raw)
	assertBodies(f.token(t, admin.publicID), raw)
	for _, identity := range []struct{ name, id, slug string }{
		{"missing", uuid.NewString(), "missing-" + uuid.NewString()},
		{"other aggregate", reader.publicID, "not-a-document-" + reader.publicID},
	} {
		t.Run(identity.name, func(t *testing.T) {
			result, response := call("", identity.id, identity.slug)
			if len(result.Errors) != 0 || result.Data.ByID != nil || result.Data.BySlug != nil || result.Data.Codex != nil || result.Data.Quest == nil || result.Data.Quest.Brief != nil {
				t.Fatalf("missing direct identity must be nullable=%s", response)
			}
		})
	}
	f.exec(t, `UPDATE documents SET deleted_at=now(),deleted_by=$2 WHERE id=$1`, d.rowID, author.rowID)
	for _, token := range []string{"", f.token(t, author.publicID), f.token(t, admin.publicID)} {
		result, response := call(token, d.publicID, d.slug)
		if len(result.Errors) != 0 || result.Data.ByID != nil || result.Data.BySlug != nil || result.Data.Codex != nil || result.Data.Quest == nil || result.Data.Quest.Brief != nil || result.Data.Documents.Total != 0 {
			t.Fatalf("tombstone direct/nested must be nullable=%s", response)
		}
	}
}

func TestProductionProtectedDocumentScalarsUseCurrentAudienceAcrossSurfaces(t *testing.T) {
	f := newAuthorityDBFixture(t)
	ctx := context.Background()
	author := f.member(t, auth.Player)
	viewer := f.member(t, auth.Player, auth.Archon)
	d := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	f.exec(t, `UPDATE documents SET kind='codex_entry',category='Guilds',body='SCALAR-PROTECTED-BODY' WHERE id=$1`, d.rowID)
	characterID, questID, regionID, arcID, mutationKey := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	code := "scalar-" + questID
	atlas := "scalar-" + uuid.NewString()
	var regionRow, arcRow, mapRow, nodeA, nodeB int64
	if err := f.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind,document_id) VALUES($1,$2,'archon',$3) RETURNING id`, regionID, "Scalar region "+regionID, d.rowID).Scan(&regionRow); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, `INSERT INTO quest_arcs(public_id,name,created_by) VALUES($1,'Scalar arc',$2) RETURNING id`, arcID, author.rowID).Scan(&arcRow); err != nil {
		t.Fatal(err)
	}
	f.exec(t, `INSERT INTO characters(public_id,short_code,name,owner_id,status,guild_document_id) VALUES($1,$2,'Scalar PC',$3,'active',$4)`, characterID, "scalar-"+characterID, viewer.rowID, d.rowID)
	f.exec(t, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,created_by,scheduled_at,document_id,arc_id) VALUES($1,$2,ARRAY['standard'],'open',$3,$3,now()+interval '1 day',$4,$5)`, questID, code, author.rowID, d.rowID, arcRow)
	f.exec(t, `INSERT INTO quest_regions(quest_id,region_id) SELECT id,$2 FROM quests WHERE public_id=$1`, questID, regionRow)
	if err := f.pool.QueryRow(ctx, `INSERT INTO maps(name,atlas_code,map_kind,family,region_id,created_by) VALUES('Scalar map',$1,'pointcrawl','campaign',$2,$3) RETURNING id`, atlas, regionRow, author.rowID).Scan(&mapRow); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) VALUES($1,'A',0,0,now()) RETURNING id`, mapRow).Scan(&nodeA); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) VALUES($1,'B',1,0,now()) RETURNING id`, mapRow).Scan(&nodeB); err != nil {
		t.Fatal(err)
	}
	f.exec(t, `INSERT INTO pointcrawl_edges(map_id,node_a,node_b,directed,kind,document_id) VALUES($1,$2,$3,false,'path',$4)`, mapRow, nodeA, nodeB, d.rowID)
	t.Cleanup(func() {
		f.exec(t, `DELETE FROM idempotency_keys WHERE actor_id=$1 AND key=$2`, viewer.rowID, mutationKey)
		f.exec(t, `DELETE FROM characters WHERE public_id=$1`, characterID)
		f.exec(t, `DELETE FROM quests WHERE public_id=$1`, questID)
		f.exec(t, `DELETE FROM quest_arcs WHERE id=$1`, arcRow)
		f.exec(t, `DELETE FROM pointcrawl_edges WHERE map_id=$1`, mapRow)
		f.exec(t, `DELETE FROM pointcrawl_nodes WHERE map_id=$1`, mapRow)
		f.exec(t, `DELETE FROM maps WHERE id=$1`, mapRow)
		f.exec(t, `DELETE FROM regions WHERE id=$1`, regionRow)
	})
	query := `query($quest:ID!,$code:String!,$character:ID!,$owner:ID!,$region:ID!,$arc:ID!,$atlas:String!){
      one:quest(id:$quest){id documentId briefDocument{id}}
      byCode:quest(shortCode:$code){id documentId}
      list:quests(filters:{shortCodes:[$code]},limit:50,offset:0){items{id documentId}}
      board:questBoard(regionId:$region,limit:50,offset:0){items{id documentId}}
      arc:questArc(id:$arc){quests(limit:50,offset:0){id documentId}}
      character(id:$character){id guildId}
      characters(filters:{ownerId:$owner},limit:50,offset:0){items{id guildId}}
      regions(kind:"archon",limit:100,offset:0){id documentId}
      map(atlasCode:$atlas){pointcrawlEdges(limit:50,offset:0){id documentId}}
    }`
	type scalarView struct {
		ID         string               `json:"id"`
		DocumentID *string              `json:"documentId"`
		GuildID    *string              `json:"guildId"`
		Brief      *struct{ ID string } `json:"briefDocument"`
	}
	type scalarResult struct {
		Data struct {
			One        *scalarView                    `json:"one"`
			ByCode     *scalarView                    `json:"byCode"`
			List       struct{ Items []scalarView }   `json:"list"`
			Board      struct{ Items []scalarView }   `json:"board"`
			Arc        *struct{ Quests []scalarView } `json:"arc"`
			Character  *scalarView                    `json:"character"`
			Characters struct{ Items []scalarView }   `json:"characters"`
			Regions    []scalarView                   `json:"regions"`
			Map        *struct {
				Edges []scalarView `json:"pointcrawlEdges"`
			} `json:"map"`
		} `json:"data"`
		Errors []struct {
			Path       []any                 `json:"path"`
			Extensions struct{ Code string } `json:"extensions"`
		} `json:"errors"`
	}
	variables := map[string]any{"quest": questID, "code": code, "character": characterID, "owner": viewer.publicID, "region": regionID, "arc": arcID, "atlas": atlas}
	call := func(handler http.Handler, token, operation string, vars map[string]any) (scalarResult, []byte) {
		t.Helper()
		payload, err := json.Marshal(map[string]any{"query": operation, "variables": vars})
		if err != nil {
			t.Fatal(err)
		}
		response := authorityDBRequest(handler, http.MethodPost, "/v1/graphql", token, payload)
		var result scalarResult
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != http.StatusOK {
			t.Fatalf("scalar response=%s err=%v", response.Body, err)
		}
		return result, response.Body.Bytes()
	}
	ownedRegionOffset := -1
	assertScalars := func(token string, visible bool) {
		t.Helper()
		result, response := call(f.handler, token, query, variables)
		if len(result.Errors) != 0 || result.Data.One == nil || result.Data.ByCode == nil || result.Data.Character == nil || result.Data.Arc == nil || len(result.Data.List.Items) != 1 || len(result.Data.Board.Items) != 1 || len(result.Data.Arc.Quests) != 1 || len(result.Data.Characters.Items) != 1 || result.Data.Map == nil || len(result.Data.Map.Edges) != 1 {
			t.Fatalf("scalar parents/paths=%s", response)
		}
		ids := []*string{result.Data.One.DocumentID, result.Data.ByCode.DocumentID, result.Data.List.Items[0].DocumentID, result.Data.Board.Items[0].DocumentID, result.Data.Arc.Quests[0].DocumentID, result.Data.Character.GuildID, result.Data.Characters.Items[0].GuildID, result.Data.Map.Edges[0].DocumentID}
		ownedRegionOffset = -1
		for i, region := range result.Data.Regions {
			if region.ID == regionID {
				ids = append(ids, region.DocumentID)
				ownedRegionOffset = i
			}
		}
		if ownedRegionOffset < 0 {
			t.Fatalf("owned Region missing=%s", response)
		}
		for i, id := range ids {
			if visible && (id == nil || *id != d.publicID) || !visible && id != nil {
				t.Fatalf("scalar[%d]=%v visible=%v response=%s", i, id, visible, response)
			}
		}
		if visible && (result.Data.One.Brief == nil || result.Data.One.Brief.ID != d.publicID) || !visible && result.Data.One.Brief != nil {
			t.Fatalf("brief/scalar disagreement=%s", response)
		}
		if !visible && bytes.Contains(response, []byte(d.publicID)) {
			t.Fatalf("protected UUID escaped=%s", response)
		}
		if bytes.Contains(response, []byte("SCALAR-PROTECTED-BODY")) {
			t.Fatal("ID-only selections exposed raw body")
		}
	}
	token := f.token(t, viewer.publicID, auth.Admin, auth.DM)
	assertScalars("", true)
	assertScalars(token, true)
	mutation := `mutation($character:ID!,$guild:ID!,$meta:CommandMeta!){setCharacterGuild(characterId:$character,guildId:$guild,meta:$meta){id guildId}}`
	mutationVariables := map[string]any{"character": characterID, "guild": d.publicID, "meta": map[string]string{"idempotencyKey": mutationKey}}
	_, response := call(f.handler, token, mutation, mutationVariables)
	if !bytes.Contains(response, []byte(`"guildId":"`+d.publicID+`"`)) {
		t.Fatalf("initial guild command=%s", response)
	}
	f.exec(t, `UPDATE documents SET policy='["role:archon"]'::jsonb WHERE id=$1`, d.rowID)
	assertScalars("", false)
	assertScalars(token, true)
	f.exec(t, `UPDATE members SET roles=ARRAY['player'] WHERE id=$1`, viewer.rowID)
	assertScalars(token, false)
	// The original completed command remains replayable, while current serialization
	// must not re-emit the receipt's now-protected guild UUID.
	var beforeReplay, afterReplay string
	stateSQL := `SELECT jsonb_build_object('character',to_jsonb(c),'receipt',(SELECT receipt FROM idempotency_keys WHERE actor_id=$2 AND key=$3))::text FROM characters c WHERE public_id=$1`
	if err := f.pool.QueryRow(ctx, stateSQL, characterID, viewer.rowID, mutationKey).Scan(&beforeReplay); err != nil {
		t.Fatal(err)
	}
	replayed, response := call(f.handler, token, mutation, mutationVariables)
	if len(replayed.Errors) != 0 || !bytes.Contains(response, []byte(`"guildId":null`)) || bytes.Contains(response, []byte(d.publicID)) {
		t.Fatalf("replay protected guild=%s", response)
	}
	if err := f.pool.QueryRow(ctx, stateSQL, characterID, viewer.rowID, mutationKey).Scan(&afterReplay); err != nil {
		t.Fatal(err)
	}
	if beforeReplay != afterReplay {
		t.Fatal("serialization replay changed original Character or receipt effects")
	}
	f.exec(t, `UPDATE members SET roles=ARRAY['player','archon'] WHERE id=$1`, viewer.rowID)
	f.exec(t, `UPDATE documents SET policy=NULL,visibility='restricted' WHERE id=$1`, d.rowID)
	f.exec(t, `INSERT INTO document_readers(document_id,member_id) VALUES($1,$2)`, d.rowID, viewer.rowID)
	assertScalars(token, true)
	f.exec(t, `DELETE FROM document_readers WHERE document_id=$1 AND member_id=$2`, d.rowID, viewer.rowID)
	assertScalars(token, false)
	payload, _ := json.Marshal(map[string]any{"query": `query($id:ID!){documentById(id:$id){id}}`, "variables": map[string]string{"id": d.publicID}})
	denied := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", token, payload)
	if !bytes.Contains(denied.Body.Bytes(), []byte(`"code":"FORBIDDEN"`)) || bytes.Contains(denied.Body.Bytes(), []byte(d.publicID)) {
		t.Fatalf("direct denial drifted=%s", denied.Body)
	}
	f.exec(t, `UPDATE documents SET policy=NULL,visibility='public',deleted_at=now() WHERE id=$1`, d.rowID)
	assertScalars(token, false)
	f.exec(t, `UPDATE characters SET guild_document_id=NULL WHERE public_id=$1`, characterID)
	f.exec(t, `UPDATE regions SET document_id=NULL WHERE id=$1`, regionRow)
	assertScalars("", false)
	// Nullable in-memory identities need no loader, including a nil parent.
	for _, read := range []func() (*string, error){
		func() (*string, error) { return f.runtime.Resolver.QuestType().DocumentID(ctx, &graph.QuestType{}) },
		func() (*string, error) { return f.runtime.Resolver.CharacterType().GuildID(ctx, nil) },
		func() (*string, error) { return f.runtime.Resolver.RegionType().DocumentID(ctx, &graph.RegionType{}) },
	} {
		if id, err := read(); err != nil || id != nil {
			t.Fatalf("missing nullable scalar=%v err=%v", id, err)
		}
	}
	// Preserve upstream failure, using the real Document repository against a
	// closed native transaction rather than replacing audience facts.
	f.exec(t, `UPDATE documents SET deleted_at=NULL WHERE id=$1`, d.rowID)
	f.exec(t, `UPDATE characters SET guild_document_id=$2 WHERE public_id=$1`, characterID, d.rowID)
	f.exec(t, `UPDATE regions SET document_id=$2 WHERE id=$1`, regionRow, d.rowID)
	assertScalars("", true)
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	closed, _ := document.NewProductPostgres(tx)
	resolver := *f.runtime.Resolver
	broken := *resolver.BatchProviders.Document
	broken.Reads.Batch = closed
	resolver.BatchProviders.Document = &broken
	handler := productgraphql.NewHandler(&resolver, productgraphql.Limits{}, f.runtime.Authority)
	failureQuery := `query($quest:ID!,$character:ID!,$offset:Int!){one:quest(id:$quest){id documentId}character(id:$character){id guildId}regions(kind:"archon",limit:1,offset:$offset){id documentId}}`
	failures, response := call(handler, "", failureQuery, map[string]any{"quest": questID, "character": characterID, "offset": ownedRegionOffset})
	if len(failures.Errors) != 3 {
		t.Fatalf("dependency fields=%s", response)
	}
	paths := map[string]bool{}
	for _, failure := range failures.Errors {
		if failure.Extensions.Code != "INTERNAL" {
			t.Fatalf("dependency code=%+v", failure)
		}
		encoded, _ := json.Marshal(failure.Path)
		paths[string(encoded)] = true
	}
	for _, path := range []string{`["one","documentId"]`, `["character","guildId"]`, `["regions",0,"documentId"]`} {
		if !paths[path] {
			t.Fatalf("dependency error lost at %s: %s", path, response)
		}
	}
	if bytes.Contains(response, []byte(d.publicID)) || bytes.Contains(response, []byte("SCALAR-PROTECTED-BODY")) {
		t.Fatalf("dependency failure leaked protected data=%s", response)
	}
}

func TestProductionDocumentNestedBatchPreservesInvalidAndDependencyFailures(t *testing.T) {
	f := newAuthorityDBFixture(t)
	repo, err := document.NewProductPostgres(f.pool)
	if err != nil {
		t.Fatal(err)
	}
	batch, err := repo.ReadBatchDocuments(context.Background(), auth.Authority{}, []document.DocumentKey{{ID: "malformed"}, {ID: uuid.NewString()}})
	if err != nil || len(batch) != 2 {
		t.Fatalf("batch=%+v err=%v", batch, err)
	}
	invalid, ok := errors.AsType[*apierr.Error](batch[0].Err)
	if !ok || invalid.Code != apierr.Invalid || batch[0].Value != nil || batch[1].Value != nil || batch[1].Err != nil {
		t.Fatalf("invalid/missing batch=%+v", batch)
	}
	tx, err := f.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	closed, _ := document.NewProductPostgres(tx)
	batch, err = closed.ReadBatchDocuments(context.Background(), auth.Authority{}, []document.DocumentKey{{ID: uuid.NewString()}})
	if err != nil || len(batch) != 1 || !errors.Is(batch[0].Err, pgx.ErrTxClosed) || batch[0].Value != nil {
		t.Fatalf("dependency failure suppressed: batch=%+v err=%v", batch, err)
	}
	if strings.Contains(batch[0].Err.Error(), "document not found") {
		t.Fatal("dependency failure reclassified as absence")
	}
}
