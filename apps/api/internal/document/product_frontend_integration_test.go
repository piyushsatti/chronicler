//go:build integration

package document

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	frontendAuthor = "10000000-0000-4000-8000-000000000001"
	frontendArchon = "10000000-0000-4000-8000-000000000002"
	frontendReader = "10000000-0000-4000-8000-000000000003"
	frontendAdmin  = "10000000-0000-4000-8000-000000000004"
	frontendRegion = "20000000-0000-4000-8000-000000000001"
)

func frontendDocumentFixture(t *testing.T) (*dbtest.ProductFixture, context.Context, *ProductCommands, auth.AuthorityResolver) {
	t.Helper()
	fixture := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	t.Cleanup(cancel)
	for _, item := range []struct {
		id, handle string
		roles      []string
	}{
		{frontendAuthor, "author", []string{"player", "dm"}},
		{frontendArchon, "archon", []string{"player", "archon"}},
		{frontendReader, "reader", []string{"player"}},
		{frontendAdmin, "admin", []string{"admin"}},
	} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1,$2,$2,$2,$3,'active')`, item.id, item.handle, item.roles); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'North','archon')`, frontendRegion); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO archon_assignments(member_id,region_id) SELECT m.id,r.id FROM members m,regions r WHERE m.public_id=$1 AND r.public_id=$2`, frontendArchon, frontendRegion); err != nil {
		t.Fatal(err)
	}
	resolve := func(ctx context.Context, id string) (auth.Authority, error) {
		row, err := dbgen.New(fixture.Pool).GetMemberAuthority(ctx, mustProductUUID(id))
		if err != nil {
			return auth.Authority{}, err
		}
		roles := make([]auth.Role, len(row.Roles))
		for i, role := range row.Roles {
			roles[i] = auth.Role(role)
		}
		return auth.NewAuthorityWithHandle(id, roles, row.Status, row.DmStatus, row.Handle)
	}
	runner := db.NewRunner(fixture.Pool, func(tx pgx.Tx) ProductCommandRepos {
		writer, _ := NewProductPostgres(tx)
		policy, _ := auth.NewPoolPolicy(tx)
		replay, _ := idempotency.NewRepository(tx)
		notice, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Document: writer})
		if err != nil {
			t.Fatal(err)
		}
		audit, _ := auth.NewOverrideRecorder(replay)
		return ProductCommandRepos{Document: writer, Policy: policy, Authority: resolve, Replay: replay, Audit: audit, Producer: notification.NewProducer(), Notice: notice, Mentions: writer}
	})
	commands, err := NewProductCommands(runner, func() time.Time { return time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC) }, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	return fixture, ctx, commands, resolve
}

func frontendErrorCode(t *testing.T, err error, want apierr.Code) {
	t.Helper()
	expected, ok := errors.AsType[*apierr.Error](err)
	if !ok || expected.Code != want {
		t.Fatalf("error=%v, want %s", err, want)
	}
}

func frontendDocumentQueries(t *testing.T, fixture *dbtest.ProductFixture) *ProductQueries {
	t.Helper()
	reader, _ := NewProductPostgres(fixture.Pool)
	policy, _ := auth.NewPoolPolicy(fixture.Pool)
	observer, _ := auth.NewSafeOverrideObserver(slog.Default())
	queries, err := NewProductQueries(ProductReadRepos{Document: reader, Batch: reader}, policy, time.Now, observer)
	if err != nil {
		t.Fatal(err)
	}
	return queries
}

func TestFrontendDocumentBodyAdmissionAndReplay(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	id := uuid.NewString()
	raw := "Visible\n> [!dm:@someone-else]\n> Protected secret\n\n> [!redacted]"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version)
		SELECT $1,'codex_entry','protected-location','Location','Locations','published','public',$2,id,1 FROM members WHERE public_id=$3`, id, raw, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation) SELECT d.id,r.id,'located_in' FROM documents d,regions r WHERE d.public_id=$1 AND r.public_id=$2`, id, frontendRegion); err != nil {
		t.Fatal(err)
	}
	reader, _ := NewProductPostgres(fixture.Pool)
	archon, _ := resolve(ctx, frontendArchon)
	ordinary, _ := resolve(ctx, frontendReader)
	admin, _ := resolve(ctx, frontendAdmin)
	for _, item := range []struct {
		actor          auth.Authority
		metadata, body bool
	}{{archon, true, false}, {ordinary, false, false}, {admin, true, true}} {
		view, err := reader.ReadDocumentById(ctx, item.actor, DocumentByIdSpec{Id: id})
		if err != nil || view.CanEditMetadata != item.metadata || view.CanEditBody != item.body {
			t.Fatalf("read=%+v err=%v", view, err)
		}
		if !item.body && strings.Contains(*view.EffectiveBody, "Protected secret") {
			t.Fatal("protected read body leaked")
		}
	}
	title := "Metadata-only edit"
	input := EditPublishedDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 1, Title: product.Optional[string]{Set: true, Value: &title}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	view, err := commands.EditPublishedDocument(ctx, archon, input, meta)
	if err != nil {
		t.Fatal(err)
	}
	if view.Title != title || view.Version != 2 || view.Category == nil || *view.Category != "Locations" || !view.CanEditMetadata || view.CanEditBody || strings.Contains(*view.EffectiveBody, "Protected secret") {
		t.Fatalf("mutation readback=%+v", view)
	}
	replay, err := commands.EditPublishedDocument(ctx, archon, input, meta)
	if err != nil || replay.Version != view.Version {
		t.Fatalf("replay=%+v err=%v", replay, err)
	}
	replacement := *view.EffectiveBody
	_, err = commands.UpdateDocument(ctx, archon, UpdateDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 2, Body: product.Optional[string]{Set: true, Value: &replacement}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	frontendErrorCode(t, err, apierr.Forbidden)
	_, err = commands.UpdateDocument(ctx, archon, UpdateDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 2, Body: product.Optional[string]{Set: true}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	frontendErrorCode(t, err, apierr.Invalid)
	var stored string
	var version, revisions int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT d.body,d.version,(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id) FROM documents d WHERE d.public_id=$1`, id).Scan(&stored, &version, &revisions); err != nil {
		t.Fatal(err)
	}
	if stored != raw || version != 2 || revisions != 1 {
		t.Fatalf("stored=%q version=%d revisions=%d", stored, version, revisions)
	}
	history, err := reader.ReadDocumentRevisions(ctx, archon, DocumentRevisionsSpec{DocumentId: id, Limit: 50})
	if err != nil || len(history.Items) != 1 || strings.Contains(history.Items[0].Body, "Protected secret") {
		t.Fatalf("history=%+v err=%v", history, err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy='["member:someone-else"]'::jsonb WHERE public_id=$1`, id); err != nil {
		t.Fatal(err)
	}
	for _, write := range []struct {
		name string
		run  func() error
	}{
		{"metadata", func() error {
			_, err := commands.EditPublishedDocument(ctx, archon, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"publish", func() error {
			_, err := commands.PublishDocument(ctx, archon, PublishDocumentSpec{Id: id, ExpectedRevision: 2}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"unpublish", func() error {
			_, err := commands.UnpublishDocument(ctx, archon, UnpublishDocumentSpec{Id: id, ExpectedRevision: 2}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"audience", func() error {
			_, err := commands.SetDocumentVisibility(ctx, archon, SetDocumentVisibilitySpec{Id: id, ExpectedRevision: 2, Input: DocumentAudienceFields{Visibility: "public"}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"delete", func() error {
			_, err := commands.DeleteDocument(ctx, archon, DeleteDocumentSpec{Id: id, ExpectedRevision: 2}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"restore", func() error {
			_, err := commands.RestoreDocument(ctx, archon, RestoreDocumentSpec{Id: id}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
	} {
		t.Run("outer disclosure before "+write.name, func(t *testing.T) { frontendErrorCode(t, write.run(), apierr.NotFound) })
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy=NULL WHERE public_id=$1`, id); err != nil {
		t.Fatal(err)
	}
	mapID, nodeID := uuid.NewString(), uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO maps(public_id,name,atlas_code,map_kind,region_id) SELECT $1,'Map','native-map','pointcrawl',id FROM regions WHERE public_id=$2`, mapID, frontendRegion); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) SELECT $1,id,'Node',1,1,now() FROM maps WHERE public_id=$2`, nodeID, mapID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_by,created_at) SELECT map.id,node.id,d.id,'location',m.id,now() FROM maps map,pointcrawl_nodes node,documents d,members m WHERE map.public_id=$1 AND node.public_id=$2 AND d.public_id=$3 AND m.public_id=$4`, mapID, nodeID, id, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `DELETE FROM document_links WHERE source_id=(SELECT id FROM documents WHERE public_id=$1) AND region_target_id IS NOT NULL`, id); err != nil {
		t.Fatal(err)
	}
	placed, err := reader.ReadDocumentById(ctx, archon, DocumentByIdSpec{Id: id})
	if err != nil || !placed.CanEditMetadata || placed.CanEditBody {
		t.Fatalf("placement-only authority=%+v err=%v", placed, err)
	}
	if _, err := commands.DeleteDocument(ctx, archon, DeleteDocumentSpec{Id: id, ExpectedRevision: placed.Version}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	queries := frontendDocumentQueries(t, fixture)
	trashHistory, err := queries.DocumentRevisions(ctx, archon, DocumentRevisionsSpec{DocumentId: id, Limit: 50})
	if err != nil || len(trashHistory.Items) != 2 || strings.Contains(trashHistory.Items[0].Body, "Protected secret") {
		t.Fatalf("assigned archon trash history=%+v err=%v", trashHistory, err)
	}
	if _, err := commands.RestoreDocument(ctx, archon, RestoreDocumentSpec{Id: id}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `DELETE FROM archon_assignments WHERE member_id=(SELECT id FROM members WHERE public_id=$1)`, frontendArchon); err != nil {
		t.Fatal(err)
	}
	_, err = commands.EditPublishedDocument(ctx, archon, input, meta)
	frontendErrorCode(t, err, apierr.Forbidden)
	after, err := reader.ReadDocumentById(ctx, archon, DocumentByIdSpec{Id: id})
	if err != nil || after.CanEditMetadata || after.CanEditBody {
		t.Fatalf("revoked capability=%+v err=%v", after, err)
	}
}

func TestFrontendDocumentLifecyclePreservesCategoryAndRevisions(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	author, _ := resolve(ctx, frontendAuthor)
	category := "Lore"
	input := CreateDocumentSpec{Input: DocumentDraftFields{Kind: "codex_entry", Category: &category, Title: "Roundtrip", Body: "Exact source\n", Visibility: "public", Frontmatter: json.RawMessage(`{"n":9007199254740993}`)}}
	view, err := commands.CreateDocument(ctx, author, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	view, err = commands.PublishDocument(ctx, author, PublishDocumentSpec{Id: view.Id, ExpectedRevision: view.Version}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || view.Category == nil || *view.Category != category || view.Status != "published" || !view.CanEditBody {
		t.Fatalf("published=%+v err=%v", view, err)
	}
	title := "Renamed"
	view, err = commands.EditPublishedDocument(ctx, author, EditPublishedDocumentSpec{Id: view.Id, Input: DocumentEditFields{ExpectedRevision: view.Version, Title: product.Optional[string]{Set: true, Value: &title}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || *view.EffectiveBody != input.Input.Body || !strings.Contains(string(view.Frontmatter), "9007199254740993") || *view.Category != category {
		t.Fatalf("edited=%+v err=%v", view, err)
	}
	_, err = commands.UpdateDocument(ctx, author, UpdateDocumentSpec{Id: view.Id, Input: DocumentEditFields{ExpectedRevision: 1, Title: product.Optional[string]{Set: true, Value: &title}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	frontendErrorCode(t, err, apierr.Conflict)
	if _, err := commands.DeleteDocument(ctx, author, DeleteDocumentSpec{Id: view.Id, ExpectedRevision: view.Version}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	queries := frontendDocumentQueries(t, fixture)
	admin, _ := resolve(ctx, frontendAdmin)
	ordinary, _ := resolve(ctx, frontendReader)
	for _, actor := range []auth.Authority{author, admin} {
		history, err := queries.DocumentRevisions(ctx, actor, DocumentRevisionsSpec{DocumentId: view.Id, Limit: 50})
		if err != nil || len(history.Items) != 4 {
			t.Fatalf("tombstone history=%+v err=%v", history, err)
		}
	}
	_, err = queries.DocumentRevisions(ctx, ordinary, DocumentRevisionsSpec{DocumentId: view.Id, Limit: 50})
	frontendErrorCode(t, err, apierr.Forbidden)
	reader, _ := NewProductPostgres(fixture.Pool)
	tombstone, err := reader.ReadDocumentById(ctx, author, DocumentByIdSpec{Id: view.Id})
	if err != nil || tombstone != nil {
		t.Fatalf("tombstone read=%+v err=%v", tombstone, err)
	}
	restored, err := commands.RestoreDocument(ctx, author, RestoreDocumentSpec{Id: view.Id}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || restored.DeletedAt != nil || restored.Status != "published" || restored.Category == nil || *restored.Category != category {
		t.Fatalf("restored=%+v err=%v", restored, err)
	}
	var count, maxRev int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*),max(rev) FROM document_revisions WHERE document_id=(SELECT id FROM documents WHERE public_id=$1)`, view.Id).Scan(&count, &maxRev); err != nil {
		t.Fatal(err)
	}
	if count != 5 || maxRev != 5 || restored.Version != 5 {
		t.Fatalf("revisions=%d max=%d document version=%d", count, maxRev, restored.Version)
	}
}

