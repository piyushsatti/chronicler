//go:build integration

package document

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, "product fixture process cleanup:", err)
		code = 1
	}
	os.Exit(code)
}

var doc03Macro = regexp.MustCompile(`sqlc\.(?:n?arg)\(([a-z_]+)\)`)

func doc03ProductSQL(t *testing.T, name, mode string) string {
	t.Helper()
	data, err := os.ReadFile("../../db/queries/document_product.sql")
	if err != nil {
		t.Fatal(err)
	}
	matches := 0
	var query string
	for _, part := range strings.Split(string(data), "-- name: ")[1:] {
		header, body, ok := strings.Cut(part, "\n")
		if !ok {
			continue
		}
		fields := strings.Fields(header)
		if len(fields) > 0 && fields[0] == name {
			matches++
			if strings.TrimSpace(header) != name+" "+mode {
				t.Fatalf("wrong annotation for %s: %q", name, header)
			}
			query = strings.TrimSpace(body)
		}
	}
	if matches != 1 {
		t.Fatalf("named product SQL %s occurrence count=%d, want exactly one", name, matches)
	}
	return doc03ExpandProductMacros(t, query)
}

func doc03ExpandProductMacros(t *testing.T, query string) string {
	t.Helper()
	return doc03Macro.ReplaceAllStringFunc(query, func(token string) string {
		key := strings.TrimSuffix(strings.TrimPrefix(token, "sqlc.arg("), ")")
		key = strings.TrimSuffix(strings.TrimPrefix(key, "sqlc.narg("), ")")
		return "@" + key
	})
}

var doc03NamedArg = regexp.MustCompile(`@([a-z_]+)`)

func doc03KeyedProductArgs(t *testing.T, query string, values pgx.StrictNamedArgs) pgx.StrictNamedArgs {
	t.Helper()
	want := map[string]struct{}{}
	for _, match := range doc03NamedArg.FindAllStringSubmatch(query, -1) {
		want[match[1]] = struct{}{}
	}
	if len(want) != len(values) {
		t.Fatalf("query has %d unique named args, received %d keyed values", len(want), len(values))
	}
	for name := range want {
		if _, ok := values[name]; !ok {
			t.Fatalf("query argument %q has no keyed value", name)
		}
	}
	for name := range values {
		if _, ok := want[name]; !ok {
			t.Fatalf("keyed value %q is unused by query", name)
		}
	}
	return values
}

func TestPhase3TaskDOC03BacklinksPostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool
	insertMember := func(discord, handle string) (int64, uuid.UUID) {
		t.Helper()
		var id int64
		var public uuid.UUID
		err := pool.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ($1,$2,$2,ARRAY['player'],'active') RETURNING id,public_id`, discord, handle).Scan(&id, &public)
		if err != nil {
			t.Fatal(err)
		}
		return id, public
	}
	sourceAuthorID, sourceViewer := insertMember("doc03-source-author", "doc03-source-author")
	targetAuthorID, targetViewer := insertMember("doc03-target-author", "doc03-target-author")
	_, adminViewer := insertMember("doc03-admin-viewer", "doc03-admin-viewer")
	insertDoc := func(slug, visibility string, policy any, authorID int64) (int64, uuid.UUID) {
		t.Helper()
		var id int64
		var public uuid.UUID
		err := pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,policy,author_id) VALUES ('community',$1,$1,'published',$2,$3,$4) RETURNING id,public_id`, slug, visibility, policy, authorID).Scan(&id, &public)
		if err != nil {
			t.Fatal(err)
		}
		return id, public
	}
	targetID, targetUUID := insertDoc("doc03-target", "public", nil, targetAuthorID)
	source1ID, source1UUID := insertDoc("doc03-source-older", "public", nil, sourceAuthorID)
	source2ID, source2UUID := insertDoc("doc03-source-newer", "public", nil, sourceAuthorID)
	if _, err := pool.Exec(ctx, `UPDATE documents SET updated_at=CASE WHEN id=$1 THEN '2026-01-01'::timestamptz ELSE '2026-01-02'::timestamptz END WHERE id IN ($1,$2)`, source1ID, source2ID); err != nil {
		t.Fatal(err)
	}
	for _, sourceID := range []int64{source1ID, source2ID} {
		if _, err := pool.Exec(ctx, `INSERT INTO document_links(source_id,document_target_id,relation) VALUES ($1,$2,'link')`, sourceID, targetID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO regions(name,kind) VALUES ('collision','server')`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation) VALUES ($1,1,'region')`, source1ID); err != nil {
		t.Fatal(err)
	}

	productCountSQL := doc03ProductSQL(t, "CountProductDocumentBacklinks", ":one")
	productListSQL := doc03ProductSQL(t, "ListProductDocumentBacklinks", ":many")
	type expectedRow struct {
		id       uuid.UUID
		override bool
	}
	check := func(name string, viewer uuid.UUID, admin bool, want []expectedRow, wantAggregate bool) {
		t.Helper()
		var count int64
		var aggregate bool
		productCountArgs := doc03KeyedProductArgs(t, productCountSQL, pgx.StrictNamedArgs{"viewer_admin": admin, "viewer_id": viewer, "viewer_roles": []string{}, "viewer_handle": "", "viewer_live_dm": false, "slug": "doc03-target"})
		if err := pool.QueryRow(ctx, productCountSQL, productCountArgs).Scan(&count, &aggregate); err != nil {
			t.Fatalf("%s product count: %v", name, err)
		}
		if count != int64(len(want)) || aggregate != wantAggregate {
			t.Fatalf("%s product count=(%d,%v), want (%d,%v)", name, count, aggregate, len(want), wantAggregate)
		}
		productListArgs := doc03KeyedProductArgs(t, productListSQL, pgx.StrictNamedArgs{"viewer_admin": admin, "viewer_id": viewer, "viewer_roles": []string{}, "viewer_handle": "", "viewer_live_dm": false, "slug": "doc03-target", "row_limit": int32(100), "row_offset": int32(0)})
		productRows, err := pool.Query(ctx, productListSQL, productListArgs)
		if err != nil {
			t.Fatalf("%s product list: %v", name, err)
		}
		productGot := 0
		for productRows.Next() {
			var source, target uuid.UUID
			var relation, kind, slug string
			var override bool
			if err := productRows.Scan(&source, &target, &relation, &kind, &slug, &override); err != nil {
				productRows.Close()
				t.Fatalf("%s product row: %v", name, err)
			}
			if productGot >= len(want) {
				productRows.Close()
				t.Fatalf("%s product returned extra row %s", name, source)
			}
			expected := want[productGot]
			if source != expected.id || target != targetUUID || relation != "link" || kind != "community" || override != expected.override {
				productRows.Close()
				t.Fatalf("%s product row %d=(%s,%s,%s,%s,%v), want source=%s target=%s link community override=%v", name, productGot, source, target, relation, kind, override, expected.id, targetUUID, expected.override)
			}
			if (productGot == 0 && source == source2UUID && slug != "doc03-source-newer") || (source == source1UUID && slug != "doc03-source-older") {
				t.Fatalf("%s wrong source slug %q", name, slug)
			}
			productGot++
		}
		if err := productRows.Err(); err != nil {
			productRows.Close()
			t.Fatalf("%s product rows: %v", name, err)
		}
		productRows.Close()
		if productGot != len(want) {
			t.Fatalf("%s product list returned %d rows, count expected %d", name, productGot, len(want))
		}
	}
	both := []expectedRow{{source2UUID, false}, {source1UUID, false}}
	check("public", adminViewer, false, both, false)
	check("public admin no activation", adminViewer, true, both, false)

	if _, err := pool.Exec(ctx, `UPDATE documents SET visibility='dm_only' WHERE id=$1`, targetID); err != nil {
		t.Fatal(err)
	}
	check("target author admission", targetViewer, false, both, false)
	if _, err := pool.Exec(ctx, `UPDATE documents SET visibility='public' WHERE id=$1`, targetID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE documents SET visibility='dm_only' WHERE id IN ($1,$2)`, source1ID, source2ID); err != nil {
		t.Fatal(err)
	}
	check("source author admission", sourceViewer, false, both, false)
	if _, err := pool.Exec(ctx, `UPDATE documents SET visibility='public' WHERE id IN ($1,$2)`, source1ID, source2ID); err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(ctx, `UPDATE documents SET policy='["role:dm"]'::jsonb WHERE id=$1`, source1ID); err != nil {
		t.Fatal(err)
	}
	check("source denied", adminViewer, false, []expectedRow{{source2UUID, false}}, false)
	check("source-only override", adminViewer, true, []expectedRow{{source2UUID, false}, {source1UUID, true}}, true)
	if _, err := pool.Exec(ctx, `UPDATE documents SET policy=NULL WHERE id=$1`, source1ID); err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(ctx, `UPDATE documents SET policy='["role:dm"]'::jsonb WHERE id=$1`, targetID); err != nil {
		t.Fatal(err)
	}
	check("target denied", adminViewer, false, nil, false)
	check("target-only override", adminViewer, true, []expectedRow{{source2UUID, true}, {source1UUID, true}}, true)

	if _, err := pool.Exec(ctx, `UPDATE documents SET policy='["role:dm"]'::jsonb WHERE id=$1`, source1ID); err != nil {
		t.Fatal(err)
	}
	check("both denied without admin", adminViewer, false, nil, false)
	check("both override", adminViewer, true, []expectedRow{{source2UUID, true}, {source1UUID, true}}, true)
	if _, err := pool.Exec(ctx, `UPDATE documents SET policy=NULL WHERE id IN ($1,$2)`, source1ID, targetID); err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(ctx, `UPDATE documents SET deleted_at=now() WHERE id=$1`, source1ID); err != nil {
		t.Fatal(err)
	}
	check("source tombstone", adminViewer, true, []expectedRow{{source2UUID, false}}, false)
	if _, err := pool.Exec(ctx, `UPDATE documents SET deleted_at=NULL WHERE id=$1`, source1ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE documents SET deleted_at=now() WHERE id=$1`, targetID); err != nil {
		t.Fatal(err)
	}
	check("target tombstone", adminViewer, true, nil, false)
	// Equal timestamps must tie-break on public UUID, even when internal IDs oppose it.
	if _, err := pool.Exec(ctx, `UPDATE documents SET deleted_at=NULL WHERE id=$1`, targetID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE documents SET public_id=CASE WHEN id=$1 THEN 'f0000000-0000-4000-8000-000000000101'::uuid ELSE '10000000-0000-4000-8000-000000000102'::uuid END,updated_at='2026-01-03'::timestamptz WHERE id IN ($1,$2)`, source1ID, source2ID); err != nil {
		t.Fatal(err)
	}
	tieArgs := doc03KeyedProductArgs(t, productListSQL, pgx.StrictNamedArgs{"viewer_admin": false, "viewer_id": adminViewer, "viewer_roles": []string{}, "viewer_handle": "", "viewer_live_dm": false, "slug": "doc03-target", "row_limit": int32(1), "row_offset": int32(0)})
	tieRows, err := pool.Query(ctx, productListSQL, tieArgs)
	if err != nil {
		t.Fatal(err)
	}
	if !tieRows.Next() {
		tieRows.Close()
		t.Fatal("product backlink tie page empty")
	}
	var tieSource uuid.UUID
	if err := tieRows.Scan(&tieSource, new(uuid.UUID), new(string), new(string), new(string), new(bool)); err != nil {
		tieRows.Close()
		t.Fatal(err)
	}
	tieRows.Close()
	if tieSource != uuid.MustParse("f0000000-0000-4000-8000-000000000101") {
		t.Fatalf("backlink tie source=%s, want higher public UUID despite lower internal ID", tieSource)
	}
}

func TestPhase3TaskDOC03SlugAllocationPostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool
	insert := func(slug string, tombstone bool) {
		t.Helper()
		_, err := pool.Exec(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,body,deleted_at) VALUES ('community',$1,$1,'draft','public','',CASE WHEN $2 THEN now() ELSE NULL END)`, slug, tombstone)
		if err != nil {
			t.Fatal(err)
		}
	}
	insert("doc03-occupied", false)
	insert("doc03-occupied-2", false)
	insert("doc03-occupied-4", true)
	query := doc03ProductSQL(t, "FindProductDocumentSlug", ":one")
	var got string
	if err := pool.QueryRow(ctx, query, doc03KeyedProductArgs(t, query, pgx.StrictNamedArgs{"base": "doc03-occupied"})).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != "doc03-occupied-3" {
		t.Fatalf("first free slug=%q, want first hole doc03-occupied-3", got)
	}
	if err := pool.QueryRow(ctx, query, doc03KeyedProductArgs(t, query, pgx.StrictNamedArgs{"base": "doc03-empty"})).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != "doc03-empty" {
		t.Fatalf("unoccupied slug=%q, want doc03-empty", got)
	}
	insert("doc03-tombstone-next", false)
	insert("doc03-tombstone-next-2", true)
	if err := pool.QueryRow(ctx, query, doc03KeyedProductArgs(t, query, pgx.StrictNamedArgs{"base": "doc03-tombstone-next"})).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != "doc03-tombstone-next-3" {
		t.Fatalf("slug after tombstoned next candidate=%q, want -3 because tombstones retain slug occupancy", got)
	}
}

// This runs every persisted document transition through the exact named SQL
// source used by sqlc. It deliberately leaves the caller in charge of the
// transaction, as the repository contract requires.
func TestPhase3TaskDOC03ProductLifecyclePostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	p := f.Pool
	var owner int64
	var ownerID uuid.UUID
	if err := p.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('doc03-lifecycle','doc03-lifecycle','DOC03',ARRAY['player'],'active') RETURNING id,public_id`).Scan(&owner, &ownerID); err != nil {
		t.Fatal(err)
	}
	_ = owner
	query := func(name, mode string) string { return doc03ProductSQL(t, name, mode) }
	insert := query("InsertProductDocument", ":one")
	var internal int64
	var public uuid.UUID
	var version int32
	at := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	frontmatter := "title: First\ntags:\n  - lore\n"
	firstID := uuid.New()
	if err := p.QueryRow(ctx, insert, doc03KeyedProductArgs(t, insert, pgx.StrictNamedArgs{"id": firstID, "kind": "community", "slug": "doc03-lifecycle", "title": "First", "category": nil, "visibility": "public", "policy": nil, "body": "body one", "frontmatter_yaml": frontmatter, "author_id": ownerID, "at": at})).Scan(&internal, &public, &version, new(time.Time), new(time.Time)); err != nil {
		t.Fatal(err)
	}
	if version != 1 {
		t.Fatalf("created version=%d, want 1", version)
	}
	revision := query("InsertProductDocumentRevision", ":one")
	addRevision := func(rev int32, reason, title, body, fm string, pubAt any, pubBy any) {
		t.Helper()
		if err := p.QueryRow(ctx, revision, doc03KeyedProductArgs(t, revision, pgx.StrictNamedArgs{"id": uuid.New(), "document_id": public, "rev": rev, "reason": reason, "title": title, "body": body, "frontmatter_yaml": fm, "recorded_by": ownerID, "at": at.Add(time.Duration(rev) * time.Minute), "old_value": nil, "new_value": nil, "policy": nil, "published_at": pubAt, "published_by": pubBy, "visibility": "public"})).Scan(new(uuid.UUID), new(int32), new(time.Time)); err != nil {
			t.Fatalf("revision %d: %v", rev, err)
		}
	}
	addRevision(1, "created", "First", "body one", frontmatter, nil, nil)
	update := query("UpdateProductDocument", ":one")
	updateDoc := func(expected, want int32, title, body, fm, status string, publishedAt, publishedBy, deletedAt, deletedBy any) {
		t.Helper()
		row := p.QueryRow(ctx, update, doc03KeyedProductArgs(t, update, pgx.StrictNamedArgs{"title": title, "category": nil, "body": body, "frontmatter_yaml": fm, "policy": nil, "visibility": "public", "status": status, "published_at": publishedAt, "published_by": publishedBy, "deleted_at": deletedAt, "deleted_by": deletedBy, "at": at.Add(time.Duration(want) * time.Minute), "id": public, "expected_version": expected}))
		var got int32
		if err := row.Scan(new(int64), new(uuid.UUID), &got, new(time.Time), new(*time.Time), new(*time.Time)); err != nil {
			t.Fatalf("update v%d: %v", expected, err)
		}
		if got != want {
			t.Fatalf("update version=%d, want %d", got, want)
		}
	}
	updateDoc(1, 2, "Draft edit", "body two", "title: Draft edit\ntags: [lore, revised]\n", "draft", nil, nil, nil, nil)
	if err := p.QueryRow(ctx, update, doc03KeyedProductArgs(t, update, pgx.StrictNamedArgs{"title": "stale", "category": nil, "body": "stale", "frontmatter_yaml": frontmatter, "policy": nil, "visibility": "public", "status": "draft", "published_at": nil, "published_by": nil, "deleted_at": nil, "deleted_by": nil, "at": at, "id": public, "expected_version": int32(1)})).Scan(new(int64), new(uuid.UUID), new(int32), new(time.Time), new(*time.Time), new(*time.Time)); err == nil {
		t.Fatal("stale expectedVersion unexpectedly updated a row")
	}
	addRevision(2, "edited", "Draft edit", "body two", "title: Draft edit\ntags: [lore, revised]\n", nil, nil)
	publishedAt := at.Add(3 * time.Minute)
	updateDoc(2, 3, "Draft edit", "body two", "title: Draft edit\ntags: [lore, revised]\n", "published", publishedAt, ownerID, nil, nil)
	addRevision(3, "published", "Draft edit", "body two", "title: Draft edit\ntags: [lore, revised]\n", publishedAt, ownerID)
	updateDoc(3, 4, "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", "published", publishedAt, ownerID, nil, nil)
	addRevision(4, "edited", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", publishedAt, ownerID)
	tombstonedAt := at.Add(5 * time.Minute)
	updateDoc(4, 5, "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", "published", publishedAt, ownerID, tombstonedAt, ownerID)
	addRevision(5, "deleted", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", publishedAt, ownerID)
	updateDoc(5, 6, "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", "published", publishedAt, ownerID, nil, nil)
	addRevision(6, "restored", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", publishedAt, ownerID)
	updateDoc(6, 7, "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", "draft", nil, nil, nil, nil)
	addRevision(7, "unpublished", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", nil, nil)

	get := query("GetProductDocumentByID", ":one")
	var gotID uuid.UUID
	var gotTitle, gotBody, gotFM string
	var gotVersion int32
	var gotStatus string
	if err := p.QueryRow(ctx, get, doc03KeyedProductArgs(t, get, pgx.StrictNamedArgs{"document_id": public, "viewer_id": ownerID, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-lifecycle", "viewer_admin": false, "viewer_live_dm": false})).Scan(new(int64), &gotID, new(string), new(string), &gotTitle, new(*string), &gotStatus, new(string), new([]byte), &gotBody, &gotFM, new(int64), new(uuid.UUID), new(*time.Time), new(*uuid.UUID), new(*time.Time), new(*uuid.UUID), new(time.Time), new(time.Time), &gotVersion, new([]uuid.UUID), new(bool), new(bool), new([]uuid.UUID), new([]uuid.UUID)); err != nil {
		t.Fatal(err)
	}
	if gotID != public || gotTitle != "Published edit" || gotBody != "body three" || gotFM != "title: Published edit\ntags: [lore, edited]\n" || gotVersion != 7 || gotStatus != "draft" {
		t.Fatalf("readback id=%s title=%q body=%q frontmatter=%q status=%s version=%d", gotID, gotTitle, gotBody, gotFM, gotStatus, gotVersion)
	}
	count := query("CountProductDocumentRevisions", ":one")
	var revisions int64
	if err := p.QueryRow(ctx, count, doc03KeyedProductArgs(t, count, pgx.StrictNamedArgs{"document_id": public})).Scan(&revisions); err != nil {
		t.Fatal(err)
	}
	if revisions != 7 {
		t.Fatalf("revision count=%d, want 7", revisions)
	}
	list := query("ListProductDocumentRevisions", ":many")
	rows, err := p.Query(ctx, list, doc03KeyedProductArgs(t, list, pgx.StrictNamedArgs{"document_id": public, "row_limit": int32(20), "row_offset": int32(0)}))
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var gotRevs []int32
	for rows.Next() {
		var id, doc uuid.UUID
		var rev int32
		var reason, title, body string
		var fm *string
		var policy []byte
		var vis *string
		var pat *time.Time
		var pby, actor *uuid.UUID
		var created time.Time
		var old, next []byte
		if err := rows.Scan(&id, &doc, &rev, &reason, &title, &body, &fm, &policy, &vis, &pat, &pby, &actor, &created, &old, &next); err != nil {
			t.Fatal(err)
		}
		if doc != public {
			t.Fatalf("revision document=%s, want %s", doc, public)
		}
		expected := map[int32]struct {
			reason, title, body, frontmatter string
			published                        bool
		}{
			1: {"created", "First", "body one", "title: First\ntags:\n  - lore\n", false},
			2: {"edited", "Draft edit", "body two", "title: Draft edit\ntags: [lore, revised]\n", false},
			3: {"published", "Draft edit", "body two", "title: Draft edit\ntags: [lore, revised]\n", true},
			4: {"edited", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", true},
			5: {"deleted", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", true},
			6: {"restored", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", true},
			7: {"unpublished", "Published edit", "body three", "title: Published edit\ntags: [lore, edited]\n", false},
		}[rev]
		if reason != expected.reason || title != expected.title || body != expected.body || fm == nil || *fm != expected.frontmatter {
			t.Fatalf("revision %d snapshot=(%q,%q,%q,%v), want (%q,%q,%q,%q)", rev, reason, title, body, fm, expected.reason, expected.title, expected.body, expected.frontmatter)
		}
		if policy != nil || vis == nil || *vis != "public" || actor == nil || *actor != ownerID || !created.Equal(at.Add(time.Duration(rev)*time.Minute)) {
			t.Fatalf("revision %d metadata policy=%s visibility=%v actor=%v created=%s", rev, policy, vis, actor, created)
		}
		if expected.published {
			if pat == nil || pby == nil || *pby != ownerID || !pat.Equal(at.Add(3*time.Minute)) {
				t.Fatalf("revision %d publication snapshot=(%v,%v)", rev, pat, pby)
			}
		} else if pat != nil || pby != nil {
			t.Fatalf("revision %d should preserve no publication metadata: (%v,%v)", rev, pat, pby)
		}
		if old != nil || next != nil {
			t.Fatalf("revision %d unexpected change metadata old=%s new=%s", rev, old, next)
		}
		gotRevs = append(gotRevs, rev)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(gotRevs) != 7 || gotRevs[0] != 7 || gotRevs[6] != 1 {
		t.Fatalf("revision page=%v, want descending 7..1", gotRevs)
	}
	pageRows, err := p.Query(ctx, list, doc03KeyedProductArgs(t, list, pgx.StrictNamedArgs{"document_id": public, "row_limit": int32(2), "row_offset": int32(2)}))
	if err != nil {
		t.Fatal(err)
	}
	var page []int32
	for pageRows.Next() {
		var id, document uuid.UUID
		var rev int32
		if err := pageRows.Scan(&id, &document, &rev, new(string), new(string), new(string), new(*string), new([]byte), new(*string), new(*time.Time), new(*uuid.UUID), new(*uuid.UUID), new(time.Time), new([]byte), new([]byte)); err != nil {
			pageRows.Close()
			t.Fatal(err)
		}
		page = append(page, rev)
	}
	if err := pageRows.Err(); err != nil {
		pageRows.Close()
		t.Fatal(err)
	}
	pageRows.Close()
	if len(page) != 2 || page[0] != 5 || page[1] != 4 {
		t.Fatalf("revision offset page=%v, want [5 4]", page)
	}
}

func TestPhase3TaskDOC03ProductTypedSubjectsPostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	p := f.Pool
	var authorID int64
	var author, other uuid.UUID
	if err := p.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('doc03-typed-author','doc03-typed-author','Author',ARRAY['player'],'active') RETURNING id,public_id`).Scan(&authorID, &author); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('doc03-typed-other','doc03-typed-other','Other',ARRAY['player'],'active') RETURNING public_id`).Scan(&other); err != nil {
		t.Fatal(err)
	}
	const collision int64 = 990031
	sourceID := uuid.New()
	targetDocID, questID, characterID, regionID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := p.Exec(ctx, `INSERT INTO documents(id,public_id,kind,slug,title,status,visibility,author_id) VALUES ($1,$2,'community','doc03-typed-source','source','published','public',$3),($4,$5,'community','doc03-typed-target','target','published','dm_only',$3)`, collision-1, sourceID, authorID, collision, targetDocID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, `INSERT INTO regions(id,public_id,name,kind) VALUES ($1,$2,'DOC03 region','server')`, collision, regionID); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, `INSERT INTO characters(id,public_id,short_code,name,owner_id,status) VALUES ($1,$2,'DOC03','DOC03 character',$3,'active')`, collision, characterID, authorID); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, `INSERT INTO quests(id,public_id,short_code,kinds,status,dm_id,scheduled_at,duration_hours,slots_max,filled_count,document_id,created_by) VALUES ($1,$2,'DOC03',ARRAY['standard'],'open',$3,now()+interval '1 day',4,5,0,$4,$3)`, collision, questID, authorID, collision); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, `INSERT INTO document_links(source_id,document_target_id,relation) SELECT id,$1,'points_to' FROM documents WHERE public_id=$2`, collision, sourceID); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ column, relation string }{{"quest_target_id", "summarizes"}, {"character_target_id", "subject"}, {"region_target_id", "located_in"}} {
		if _, err := p.Exec(ctx, `INSERT INTO document_links(source_id,`+item.column+`,relation) SELECT id,$1,$2 FROM documents WHERE public_id=$3`, collision, item.relation, sourceID); err != nil {
			t.Fatal(err)
		}
	}
	query := doc03ProductSQL(t, "ListProductDocumentSubjects", ":many")
	read := func(viewer uuid.UUID) map[string]uuid.UUID {
		t.Helper()
		rows, err := p.Query(ctx, query, doc03KeyedProductArgs(t, query, pgx.StrictNamedArgs{"document_id": sourceID, "viewer_id": viewer, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-typed-other", "viewer_admin": false, "viewer_live_dm": false, "row_limit": int32(20), "row_offset": int32(0)}))
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		got := map[string]uuid.UUID{}
		for rows.Next() {
			var kind, relation string
			var target uuid.UUID
			if err := rows.Scan(&kind, &relation, &target); err != nil {
				t.Fatal(err)
			}
			got[kind+":"+relation] = target
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return got
	}
	got := read(other)
	if len(got) != 3 {
		t.Fatalf("other viewer received %v; hidden target Document must be omitted while 3 public domains remain", got)
	}
	for key, want := range map[string]uuid.UUID{"quest:summarizes": questID, "character:subject": characterID, "region:located_in": regionID} {
		if got[key] != want {
			t.Errorf("%s target UUID=%s, want %s", key, got[key], want)
		}
	}
	if _, ok := got["document:points_to"]; ok {
		t.Fatal("target Document leaked despite its dm_only audience")
	}
	owned := read(author)
	if len(owned) != 4 || owned["document:points_to"] != targetDocID {
		t.Fatalf("source owner should see all four public UUID domains, got %v", owned)
	}
	if _, err := p.Exec(ctx, `UPDATE documents SET visibility='dm_only' WHERE public_id=$1`, sourceID); err != nil {
		t.Fatal(err)
	}
	denied, err := p.Query(ctx, query, doc03KeyedProductArgs(t, query, pgx.StrictNamedArgs{"document_id": sourceID, "viewer_id": uuid.New(), "viewer_roles": []string{"player"}, "viewer_handle": "nobody", "viewer_admin": false, "viewer_live_dm": false, "row_limit": int32(20), "row_offset": int32(0)}))
	if err != nil {
		t.Fatal(err)
	}
	defer denied.Close()
	if denied.Next() {
		t.Fatal("unadmitted source Document exposed its subject links")
	}
}

func TestPhase3TaskDOC03ProductUnitOfWorkRollbackPostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	p := f.Pool
	var author uuid.UUID
	if err := p.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('doc03-rollback','doc03-rollback','Rollback',ARRAY['player'],'active') RETURNING public_id`).Scan(&author); err != nil {
		t.Fatal(err)
	}
	tx, err := p.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	insert := doc03ProductSQL(t, "InsertProductDocument", ":one")
	var internal int64
	docID := uuid.New()
	at := time.Now().UTC()
	if err := tx.QueryRow(ctx, insert, doc03KeyedProductArgs(t, insert, pgx.StrictNamedArgs{"id": docID, "kind": "community", "slug": "doc03-rollback-doc", "title": "Rollback", "category": nil, "visibility": "public", "policy": nil, "body": "tentative", "frontmatter_yaml": "title: rollback\n", "author_id": author, "at": at})).Scan(&internal, new(uuid.UUID), new(int32), new(time.Time), new(time.Time)); err != nil {
		t.Fatal(err)
	}
	revision := doc03ProductSQL(t, "InsertProductDocumentRevision", ":one")
	if err := tx.QueryRow(ctx, revision, doc03KeyedProductArgs(t, revision, pgx.StrictNamedArgs{"id": uuid.New(), "document_id": docID, "rev": int32(1), "reason": "created", "title": "Rollback", "body": "tentative", "frontmatter_yaml": "title: rollback\n", "recorded_by": author, "at": at, "old_value": nil, "new_value": nil, "policy": nil, "published_at": nil, "published_by": nil, "visibility": "public"})).Scan(new(uuid.UUID), new(int32), new(time.Time)); err != nil {
		t.Fatal(err)
	}
	link := doc03ProductSQL(t, "InsertProductDocumentLink", ":exec")
	if _, err := tx.Exec(ctx, link, doc03KeyedProductArgs(t, link, pgx.StrictNamedArgs{"document_id": docID, "target_id": uuid.New(), "relation": "references"})); err == nil {
		t.Fatal("invalid typed target unexpectedly admitted")
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var docs, revs int64
	if err := p.QueryRow(ctx, `SELECT count(*) FROM documents WHERE public_id=$1`, docID).Scan(&docs); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, `SELECT count(*) FROM document_revisions r JOIN documents d ON d.id=r.document_id WHERE d.public_id=$1`, docID).Scan(&revs); err != nil {
		t.Fatal(err)
	}
	if docs != 0 || revs != 0 {
		t.Fatalf("rollback retained document=%d revisions=%d", docs, revs)
	}
}