func TestFrontendDocumentRechecksProjectionAfterEditorLoad(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	archon, _ := resolve(ctx, frontendArchon)
	admin, _ := resolve(ctx, frontendAdmin)
	id := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry','projection-race','Projection','Locations','published','public','Visible source',id,1 FROM members WHERE public_id=$2`, id, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	reader, _ := NewProductPostgres(fixture.Pool)
	loaded, err := reader.ReadDocumentById(ctx, archon, DocumentByIdSpec{Id: id})
	if err != nil || !loaded.CanEditBody {
		t.Fatalf("initial editor=%+v err=%v", loaded, err)
	}
	hidden := "Visible source\n> [!dm:@another]\n> Newly protected"
	if _, err := commands.EditPublishedDocument(ctx, admin, EditPublishedDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 1, Body: product.Optional[string]{Set: true, Value: &hidden}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	replacement := "Stale editor replacement"
	_, err = commands.EditPublishedDocument(ctx, archon, EditPublishedDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: loaded.Version, Body: product.Optional[string]{Set: true, Value: &replacement}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	frontendErrorCode(t, err, apierr.Forbidden)
	current, err := reader.ReadDocumentById(ctx, admin, DocumentByIdSpec{Id: id})
	if err != nil || *current.EffectiveBody != hidden || current.Version != 2 {
		t.Fatalf("source after stale edit=%+v err=%v", current, err)
	}
}

func TestFrontendDocumentKeepsUnownedHistoricalDocumentsReadable(t *testing.T) {
	fixture, ctx, _, resolve := frontendDocumentFixture(t)
	id := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,version) VALUES($1,'codex_entry','unowned','Historical','Lore','published','public','Retained public text',1)`, id); err != nil {
		t.Fatal(err)
	}
	actor, _ := resolve(ctx, frontendReader)
	reader, _ := NewProductPostgres(fixture.Pool)
	view, err := reader.ReadDocumentById(ctx, actor, DocumentByIdSpec{Id: id})
	if err != nil || view.CanEditMetadata || view.CanEditBody || *view.EffectiveBody != "Retained public text" {
		t.Fatalf("unowned read=%+v err=%v", view, err)
	}
	page, err := reader.ReadDocuments(ctx, actor, DocumentsSpec{Limit: 50})
	if err != nil || len(page.Items) != 1 || page.Items[0].Id != id {
		t.Fatalf("unowned list=%+v err=%v", page, err)
	}
}

func TestFrontendDocumentReplayReprojectsCurrentAudience(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	id := uuid.NewString()
	raw := "Visible\n> [!dm:@archon]\n> Revocable secret"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry','replay-audience','Replay','Locations','published','public',$2,id,1 FROM members WHERE public_id=$3`, id, raw, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation) SELECT d.id,r.id,'located_in' FROM documents d,regions r WHERE d.public_id=$1 AND r.public_id=$2`, id, frontendRegion); err != nil {
		t.Fatal(err)
	}
	archon, _ := resolve(ctx, frontendArchon)
	title := "Metadata replay"
	spec := EditPublishedDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 1, Title: product.Optional[string]{Set: true, Value: &title}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	first, err := commands.EditPublishedDocument(ctx, archon, spec, meta)
	if err != nil || first.EffectiveBody == nil || !strings.Contains(*first.EffectiveBody, "Revocable secret") || !first.CanEditBody {
		t.Fatalf("initial edit=%+v err=%v", first, err)
	}
	var receiptBefore string
	var completedBefore time.Time
	if err := fixture.Pool.QueryRow(ctx, `SELECT receipt::text,completed_at FROM idempotency_keys WHERE key=$1`, meta.IdempotencyKey).Scan(&receiptBefore, &completedBefore); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE members SET handle='archon-renamed' WHERE public_id=$1`, frontendArchon); err != nil {
		t.Fatal(err)
	}
	fresh, err := resolve(ctx, frontendArchon)
	if err != nil {
		t.Fatal(err)
	}
	reader, _ := NewProductPostgres(fixture.Pool)
	current, err := reader.ReadDocumentById(ctx, fresh, DocumentByIdSpec{Id: id})
	if err != nil || !current.CanEditMetadata || current.CanEditBody || strings.Contains(*current.EffectiveBody, "Revocable secret") {
		t.Fatalf("current read=%+v err=%v", current, err)
	}
	replay, err := commands.EditPublishedDocument(ctx, archon, spec, meta)
	if err != nil || replay.EffectiveBody == nil || *replay.EffectiveBody != *current.EffectiveBody || replay.CanEditBody != current.CanEditBody || replay.CanEditMetadata != current.CanEditMetadata || replay.Version != current.Version {
		t.Fatalf("replay=%+v current=%+v err=%v", replay, current, err)
	}
	var receiptAfter string
	var completedAfter time.Time
	if err := fixture.Pool.QueryRow(ctx, `SELECT receipt::text,completed_at FROM idempotency_keys WHERE key=$1`, meta.IdempotencyKey).Scan(&receiptAfter, &completedAfter); err != nil {
		t.Fatal(err)
	}
	if receiptAfter != receiptBefore || !completedAfter.Equal(completedBefore) {
		t.Fatal("read projection changed immutable effect receipt")
	}
	var source string
	var version, revisions int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT d.body,d.version,(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id) FROM documents d WHERE d.public_id=$1`, id).Scan(&source, &version, &revisions); err != nil {
		t.Fatal(err)
	}
	if source != raw || version != 2 || revisions != 1 {
		t.Fatalf("replay repeated an effect: source=%q version=%d revisions=%d", source, version, revisions)
	}
}

func TestFrontendCommandDocumentFailsClosedWhenCurrentAudienceDenies(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	id := uuid.NewString()
	raw := "Outer protected source"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry','command-audience','Command','Locations','published','public',$2,id,1 FROM members WHERE public_id=$3`, id, raw, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation) SELECT d.id,r.id,'located_in' FROM documents d,regions r WHERE d.public_id=$1 AND r.public_id=$2`, id, frontendRegion); err != nil {
		t.Fatal(err)
	}
	archon, _ := resolve(ctx, frontendArchon)
	key := uuid.NewString()
	newPolicy := []string{"member:someone-else"}
	_, err := commands.SetDocumentVisibility(ctx, archon, SetDocumentVisibilitySpec{Id: id, ExpectedRevision: 1, Input: DocumentAudienceFields{Visibility: "public", Policy: product.Optional[[]string]{Set: true, Value: &newPolicy}}}, product.CommandMeta{IdempotencyKey: key})
	frontendErrorCode(t, err, apierr.Forbidden)
	var version, revisions, receipts int32
	var policy []byte
	if err := fixture.Pool.QueryRow(ctx, `SELECT d.version,d.policy,(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id),(SELECT count(*) FROM idempotency_keys WHERE key=$2) FROM documents d WHERE d.public_id=$1`, id, key).Scan(&version, &policy, &revisions, &receipts); err != nil {
		t.Fatal(err)
	}
	if version != 1 || policy != nil || revisions != 0 || receipts != 0 {
		t.Fatalf("denied projection committed changes: version=%d policy=%s revisions=%d receipts=%d", version, policy, revisions, receipts)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy='["member:someone-else"]'::jsonb WHERE public_id=$1`, id); err != nil {
		t.Fatal(err)
	}
	reader, _ := NewProductPostgres(fixture.Pool)
	result, err := reader.ReadCommandDocument(ctx, archon, id)
	frontendErrorCode(t, err, apierr.Forbidden)
	if result.EffectiveBody != nil || result.Id != "" || result.CanEditBody || result.CanEditMetadata {
		t.Fatalf("denied read returned command source: %+v", result)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy=NULL WHERE public_id=$1`, id); err != nil {
		t.Fatal(err)
	}
	granted, err := commands.SetDocumentVisibility(ctx, archon, SetDocumentVisibilitySpec{Id: id, ExpectedRevision: 1, Input: DocumentAudienceFields{Visibility: "restricted", ReaderIds: []string{frontendArchon}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || granted.EffectiveBody == nil || *granted.EffectiveBody != raw || granted.Version != 2 {
		t.Fatalf("final reader-grant projection=%+v err=%v", granted, err)
	}
}

func TestFrontendForeignDocumentWritersKeepBriefSourceAndSummaryOrder(t *testing.T) {
	fixture, ctx, _, resolve := frontendDocumentFixture(t)
	actor, _ := resolve(ctx, frontendAuthor)
	at := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	q1, q2 := uuid.NewString(), uuid.NewString()
	tx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	writer, _ := NewProductPostgres(tx)
	for i, questID := range []string{q1, q2} {
		extra := "Instructions"
		brief, err := writer.CreateBrief(ctx, actor, BriefCreate{QuestID: questID, DMID: frontendAuthor, Title: "Quest", Body: "Exact brief\n", AdditionalInfo: &extra, At: at})
		if err != nil || brief.Document.Status != "published" || brief.Document.Slug != "quest-"+strings.ReplaceAll(questID, "-", "") {
			t.Fatalf("brief=%+v err=%v", brief, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,dm_id,document_id,scheduled_at,created_by) SELECT $1,$2,ARRAY['standard'],m.id,d.id,$3,m.id FROM members m,documents d WHERE m.public_id=$4 AND d.public_id=$5`, questID, []string{"Q1", "Q2"}[i], at, frontendAuthor, brief.Document.Id); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `UPDATE documents SET frontmatter_yaml=$2 WHERE public_id=$1`, brief.Document.Id, `{"additional_info":"Instructions","other":9007199254740993}`); err != nil {
			t.Fatal(err)
		}
		edited, err := writer.EditBrief(ctx, actor, BriefEdit{DocumentID: brief.Document.Id, AdditionalInfo: product.Optional[string]{Set: true}, At: at})
		if err != nil || *edited.Document.EffectiveBody != "Exact brief\n" || strings.Contains(string(edited.Document.Frontmatter), "additional_info") || !strings.Contains(string(edited.Document.Frontmatter), "9007199254740993") {
			t.Fatalf("brief edit=%+v err=%v", edited, err)
		}
	}
	spec := SummaryWrite{QuestIDs: []string{q2, q1}, Title: "Session", Body: "First summary", Visibility: "public", Frontmatter: json.RawMessage(`{"n":9007199254740993}`), At: at}
	created, err := writer.WriteSummary(ctx, actor, spec)
	if err != nil || created.Document.Slug != "summary-"+strings.ReplaceAll(created.Document.Id, "-", "") {
		t.Fatalf("summary=%+v err=%v", created, err)
	}
	summaryID := created.Document.Id
	ordinals := func() map[string]int64 {
		rows, err := tx.Query(ctx, `SELECT q.public_id::text,l.summary_append_order FROM document_links l JOIN documents d ON d.id=l.source_id JOIN quests q ON q.id=l.quest_target_id WHERE d.public_id=$1`, summaryID)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]int64{}
		for rows.Next() {
			var id string
			var n int64
			if err := rows.Scan(&id, &n); err != nil {
				t.Fatal(err)
			}
			out[id] = n
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return out
	}
	initial := ordinals()
	if len(initial) != 2 {
		t.Fatalf("links=%v", initial)
	}
	spec.DocumentID = &summaryID
	_, err = writer.WriteSummary(ctx, actor, spec)
	frontendErrorCode(t, err, apierr.Invalid)
	expectedRevision := created.Document.Version
	spec.ExpectedRevision = &expectedRevision
	spec.Body = "Updated summary"
	spec.QuestIDs = []string{q1, q2}
	updated, err := writer.WriteSummary(ctx, actor, spec)
	if err != nil || *updated.Document.EffectiveBody != spec.Body || !strings.Contains(string(updated.Document.Frontmatter), "9007199254740993") {
		t.Fatalf("updated summary=%+v err=%v", updated, err)
	}
	expectedRevision = updated.Document.Version
	retained := ordinals()
	if retained[q1] != initial[q1] || retained[q2] != initial[q2] {
		t.Fatalf("retained links reordered: %v -> %v", initial, retained)
	}
	stale := spec
	staleRevision := created.Document.Version
	stale.ExpectedRevision = &staleRevision
	stale.Body = "Stale replacement"
	stale.QuestIDs = []string{q1}
	_, err = writer.WriteSummary(ctx, actor, stale)
	frontendErrorCode(t, err, apierr.Conflict)
	var bodyAfterConflict string
	var versionAfterConflict, revisionsAfterConflict int32
	if err := tx.QueryRow(ctx, `SELECT d.body,d.version,(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id) FROM documents d WHERE d.public_id=$1`, summaryID).Scan(&bodyAfterConflict, &versionAfterConflict, &revisionsAfterConflict); err != nil {
		t.Fatal(err)
	}
	if bodyAfterConflict != spec.Body || versionAfterConflict != expectedRevision || revisionsAfterConflict != 2 || len(ordinals()) != 2 {
		t.Fatalf("stale summary changed body=%q version=%d revisions=%d links=%v", bodyAfterConflict, versionAfterConflict, revisionsAfterConflict, ordinals())
	}
	spec.QuestIDs = []string{q2}
	removed, err := writer.WriteSummary(ctx, actor, spec)
	if err != nil {
		t.Fatal(err)
	}
	expectedRevision = removed.Document.Version
	spec.QuestIDs = []string{q1, q2}
	if _, err := writer.WriteSummary(ctx, actor, spec); err != nil {
		t.Fatal(err)
	}
	readded := ordinals()
	if readded[q1] <= initial[q1] || readded[q2] != initial[q2] {
		t.Fatalf("re-add order=%v initial=%v", readded, initial)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `CREATE FUNCTION reject_summary_edge() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected final link failure'; END$$; CREATE TRIGGER reject_summary_edge BEFORE INSERT ON document_links FOR EACH ROW WHEN(NEW.quest_target_id IS NOT NULL) EXECUTE FUNCTION reject_summary_edge()`); err != nil {
		t.Fatal(err)
	}
	failedTx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	failedWriter, _ := NewProductPostgres(failedTx)
	failed := SummaryWrite{QuestIDs: []string{q1}, Title: "Must roll back", Body: "Tentative", Visibility: "public", At: at}
	if _, err := failedWriter.WriteSummary(ctx, actor, failed); err == nil {
		t.Fatal("injected link failure ignored")
	}
	if err := failedTx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var residue int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM documents WHERE title='Must roll back'`).Scan(&residue); err != nil {
		t.Fatal(err)
	}
	if residue != 0 {
		t.Fatalf("failed summary left %d documents", residue)
	}
}

// Seeded and imported rows are inserted without an explicit version; the column default must give
// them the same first revision (1) that CreateDocument writes, or every edit is rejected as
// "document version required".
func TestFrontendDocumentDefaultVersionRowsAreEditable(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	// Seeded rules are maintained by admins, as on staging.
	editor, _ := resolve(ctx, frontendAdmin)
	draft, published := uuid.NewString(), uuid.NewString()
	for _, row := range [][2]string{{draft, "draft"}, {published, "published"}} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id)
			SELECT $1,'rule','seeded-'||$2::text,'Seeded '||$2::text,'Rules',$2::text,'public','Seeded body',id FROM members WHERE public_id=$3`, row[0], row[1], frontendAuthor); err != nil {
			t.Fatal(err)
		}
	}
	reader, _ := NewProductPostgres(fixture.Pool)
	title := "Edited"
	for _, item := range []struct {
		id   string
		edit func(DocumentEditFields) (DocumentView, error)
	}{
		{draft, func(input DocumentEditFields) (DocumentView, error) {
			return commands.UpdateDocument(ctx, editor, UpdateDocumentSpec{Id: draft, Input: input}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		}},
		{published, func(input DocumentEditFields) (DocumentView, error) {
			return commands.EditPublishedDocument(ctx, editor, EditPublishedDocumentSpec{Id: published, Input: input}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		}},
	} {
		loaded, err := reader.ReadDocumentById(ctx, editor, DocumentByIdSpec{Id: item.id})
		if err != nil || loaded == nil {
			t.Fatalf("seeded read=%+v err=%v", loaded, err)
		}
		view, err := item.edit(DocumentEditFields{ExpectedRevision: loaded.Version, Title: product.Optional[string]{Set: true, Value: &title}})
		if err != nil {
			t.Fatalf("edit of seeded %s at read version %d: %v", loaded.Status, loaded.Version, err)
		}
		if loaded.Version != 1 || view.Title != title || view.Version != 2 {
			t.Fatalf("seeded %s read version=%d, edited=%+v; want read 1, edited 2", loaded.Status, loaded.Version, view)
		}
	}
}