func TestPhase3TaskDOC03ProductFiltersAndPagesPostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	p := f.Pool
	var author int64
	var authorID uuid.UUID
	if err := p.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('doc03-filter','doc03-filter','Filter',ARRAY['player'],'active') RETURNING id,public_id`).Scan(&author, &authorID); err != nil {
		t.Fatal(err)
	}
	stamp := time.Date(2026, 10, 17, 13, 0, 0, 0, time.UTC)
	type doc struct {
		id                                  int64
		public                              uuid.UUID
		slug, title, kind, category, status string
		deleted                             bool
	}
	docs := []doc{
		{21001, uuid.MustParse("f0000000-0000-4000-8000-000000000001"), "doc03-order-low", "Order low id", "community", "lore", "published", false},
		{21002, uuid.MustParse("10000000-0000-4000-8000-000000000002"), "doc03-order-high", "Order high id", "community", "lore", "published", false},
		{21003, uuid.MustParse("c0000000-0000-4000-8000-000000000003"), "doc03-literal", "A 50%_\\ Needle", "community", "lore", "published", false},
		{21004, uuid.MustParse("b0000000-0000-4000-8000-000000000004"), "doc03-decoy", "A 50XYx Needle", "community", "lore", "published", false},
		{21005, uuid.MustParse("e0000000-0000-4000-8000-000000000005"), "doc03-trash-low", "Trash low", "community", "lore", "published", true},
		{21006, uuid.MustParse("20000000-0000-4000-8000-000000000006"), "doc03-trash-high", "Trash high", "community", "lore", "published", true},
	}
	for _, d := range docs {
		var deleted any
		if d.deleted {
			deleted = stamp
		}
		if _, err := p.Exec(ctx, `INSERT INTO documents(id,public_id,kind,slug,title,category,status,visibility,body,author_id,deleted_at,created_at,updated_at,version) VALUES($1,$2,$3,$4,$5,$6,$7,'public','body',$8,$9,$10,$10,1)`, d.id, d.public, d.kind, d.slug, d.title, d.category, d.status, author, deleted, stamp); err != nil {
			t.Fatal(err)
		}
	}
	codex := []struct {
		id             int64
		slug, category string
	}{
		{21101, "doc03-codex-root", "rules"}, {21102, "doc03-codex-child", "rules/core"},
		{21103, "doc03-codex-boundary", "rules_extra/core"}, {21104, "doc03-codex-literal", `literal%_\`},
		{21105, "doc03-codex-literal-child", `literal%_\/child`},
	}
	for _, c := range codex {
		if _, err := p.Exec(ctx, `INSERT INTO documents(id,kind,slug,title,category,status,visibility,body,author_id,created_at,updated_at,version) VALUES($1,'codex_entry',$2,$2,$3,'published','public','codex',$4,$5,$5,1)`, c.id, c.slug, c.category, author, stamp); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := p.Exec(ctx, `UPDATE documents SET public_id=CASE id WHEN 21104 THEN '10000000-0000-4000-8000-000000000104'::uuid ELSE 'f0000000-0000-4000-8000-000000000105'::uuid END WHERE id IN (21104,21105)`); err != nil {
		t.Fatal(err)
	}
	directoryDocs := []struct {
		id       int64
		public   uuid.UUID
		slug     string
		category string
		updated  time.Time
	}{
		{21202, uuid.MustParse("10000000-0000-4000-8000-000000000201"), "doc03-dir-tie-low", "a-category", stamp.Add(2 * time.Hour)},
		{21201, uuid.MustParse("f0000000-0000-4000-8000-000000000202"), "doc03-dir-tie-high", "z-category", stamp.Add(2 * time.Hour)},
		{21203, uuid.MustParse("30000000-0000-4000-8000-000000000203"), "doc03-dir-newer", "a-category", stamp.Add(time.Hour)},
		{21204, uuid.MustParse("d0000000-0000-4000-8000-000000000204"), "doc03-dir-older", "z-category", stamp},
	}
	for _, d := range directoryDocs {
		if _, err := p.Exec(ctx, `INSERT INTO documents(id,public_id,kind,slug,title,category,status,visibility,body,author_id,created_at,updated_at,version) VALUES($1,$2,'codex_entry',$3,'directory order fixture',$4,'published','public','codex',$5,$6,$7,1)`, d.id, d.public, d.slug, d.category, author, stamp, d.updated); err != nil {
			t.Fatal(err)
		}
	}
	viewer := pgx.StrictNamedArgs{"viewer_id": authorID, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-filter", "viewer_admin": false, "viewer_live_dm": false}
	listSQL := doc03ProductSQL(t, "ListProductDocuments", ":many")
	countSQL := doc03ProductSQL(t, "CountProductDocuments", ":one")
	filter := func(search any) pgx.StrictNamedArgs {
		args := pgx.StrictNamedArgs{"kind": nil, "category": "lore", "status": "published", "visibility": "public", "author_id": authorID, "search": search, "region_id": nil}
		for k, v := range viewer {
			args[k] = v
		}
		return args
	}
	countArgs := doc03KeyedProductArgs(t, countSQL, filter(nil))
	var count int64
	var override bool
	if err := p.QueryRow(ctx, countSQL, countArgs).Scan(&count, &override); err != nil {
		t.Fatal(err)
	}
	if count != 4 || override {
		t.Fatalf("filtered count=(%d,%v), want (4,false)", count, override)
	}
	searchArgs := filter(`50%_\`)
	searchCountArgs := doc03KeyedProductArgs(t, countSQL, searchArgs)
	if err := p.QueryRow(ctx, countSQL, searchCountArgs).Scan(&count, &override); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("escaped literal search count=%d, want 1", count)
	}
	searchListArgs := searchArgs
	searchListArgs["row_limit"] = int32(10)
	searchListArgs["row_offset"] = int32(0)
	rows, err := p.Query(ctx, listSQL, doc03KeyedProductArgs(t, listSQL, searchListArgs))
	if err != nil {
		t.Fatal(err)
	}
	var found []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		var kind, slug, title string
		var category *string
		var status, visibility, body string
		var fm, policy []byte
		var authorOut *uuid.UUID
		var published, deleted, updated, created *time.Time
		var version int32
		var adminOverride bool
		if err := rows.Scan(&id, &kind, &slug, &title, &category, &status, &visibility, &body, &fm, &policy, &authorOut, &published, &deleted, &updated, &version, &created, &adminOverride); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		found = append(found, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	if len(found) != 1 || found[0] != docs[2].public {
		t.Fatalf("escaped search returned %v, want literal-percent/underscore/backslash document %s", found, docs[2].public)
	}
	pageArgs := filter(nil)
	pageArgs["row_limit"] = int32(1)
	pageArgs["row_offset"] = int32(0)
	rows, err = p.Query(ctx, listSQL, doc03KeyedProductArgs(t, listSQL, pageArgs))
	if err != nil {
		t.Fatal(err)
	}
	if !rows.Next() {
		rows.Close()
		t.Fatal("first document page empty")
	}
	var first uuid.UUID
	if err := rows.Scan(&first, new(string), new(string), new(string), new(*string), new(string), new(string), new(string), new([]byte), new([]byte), new(*uuid.UUID), new(*time.Time), new(*time.Time), new(*time.Time), new(int32), new(*time.Time), new(bool)); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	if first != docs[0].public {
		t.Fatalf("equal-timestamp list tie returned %s, want higher public UUID %s despite lower internal id", first, docs[0].public)
	}
	trashCount := doc03ProductSQL(t, "CountProductDocumentsTrash", ":one")
	if err := p.QueryRow(ctx, trashCount).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("trash count=%d, want 2", count)
	}
	trashList := doc03ProductSQL(t, "ListProductDocumentsTrash", ":many")
	rows, err = p.Query(ctx, trashList, doc03KeyedProductArgs(t, trashList, pgx.StrictNamedArgs{"row_limit": int32(1), "row_offset": int32(0)}))
	if err != nil {
		t.Fatal(err)
	}
	if !rows.Next() {
		rows.Close()
		t.Fatal("trash page empty")
	}
	var trashID uuid.UUID
	if err := rows.Scan(&trashID, new(string), new(string), new(string), new(*string), new(string), new(string), new(string), new([]byte), new([]byte), new(*uuid.UUID), new(*time.Time), new(*uuid.UUID), new(*time.Time), new(int32), new(*time.Time)); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	if trashID != docs[4].public {
		t.Fatalf("trash tie returned %s, want higher UUID %s", trashID, docs[4].public)
	}
	directoryCount := doc03ProductSQL(t, "CountProductCodexDirectory", ":one")
	directoryList := doc03ProductSQL(t, "ListProductCodexDirectory", ":many")
	dirArgs := func(prefix string) pgx.StrictNamedArgs {
		return pgx.StrictNamedArgs{"category_prefix": prefix, "search": nil, "viewer_id": authorID, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-filter", "viewer_admin": false, "viewer_live_dm": false}
	}
	var directoryTotal int64
	if err := p.QueryRow(ctx, directoryCount, doc03KeyedProductArgs(t, directoryCount, dirArgs("rules"))).Scan(&directoryTotal); err != nil {
		t.Fatal(err)
	}
	if directoryTotal != 2 {
		t.Fatalf("rules category-prefix count=%d, want root and path child only", directoryTotal)
	}
	prefixArgs := dirArgs(`literal%_\`)
	prefixArgs["row_limit"] = int32(10)
	prefixArgs["row_offset"] = int32(0)
	rows, err = p.Query(ctx, directoryList, doc03KeyedProductArgs(t, directoryList, prefixArgs))
	if err != nil {
		t.Fatal(err)
	}
	var categories []string
	for rows.Next() {
		var id uuid.UUID
		var kind, slug, title string
		var category *string
		var status, visibility, body string
		var fm, policy []byte
		var authorOut *uuid.UUID
		var updated time.Time
		var version int32
		if err := rows.Scan(&id, &kind, &slug, &title, &category, &status, &visibility, &body, &fm, &policy, &authorOut, &updated, &version); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		if category != nil {
			categories = append(categories, *category)
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	if len(categories) != 2 || categories[0] != `literal%_\/child` || categories[1] != `literal%_\` {
		t.Fatalf("escaped category-prefix results=%q", categories)
	}
	directorySearchArgs := dirArgs("")
	directorySearchArgs["category_prefix"] = nil
	directorySearchArgs["search"] = "directory order"
	if err := p.QueryRow(ctx, directoryCount, doc03KeyedProductArgs(t, directoryCount, directorySearchArgs)).Scan(&directoryTotal); err != nil {
		t.Fatal(err)
	}
	if directoryTotal != int64(len(directoryDocs)) {
		t.Fatalf("directory search count=%d, want %d", directoryTotal, len(directoryDocs))
	}
	listDirectoryPage := func(offset int32) []uuid.UUID {
		args := directorySearchArgs
		args["row_limit"] = int32(1)
		args["row_offset"] = offset
		page, err := p.Query(ctx, directoryList, doc03KeyedProductArgs(t, directoryList, args))
		if err != nil {
			t.Fatal(err)
		}
		defer page.Close()
		var ids []uuid.UUID
		for page.Next() {
			var id uuid.UUID
			if err := page.Scan(&id, new(string), new(string), new(string), new(*string), new(string), new(string), new(string), new([]byte), new([]byte), new(*uuid.UUID), new(time.Time), new(int32)); err != nil {
				t.Fatal(err)
			}
			ids = append(ids, id)
		}
		if err := page.Err(); err != nil {
			t.Fatal(err)
		}
		return ids
	}
	for offset, want := range []uuid.UUID{directoryDocs[1].public, directoryDocs[0].public, directoryDocs[2].public, directoryDocs[3].public} {
		got := listDirectoryPage(int32(offset))
		if len(got) != 1 || got[0] != want {
			t.Fatalf("directory page offset %d ids=%v, want [%s] by updated_at/public_id descending", offset, got, want)
		}
	}
	if got := listDirectoryPage(int32(len(directoryDocs))); len(got) != 0 {
		t.Fatalf("directory page past end returned %v, want empty page with count %d", got, directoryTotal)
	}
	categorySQL := doc03ProductSQL(t, "ListProductCodexCategories", ":many")
	rows, err = p.Query(ctx, categorySQL, doc03KeyedProductArgs(t, categorySQL, pgx.StrictNamedArgs{"viewer_id": authorID, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-filter", "viewer_admin": false, "viewer_live_dm": false}))
	if err != nil {
		t.Fatal(err)
	}
	categoryCounts := map[string]int64{}
	for rows.Next() {
		var category string
		var n int64
		if err := rows.Scan(&category, &n); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		categoryCounts[category] = n
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	if categoryCounts["rules"] != 1 || categoryCounts["rules/core"] != 1 || categoryCounts["rules_extra/core"] != 1 {
		t.Fatalf("codex category counts=%v", categoryCounts)
	}
}

func TestPhase3TaskDOC03ProductMutationAndLookupPostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	p := f.Pool
	var memberInternal int64
	var owner uuid.UUID
	var member uuid.UUID
	if err := p.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES('doc03-mutation-owner','doc03-mutation-owner','Owner',ARRAY['player'],'active') RETURNING id,public_id`).Scan(&memberInternal, &owner); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES('doc03-mutation-reader','doc03-mutation-reader','Reader',ARRAY['player'],'active') RETURNING public_id`).Scan(&member); err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 17, 14, 0, 0, 0, time.UTC)
	insert := doc03ProductSQL(t, "InsertProductDocument", ":one")
	create := func(slug, kind string) (int64, uuid.UUID) {
		t.Helper()
		var internal int64
		var id uuid.UUID
		if err := p.QueryRow(ctx, insert, doc03KeyedProductArgs(t, insert, pgx.StrictNamedArgs{"id": uuid.New(), "kind": kind, "slug": slug, "title": slug, "category": nil, "visibility": "public", "policy": nil, "body": "body", "frontmatter_yaml": "title: " + slug + "\n", "author_id": owner, "at": at})).Scan(&internal, &id, new(int32), new(time.Time), new(time.Time)); err != nil {
			t.Fatal(err)
		}
		return internal, id
	}
	sourceInternal, source := create("doc03-mutation-source", "community")
	_, target := create("doc03-mutation-target", "community")
	_, brief := create("doc03-mutation-brief", "quest_brief")
	lookup := doc03ProductSQL(t, "GetProductDocumentBySlug", ":one")
	lookupArgs := pgx.StrictNamedArgs{"slug": "doc03-mutation-source", "viewer_id": owner, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-mutation-owner", "viewer_admin": false, "viewer_live_dm": false}
	var lookupID uuid.UUID
	if err := p.QueryRow(ctx, lookup, doc03KeyedProductArgs(t, lookup, lookupArgs)).Scan(new(int64), &lookupID, new(string), new(string), new(string), new(*string), new(string), new(string), new([]byte), new(string), new(*string), new(int64), new(uuid.UUID), new(*time.Time), new(*uuid.UUID), new(*time.Time), new(*uuid.UUID), new(time.Time), new(time.Time), new(int32), new([]uuid.UUID), new(bool), new(bool), new([]uuid.UUID), new([]uuid.UUID)); err != nil {
		t.Fatal(err)
	}
	if lookupID != source {
		t.Fatalf("slug lookup id=%v want %s", lookupID, source)
	}
	lock := doc03ProductSQL(t, "LockProductDocumentByID", ":one")
	tx, err := p.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedID uuid.UUID
	if err := tx.QueryRow(ctx, lock, doc03KeyedProductArgs(t, lock, pgx.StrictNamedArgs{"document_id": source})).Scan(new(int64), &lockedID, new(string), new(string), new(string), new(*string), new(string), new(string), new([]byte), new(string), new(*string), new(int64), new(uuid.UUID), new(*time.Time), new(*uuid.UUID), new(*time.Time), new(*uuid.UUID), new(time.Time), new(time.Time), new(int32), new([]uuid.UUID), new([]uuid.UUID), new([]uuid.UUID)); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	if lockedID != source {
		tx.Rollback(ctx)
		t.Fatalf("lock id=%v want %s", lockedID, source)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	replaceReaders := doc03ProductSQL(t, "ReplaceProductDocumentReaders", ":exec")
	insertReaders := doc03ProductSQL(t, "InsertProductDocumentReaders", ":exec")
	if _, err := p.Exec(ctx, replaceReaders, doc03KeyedProductArgs(t, replaceReaders, pgx.StrictNamedArgs{"document_id": source})); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, insertReaders, doc03KeyedProductArgs(t, insertReaders, pgx.StrictNamedArgs{"document_id": source, "reader_ids": []uuid.UUID{member}})); err != nil {
		t.Fatal(err)
	}
	read := doc03ProductSQL(t, "GetProductDocumentByID", ":one")
	readArgs := pgx.StrictNamedArgs{"document_id": source, "viewer_id": owner, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-mutation-owner", "viewer_admin": false, "viewer_live_dm": false}
	var readerIDs []uuid.UUID
	if err := p.QueryRow(ctx, read, doc03KeyedProductArgs(t, read, readArgs)).Scan(new(int64), new(uuid.UUID), new(string), new(string), new(string), new(*string), new(string), new(string), new([]byte), new(string), new(*string), new(int64), new(uuid.UUID), new(*time.Time), new(*uuid.UUID), new(*time.Time), new(*uuid.UUID), new(time.Time), new(time.Time), new(int32), &readerIDs, new(bool), new(bool), new([]uuid.UUID), new([]uuid.UUID)); err != nil {
		t.Fatal(err)
	}
	if len(readerIDs) != 1 || readerIDs[0] != member {
		t.Fatalf("reader IDs=%v", readerIDs)
	}
	replaceDocLinks := doc03ProductSQL(t, "ReplaceProductDocumentLinks", ":exec")
	insertDocLink := doc03ProductSQL(t, "InsertProductDocumentLink", ":exec")
	if _, err := p.Exec(ctx, replaceDocLinks, doc03KeyedProductArgs(t, replaceDocLinks, pgx.StrictNamedArgs{"document_id": source})); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, insertDocLink, doc03KeyedProductArgs(t, insertDocLink, pgx.StrictNamedArgs{"document_id": source, "target_id": target, "relation": "references"})); err != nil {
		t.Fatal(err)
	}
	var linkCount int64
	if err := p.QueryRow(ctx, `SELECT count(*) FROM document_links WHERE source_id=$1 AND target_type='document'`, sourceInternal).Scan(&linkCount); err != nil {
		t.Fatal(err)
	}
	if linkCount != 1 {
		t.Fatalf("valid Document link insert retained %d rows, want 1", linkCount)
	}
	if _, err := p.Exec(ctx, replaceDocLinks, doc03KeyedProductArgs(t, replaceDocLinks, pgx.StrictNamedArgs{"document_id": source})); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, `SELECT count(*) FROM document_links WHERE source_id=$1 AND target_type='document'`, sourceInternal).Scan(&linkCount); err != nil {
		t.Fatal(err)
	}
	if linkCount != 0 {
		t.Fatalf("document-link replacement retained %d rows", linkCount)
	}
	// Summary link writers are exercised against real Quest and Character FKs;
	// exact protected-Quest audience admission remains a separate unresolved rule.
	var questID uuid.UUID
	var questInternal int64
	questInsert := `INSERT INTO quests(short_code,kinds,status,dm_id,scheduled_at,duration_hours,slots_max,filled_count,document_id,created_by) VALUES('DOC03M',ARRAY['standard'],'open',@dm_id,now()+interval '1 day',4,5,0,(SELECT id FROM documents WHERE public_id=@brief_id),(SELECT id FROM members WHERE public_id=@owner_id)) RETURNING id,public_id`
	questArgs := pgx.StrictNamedArgs{"dm_id": memberInternal, "brief_id": brief, "owner_id": owner}
	if err := p.QueryRow(ctx, questInsert, doc03KeyedProductArgs(t, questInsert, questArgs)).Scan(&questInternal, &questID); err != nil {
		t.Fatal(err)
	}
	var characterID uuid.UUID
	if err := p.QueryRow(ctx, `INSERT INTO characters(short_code,name,owner_id,status) VALUES('DOC03M','DOC03M character',$1,'active') RETURNING public_id`, memberInternal).Scan(&characterID); err != nil {
		t.Fatal(err)
	}
	summaryInternal, summaryID := create("doc03-mutation-summary", "summary")
	replaceSummary := doc03ProductSQL(t, "ReplaceProductSummaryLinks", ":exec")
	insertQuest := doc03ProductSQL(t, "InsertProductSummaryQuestLinks", ":exec")
	questLinks := func(quests []uuid.UUID, character *uuid.UUID) {
		t.Helper()
		if _, err := p.Exec(ctx, replaceSummary, doc03KeyedProductArgs(t, replaceSummary, pgx.StrictNamedArgs{"document_id": summaryID, "quest_ids": quests, "character_id": character})); err != nil {
			t.Fatal(err)
		}
	}
	questLinks([]uuid.UUID{questID}, &characterID)
	if err := p.QueryRow(ctx, `SELECT count(*) FROM document_links WHERE source_id=$1 AND target_type IN ('quest','character')`, summaryInternal).Scan(&linkCount); err != nil {
		t.Fatal(err)
	}
	if linkCount != 2 {
		t.Fatalf("valid summary links retained %d rows, want Quest and Character", linkCount)
	}
	var originalOrder int64
	if err := p.QueryRow(ctx, `SELECT summary_append_order FROM document_links WHERE source_id=$1 AND quest_target_id=(SELECT id FROM quests WHERE public_id=$2)`, summaryInternal, questID).Scan(&originalOrder); err != nil {
		t.Fatal(err)
	}
	questLinks([]uuid.UUID{questID}, &characterID)
	var retainedOrder int64
	if err := p.QueryRow(ctx, `SELECT summary_append_order FROM document_links WHERE source_id=$1 AND quest_target_id=(SELECT id FROM quests WHERE public_id=$2)`, summaryInternal, questID).Scan(&retainedOrder); err != nil {
		t.Fatal(err)
	}
	if retainedOrder != originalOrder {
		t.Fatalf("summary edit changed retained append order from %d to %d", originalOrder, retainedOrder)
	}
	questLinks(nil, nil)
	if err := p.QueryRow(ctx, `SELECT count(*) FROM document_links WHERE source_id=$1 AND target_type IN ('quest','character')`, summaryInternal).Scan(&linkCount); err != nil {
		t.Fatal(err)
	}
	if linkCount != 0 {
		t.Fatalf("summary-link reconciliation retained %d rows after removing memberships", linkCount)
	}
	questLinks([]uuid.UUID{questID}, &characterID)
	var readdedOrder int64
	if err := p.QueryRow(ctx, `SELECT summary_append_order FROM document_links WHERE source_id=$1 AND quest_target_id=(SELECT id FROM quests WHERE public_id=$2)`, summaryInternal, questID).Scan(&readdedOrder); err != nil {
		t.Fatal(err)
	}
	if readdedOrder <= retainedOrder {
		t.Fatalf("re-added summary order=%d, want greater than prior order %d", readdedOrder, retainedOrder)
	}
	questTwoInsert := `INSERT INTO quests(short_code,kinds,status,dm_id,scheduled_at,duration_hours,slots_max,filled_count,document_id,created_by) VALUES('DOC03N',ARRAY['standard'],'open',@dm_id,now()+interval '1 day',4,5,0,(SELECT id FROM documents WHERE public_id=@brief_id),(SELECT id FROM members WHERE public_id=@owner_id))`
	if _, err := p.Exec(ctx, questTwoInsert, pgx.StrictNamedArgs{"dm_id": memberInternal, "brief_id": brief, "owner_id": owner}); err != nil {
		t.Fatal(err)
	}
	var questTwo uuid.UUID
	if err := p.QueryRow(ctx, `SELECT public_id FROM quests WHERE short_code='DOC03N'`).Scan(&questTwo); err != nil {
		t.Fatal(err)
	}
	questLinks([]uuid.UUID{questID, questTwo}, &characterID)
	var questTwoOrder int64
	if err := p.QueryRow(ctx, `SELECT summary_append_order FROM document_links WHERE source_id=$1 AND quest_target_id=(SELECT id FROM quests WHERE public_id=$2)`, summaryInternal, questTwo).Scan(&questTwoOrder); err != nil {
		t.Fatal(err)
	}
	questLinks([]uuid.UUID{questTwo}, &characterID)
	var questTwoRetained int64
	if err := p.QueryRow(ctx, `SELECT summary_append_order FROM document_links WHERE source_id=$1 AND quest_target_id=(SELECT id FROM quests WHERE public_id=$2)`, summaryInternal, questTwo).Scan(&questTwoRetained); err != nil {
		t.Fatal(err)
	}
	if questTwoRetained != questTwoOrder {
		t.Fatalf("multi-Quest summary edit changed retained order from %d to %d", questTwoOrder, questTwoRetained)
	}
	tx, err = p.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, replaceSummary, doc03KeyedProductArgs(t, replaceSummary, pgx.StrictNamedArgs{"document_id": summaryID, "quest_ids": []uuid.UUID{questID, questTwo}, "character_id": &characterID})); err != nil {
		_ = tx.Rollback(ctx)
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, `SELECT count(*) FROM document_links WHERE source_id=$1 AND quest_target_id=(SELECT id FROM quests WHERE public_id=$2)`, summaryInternal, questID).Scan(&linkCount); err != nil {
		t.Fatal(err)
	}
	if linkCount != 0 {
		t.Fatalf("rolled-back summary append retained %d Quest links", linkCount)
	}
	concurrentA, concurrentB := uuid.New(), uuid.New()
	if _, err := p.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility) VALUES($1,'summary','doc03-summary-concurrent-a','Concurrent A','published','public'),($2,'summary','doc03-summary-concurrent-b','Concurrent B','published','public')`, concurrentA, concurrentB); err != nil {
		t.Fatal(err)
	}
	startAppend := make(chan struct{})
	appendErrors := make(chan error, 2)
	for _, appendArgs := range []pgx.StrictNamedArgs{
		{"document_id": concurrentA, "quest_ids": []uuid.UUID{questID, questTwo}},
		{"document_id": concurrentB, "quest_ids": []uuid.UUID{questTwo, questID}},
	} {
		appendArgs := doc03KeyedProductArgs(t, insertQuest, appendArgs)
		go func() {
			concurrentTx, err := p.Begin(ctx)
			if err != nil {
				appendErrors <- err
				return
			}
			<-startAppend
			if _, err := concurrentTx.Exec(ctx, insertQuest, appendArgs); err != nil {
				_ = concurrentTx.Rollback(ctx)
				appendErrors <- err
				return
			}
			appendErrors <- concurrentTx.Commit(ctx)
		}()
	}
	close(startAppend)
	for range 2 {
		if err := <-appendErrors; err != nil {
			t.Fatalf("concurrent sorted-Quest append failed: %v", err)
		}
	}
	newerSummary := uuid.New()
	olderSummary := uuid.New()
	if _, err := p.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,created_at,updated_at) VALUES($1,'summary','doc03-summary-newer','Newer summary','published','public','newer','2026-10-17','2026-10-17'),($2,'summary','doc03-summary-older','Older summary','published','public','older','2020-01-01','2020-01-01')`, newerSummary, olderSummary); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, insertQuest, doc03KeyedProductArgs(t, insertQuest, pgx.StrictNamedArgs{"document_id": newerSummary, "quest_ids": []uuid.UUID{questID}})); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Exec(ctx, insertQuest, doc03KeyedProductArgs(t, insertQuest, pgx.StrictNamedArgs{"document_id": olderSummary, "quest_ids": []uuid.UUID{questID}})); err != nil {
		t.Fatal(err)
	}
	var latestSummary uuid.UUID
	if err := p.QueryRow(ctx, `SELECT d.public_id FROM document_links l JOIN documents d ON d.id=l.source_id WHERE l.quest_target_id=(SELECT id FROM quests WHERE public_id=$1) AND l.relation='summarizes' ORDER BY l.summary_append_order DESC LIMIT 1`, questID).Scan(&latestSummary); err != nil {
		t.Fatal(err)
	}
	if latestSummary != olderSummary {
		t.Fatalf("Quest summary tail=%s, want most recently appended older summary %s", latestSummary, olderSummary)
	}

	if _, err := p.Exec(ctx, `UPDATE quests SET public_id=CASE id WHEN $1 THEN 'f0000000-0000-4000-8000-000000000001'::uuid WHEN $2 THEN '10000000-0000-4000-8000-000000000002'::uuid END WHERE id IN ($1,$2)`, questInternal, func() int64 {
		var id int64
		if err := p.QueryRow(ctx, `SELECT id FROM quests WHERE public_id=$1`, questTwo).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}()); err != nil {
		t.Fatal(err)
	}
	var questTwoInternal int64
	if err := p.QueryRow(ctx, `SELECT id FROM quests WHERE short_code='DOC03N'`).Scan(&questTwoInternal); err != nil {
		t.Fatal(err)
	}
	if questTwoInternal <= questInternal {
		t.Fatalf("fixture internal Quest order=%d,%d, want the higher public UUID on the lower internal ID", questInternal, questTwoInternal)
	}
	questID = uuid.MustParse("f0000000-0000-4000-8000-000000000001")
	questTwo = uuid.MustParse("10000000-0000-4000-8000-000000000002")
	orderCtx, cancelOrder := context.WithTimeout(ctx, 8*time.Second)
	defer cancelOrder()
	foreignTx, err := p.Begin(orderCtx)
	if err != nil {
		t.Fatal(err)
	}
	defer foreignTx.Rollback(orderCtx)
	var firstLocked int64
	if err := foreignTx.QueryRow(orderCtx, `SELECT id FROM quests WHERE public_id='10000000-0000-4000-8000-000000000002' FOR UPDATE`).Scan(&firstLocked); err != nil {
		t.Fatal(err)
	}
	crossWriterID := uuid.New()
	if _, err := p.Exec(orderCtx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility) VALUES($1,'summary','doc03-cross-writer-order','Cross writer order','published','public')`, crossWriterID); err != nil {
		t.Fatal(err)
	}
	crossWriterArgs := doc03KeyedProductArgs(t, replaceSummary, pgx.StrictNamedArgs{"document_id": crossWriterID, "quest_ids": []uuid.UUID{questID, questTwo}, "character_id": nil})
	type writerStart struct {
		pid uint32
		err error
	}
	writerStarted := make(chan writerStart, 1)
	writerDone := make(chan error, 1)
	go func() {
		conn, err := p.Acquire(orderCtx)
		if err != nil {
			writerStarted <- writerStart{err: err}
			return
		}
		defer conn.Release()
		writerTx, err := conn.Begin(orderCtx)
		if err != nil {
			writerStarted <- writerStart{err: err}
			return
		}
		writerStarted <- writerStart{pid: conn.Conn().PgConn().PID()}
		if _, err := writerTx.Exec(orderCtx, replaceSummary, crossWriterArgs); err != nil {
			_ = writerTx.Rollback(orderCtx)
			writerDone <- err
			return
		}
		writerDone <- writerTx.Commit(orderCtx)
	}()
	started := <-writerStarted
	if started.err != nil {
		t.Fatal(started.err)
	}
	waitDeadline := time.Now().Add(2 * time.Second)
	for {
		var waitEvent sql.NullString
		if err := p.QueryRow(orderCtx, `SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`, started.pid).Scan(&waitEvent); err != nil {
			t.Fatal(err)
		}
		if waitEvent.Valid && waitEvent.String == "Lock" {
			break
		}
		if time.Now().After(waitDeadline) {
			cancelOrder()
			_ = foreignTx.Rollback(context.Background())
			err := <-writerDone
			t.Fatalf("summary writer did not reach the foreign row-lock barrier; result=%v wait_event=%v", err, waitEvent)
		}
		time.Sleep(10 * time.Millisecond)
	}
	foreignRows, err := foreignTx.Query(orderCtx, `SELECT id FROM quests WHERE public_id=ANY($1::uuid[]) ORDER BY public_id FOR UPDATE`, []uuid.UUID{questID, questTwo})
	if err != nil {
		t.Fatalf("foreign public-UUID-ordered Quest writer acquired conflicting locks: %v", err)
	}
	for foreignRows.Next() {
		var id int64
		if err := foreignRows.Scan(&id); err != nil {
			foreignRows.Close()
			t.Fatal(err)
		}
	}
	if err := foreignRows.Err(); err != nil {
		foreignRows.Close()
		t.Fatal(err)
	}
	foreignRows.Close()
	if err := foreignTx.Commit(orderCtx); err != nil {
		t.Fatal(err)
	}
	if err := <-writerDone; err != nil {
		t.Fatalf("summary writer failed after public-UUID lock release: %v", err)
	}
	if err := p.QueryRow(ctx, `SELECT count(*) FROM document_links WHERE source_id=(SELECT id FROM documents WHERE public_id=$1) AND target_type='quest'`, crossWriterID).Scan(&linkCount); err != nil {
		t.Fatal(err)
	}
	if linkCount != 2 {
		t.Fatalf("cross-writer summary append retained %d Quest links, want 2", linkCount)
	}

	codex := doc03ProductSQL(t, "GetProductCodexEntryBySlug", ":one")
	var codexID uuid.UUID
	if _, err := p.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,created_at,updated_at,version) VALUES($1,'codex_entry','doc03-mutation-codex','Codex','rules/core','published','public','codex',$2,$3,$3,1)`, uuid.New(), memberInternal, at); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, codex, doc03KeyedProductArgs(t, codex, pgx.StrictNamedArgs{"slug": "doc03-mutation-codex", "viewer_id": owner, "viewer_roles": []string{"player"}, "viewer_handle": "doc03-mutation-owner", "viewer_admin": false, "viewer_live_dm": false})).Scan(&codexID, new(string), new(string), new(string), new(*string), new(string), new(string), new(string), new([]byte), new([]byte), new(*uuid.UUID), new(time.Time), new(int32), new(bool), new(bool)); err != nil {
		t.Fatal(err)
	}
	if codexID == uuid.Nil {
		t.Fatal("codex lookup returned nil public id")
	}
	// Assignment ordering is by NPC public UUID then member UUID, independent of grant time.
	var npcLow, npcHigh uuid.UUID
	npcLow = uuid.MustParse("10000000-0000-4000-8000-000000000099")
	npcHigh = uuid.MustParse("f0000000-0000-4000-8000-000000000099")
	if _, err := p.Exec(ctx, `INSERT INTO documents(id,public_id,kind,slug,title,status,visibility,author_id) VALUES(22001,$1,'community','doc03-npc-low','NPC low','draft','public',$2),(22002,$3,'community','doc03-npc-high','NPC high','draft','public',$2)`, npcLow, memberInternal, npcHigh); err != nil {
		t.Fatal(err)
	}
	var assignmentMemberLow, assignmentMemberHigh uuid.UUID
	if err := p.QueryRow(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES('10000000-0000-4000-8000-000000000201','doc03-assignment-low','doc03-assignment-low','Low',ARRAY['player'],'active') RETURNING public_id`).Scan(&assignmentMemberLow); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES('f0000000-0000-4000-8000-000000000202','doc03-assignment-high','doc03-assignment-high','High',ARRAY['player'],'active') RETURNING public_id`).Scan(&assignmentMemberHigh); err != nil {
		t.Fatal(err)
	}
	assign := doc03ProductSQL(t, "AssignProductLieutenant", ":exec")
	assignmentRows := []struct {
		npc, member uuid.UUID
		at          time.Time
	}{
		{npcLow, assignmentMemberLow, at.Add(1 * time.Hour)},
		{npcLow, assignmentMemberHigh, at},
		{npcHigh, assignmentMemberLow, at.Add(3 * time.Hour)},
		{npcHigh, assignmentMemberHigh, at.Add(2 * time.Hour)},
	}
	for _, item := range assignmentRows {
		if _, err := p.Exec(ctx, assign, doc03KeyedProductArgs(t, assign, pgx.StrictNamedArgs{"member_id": item.member, "npc_document_id": item.npc, "granted_by": owner, "at": item.at})); err != nil {
			t.Fatal(err)
		}
	}
	listAssignments := doc03ProductSQL(t, "ListProductLieutenantAssignments", ":many")
	countAssignments := doc03ProductSQL(t, "CountProductLieutenantAssignments", ":one")
	assignmentArgs := pgx.StrictNamedArgs{"member_id": nil, "npc_document_id": nil, "row_limit": int32(10), "row_offset": int32(0)}
	var assignments int64
	if err := p.QueryRow(ctx, countAssignments, doc03KeyedProductArgs(t, countAssignments, pgx.StrictNamedArgs{"member_id": nil, "npc_document_id": nil})).Scan(&assignments); err != nil {
		t.Fatal(err)
	}
	if assignments != 4 {
		t.Fatalf("assignment count=%d want 4", assignments)
	}
	rows, err := p.Query(ctx, listAssignments, doc03KeyedProductArgs(t, listAssignments, assignmentArgs))
	if err != nil {
		t.Fatal(err)
	}
	wantAssignments := [][2]uuid.UUID{{npcLow, assignmentMemberLow}, {npcLow, assignmentMemberHigh}, {npcHigh, assignmentMemberLow}, {npcHigh, assignmentMemberHigh}}
	gotAssignments := make([][2]uuid.UUID, 0, len(wantAssignments))
	for rows.Next() {
		var gotMember, gotNPC uuid.UUID
		if err := rows.Scan(&gotMember, &gotNPC, new(time.Time), new(*uuid.UUID)); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		gotAssignments = append(gotAssignments, [2]uuid.UUID{gotNPC, gotMember})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	if len(gotAssignments) != len(wantAssignments) {
		t.Fatalf("assignment page length=%d, want %d", len(gotAssignments), len(wantAssignments))
	}
	for i := range wantAssignments {
		if gotAssignments[i] != wantAssignments[i] {
			t.Fatalf("assignment order=%v, want NPC/member public UUID order %v despite grant times", gotAssignments, wantAssignments)
		}
	}
	revoke := doc03ProductSQL(t, "RevokeProductLieutenant", ":exec")
	if _, err := p.Exec(ctx, revoke, doc03KeyedProductArgs(t, revoke, pgx.StrictNamedArgs{"member_id": assignmentMemberLow, "npc_document_id": npcLow})); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, countAssignments, doc03KeyedProductArgs(t, countAssignments, pgx.StrictNamedArgs{"member_id": assignmentMemberLow, "npc_document_id": npcLow})).Scan(&assignments); err != nil {
		t.Fatal(err)
	}
	if assignments != 0 {
		t.Fatalf("revoked assignment count=%d", assignments)
	}
}

func TestPhase3TaskDOC03SummaryAppendOrderSquashedSchemaPostgresAcceptance(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	var memberID, summaryID, questID int64
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES('doc03-order-owner','doc03-order-owner','Owner',ARRAY['dm'],'active') RETURNING id`).Scan(&memberID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,author_id) VALUES('summary','doc03-order','Summary','published','public',$1) RETURNING id`, memberID).Scan(&summaryID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO quests(short_code,kinds,status,dm_id,scheduled_at,document_id,created_by) VALUES('DOC03G',ARRAY['standard'],'open',$1,now()+interval '1 day',$2,$1) RETURNING id`, memberID, summaryID).Scan(&questID); err != nil {
		t.Fatal(err)
	}
	var order int64
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO document_links(source_id,quest_target_id,relation) VALUES($1,$2,'summarizes') RETURNING summary_append_order`, summaryID, questID).Scan(&order); err != nil {
		t.Fatal(err)
	}
	if order <= 0 {
		t.Fatalf("append ordinal=%d, want positive identity", order)
	}
	t.Run("fresh schema owns immutable allocation", func(t *testing.T) {
		var identity, generation string
		if err := fixture.Pool.QueryRow(ctx, `SELECT is_identity,identity_generation FROM information_schema.columns WHERE table_schema='public' AND table_name='document_links' AND column_name='summary_append_order'`).Scan(&identity, &generation); err != nil {
			t.Fatal(err)
		}
		if identity != "YES" || generation != "ALWAYS" {
			t.Fatalf("identity=%s generation=%s", identity, generation)
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,quest_target_id,relation,summary_append_order) VALUES($1,$2,'another',$3)`, summaryID, questID, order+1); err == nil {
			t.Fatal("caller-authored ordinal admitted without explicit identity override")
		}
	})
	t.Run("duplicate recorded order rolls back complete new append", func(t *testing.T) {
		tx, err := fixture.Pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var tentativeID int64
		if err := tx.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,author_id) VALUES('summary','doc03-tentative-order','Tentative','published','public',$1) RETURNING id`, memberID).Scan(&tentativeID); err != nil {
			t.Fatal(err)
		}
		_, err = tx.Exec(ctx, `INSERT INTO document_links(source_id,quest_target_id,relation,summary_append_order) OVERRIDING SYSTEM VALUE VALUES($1,$2,'summarizes',$3)`, tentativeID, questID, order)
		if violation, ok := errors.AsType[*pgconn.PgError](err); !ok || violation.Code != "23505" {
			t.Fatalf("duplicate order error=%v, want unique constraint rejection", err)
		}
		if err := tx.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		var residual int
		if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM documents WHERE slug='doc03-tentative-order'`).Scan(&residual); err != nil {
			t.Fatal(err)
		}
		if residual != 0 {
			t.Fatal("failed append retained tentative document")
		}
		var retainedOrder int64
		if err := fixture.Pool.QueryRow(ctx, `SELECT summary_append_order FROM document_links WHERE source_id=$1 AND quest_target_id=$2 AND relation='summarizes'`, summaryID, questID).Scan(&retainedOrder); err != nil {
			t.Fatal(err)
		}
		if retainedOrder != order {
			t.Fatalf("failed append changed ordinal %d to %d", order, retainedOrder)
		}
	})
}
