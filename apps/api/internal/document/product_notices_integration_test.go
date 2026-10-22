//go:build integration

package document

import (
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestDocumentNoticesCommitProofReplayAndAudienceSuppression(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	actor, _ := resolve(ctx, frontendAuthor)
	category := "Lore"
	created, err := commands.CreateDocument(ctx, actor, CreateDocumentSpec{Input: DocumentDraftFields{
		Kind: "codex_entry", Category: &category, Title: "Notice source", Body: "Original", Visibility: "public", Frontmatter: json.RawMessage(`{}`),
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	published, err := commands.PublishDocument(ctx, actor, PublishDocumentSpec{Id: created.Id, ExpectedRevision: created.Version}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	body := "Public\n> [!dm:@reader]\n> PROTECTED-MENTION\n\n> [!dm:@reader]\n> Repeated\n\n> [!dm:@author]\n> Self"
	spec := EditPublishedDocumentSpec{Id: published.Id, Input: DocumentEditFields{ExpectedRevision: published.Version, Body: product.Optional[string]{Set: true, Value: &body}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	edited, err := commands.EditPublishedDocument(ctx, actor, spec, meta)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	var revisionID, envelope string
	if err := fixture.Pool.QueryRow(ctx, `SELECT r.public_id::text,r.new_value->'newMentionMemberIds' FROM document_revisions r JOIN documents d ON d.id=r.document_id WHERE d.public_id=$1 ORDER BY r.rev DESC LIMIT 1`, created.Id).Scan(&revisionID, &ids); err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0] != frontendReader {
		t.Fatalf("immutable recipients=%v", ids)
	}
	if err := fixture.Pool.QueryRow(ctx, `SELECT body FROM notifications`).Scan(&envelope); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(envelope, revisionID) || strings.Contains(envelope, "PROTECTED-MENTION") || strings.Contains(envelope, "Notice source") {
		t.Fatalf("envelope lost revision or copied prose")
	}
	if replayed, err := commands.EditPublishedDocument(ctx, actor, spec, meta); err != nil || replayed.Version != edited.Version {
		t.Fatalf("replay=%+v err=%v", replayed, err)
	}
	var count int
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM notifications`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("notifications=%d err=%v", count, err)
	}
	notices, _ := notification.NewProductPostgres(fixture.Pool)
	documents, _ := NewProductPostgres(fixture.Pool)
	policy, _ := auth.NewPoolPolicy(fixture.Pool)
	observer, _ := auth.NewSafeOverrideObserver(slog.Default())
	cursor, _ := notification.NewCursorCodec([]byte("document-notification-fixture-key"))
	queries, err := notification.NewProductQueries(notification.ProductReadRepos{Notification: notices, Batch: notices, DocumentAudience: documents}, policy, time.Now, observer, cursor)
	if err != nil {
		t.Fatal(err)
	}
	reader, _ := resolve(ctx, frontendReader)
	page, err := queries.MyNotifications(ctx, reader, notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(page.Items) != 1 || page.Items[0].Kind != string(notification.DMMentioned) {
		t.Fatalf("proven notification=%+v err=%v", page, err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy='[]'::jsonb WHERE public_id=$1`, created.Id); err != nil {
		t.Fatal(err)
	}
	page, err = queries.MyNotifications(ctx, reader, notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("current hidden subject=%+v err=%v", page, err)
	}
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE read_at IS NULL`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("suppressed row acknowledged: %d %v", count, err)
	}
	history, err := documents.ReadDocumentRevisions(ctx, actor, DocumentRevisionsSpec{DocumentId: created.Id, Limit: 50})
	publicJSON, _ := json.Marshal(history)
	if err != nil || strings.Contains(string(publicJSON), "newMentionMemberIds") || strings.Contains(string(publicJSON), frontendReader) {
		t.Fatalf("private provenance exposed in public history: %v", err)
	}
}

func TestDocumentNoticeInsertFailureRollsBackDocumentRevisionAndClaim(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	id := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry','notice-failure','Before','Lore','published','public','Before',id,1 FROM members WHERE public_id=$2`, id, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `CREATE FUNCTION reject_document_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected inbox failure'; END$$; CREATE TRIGGER reject_document_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_document_notice()`); err != nil {
		t.Fatal(err)
	}
	actor, _ := resolve(ctx, frontendAuthor)
	body := "> [!dm:@reader]\n> Tentative"
	key := uuid.NewString()
	_, err := commands.EditPublishedDocument(ctx, actor, EditPublishedDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 1, Body: product.Optional[string]{Set: true, Value: &body}}}, product.CommandMeta{IdempotencyKey: key})
	if err == nil {
		t.Fatal("inbox failure was ignored")
	}
	var stored string
	var version, revisions, notifications, claims int
	if err := fixture.Pool.QueryRow(ctx, `SELECT d.body,d.version,(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id),(SELECT count(*) FROM notifications),(SELECT count(*) FROM idempotency_keys) FROM documents d WHERE d.public_id=$1`, id).Scan(&stored, &version, &revisions, &notifications, &claims); err != nil {
		t.Fatal(err)
	}
	if stored != "Before" || version != 1 || revisions != 0 || notifications != 0 || claims != 0 {
		t.Fatalf("failed notice committed state: %q %d %d %d %d", stored, version, revisions, notifications, claims)
	}
}

func TestDelegatedDocumentEditNotifiesStoredAuthor(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	id := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry','delegated-notice','Location','Locations','published','public','Exact body',id,1 FROM members WHERE public_id=$2`, id, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation) SELECT d.id,r.id,'located_in' FROM documents d,regions r WHERE d.public_id=$1 AND r.public_id=$2`, id, frontendRegion); err != nil {
		t.Fatal(err)
	}
	archon, _ := resolve(ctx, frontendArchon)
	title := "Edited location"
	if _, err := commands.EditPublishedDocument(ctx, archon, EditPublishedDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 1, Title: product.Optional[string]{Set: true, Value: &title}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	notices, _ := notification.NewProductPostgres(fixture.Pool)
	author, _ := resolve(ctx, frontendAuthor)
	page, err := notices.ReadMyNotifications(ctx, author, notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(page.Items) != 1 || page.Items[0].Kind != string(notification.DocumentEdited) || page.Items[0].SubjectId != id {
		t.Fatalf("stored author notice=%+v err=%v", page, err)
	}
	page, err = notices.ReadMyNotifications(ctx, archon, notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("acting archon received author notice=%+v err=%v", page, err)
	}
}

func TestCodexDirectoryMalformedPoliciesKeepAuthorAdminAccessAndOrdinaryDenial(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	author, _ := resolve(ctx, frontendAuthor)
	admin, _ := resolve(ctx, frontendAdmin)
	reader, _ := resolve(ctx, frontendReader)
	repo, _ := NewProductPostgres(fixture.Pool)
	for i, policy := range []string{`{}`, `["role:player",false]`} {
		id := uuid.NewString()
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,policy,author_id,version) SELECT $1,'codex_entry',$2,'Malformed','Lore','published','public','Exact raw',$3,id,1 FROM members WHERE public_id=$4`, id, uuid.NewString(), policy, frontendAuthor); err != nil {
			t.Fatal(err)
		}
		for _, actor := range []auth.Authority{author, admin} {
			list, err := repo.ReadCodexDirectory(ctx, actor, CodexDirectorySpec{Limit: 50})
			if err != nil || len(list.Items) != i+1 {
				t.Fatalf("canonical source reader=%s items=%d err=%v", actor.Claims().MemberID, len(list.Items), err)
			}
			view, err := repo.ReadDocumentById(ctx, actor, DocumentByIdSpec{Id: id})
			if err != nil || view.Policy == nil || len(view.Policy) != 0 || !view.CanEditBody || *view.EffectiveBody != "Exact raw" {
				t.Fatalf("malformed-policy view=%+v err=%v", view, err)
			}
		}
		_, err := repo.ReadDocumentById(ctx, reader, DocumentByIdSpec{Id: id})
		frontendErrorCode(t, err, apierr.Forbidden)
		title := "Changed title"
		spec := EditPublishedDocumentSpec{Id: id, Input: DocumentEditFields{ExpectedRevision: 1, Title: product.Optional[string]{Set: true, Value: &title}}}
		meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		if _, err := commands.EditPublishedDocument(ctx, author, spec, meta); err != nil {
			t.Fatal(err)
		}
		if _, err := commands.EditPublishedDocument(ctx, author, spec, meta); err != nil {
			t.Fatal(err)
		}
		var unchanged bool
		if err := fixture.Pool.QueryRow(ctx, `SELECT policy=$2::jsonb AND body='Exact raw' FROM documents WHERE public_id=$1`, id, policy).Scan(&unchanged); err != nil || !unchanged {
			t.Fatalf("omitted malformed policy/body changed: %v %v", unchanged, err)
		}
	}
}

func TestDocumentAudienceOmissionNullEmptyAndStaleRollback(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	id := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,policy,author_id,version) SELECT $1,'codex_entry','policy-patch','Policy patch','Lore','published','public','Exact raw','{}',id,1 FROM members WHERE public_id=$2`, id, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	author, _ := resolve(ctx, frontendAuthor)
	reader, _ := resolve(ctx, frontendReader)
	repo, _ := NewProductPostgres(fixture.Pool)
	empty, named := []string{}, []string{"member:" + frontendReader}
	version := int32(1)
	for _, item := range []struct {
		name    string
		policy  product.Optional[[]string]
		want    string
		allowed bool
	}{
		{"omitted", product.Optional[[]string]{}, `{}`, false},
		{"null", product.Optional[[]string]{Set: true}, "NULL", true},
		{"empty", product.Optional[[]string]{Set: true, Value: &empty}, `[]`, false},
		{"named", product.Optional[[]string]{Set: true, Value: &named}, `["member:` + frontendReader + `"]`, true},
	} {
		spec := SetDocumentVisibilitySpec{Id: id, ExpectedRevision: version, Input: DocumentAudienceFields{Visibility: "public", Policy: item.policy, ReaderIds: []string{frontendReader}}}
		meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		view, err := commands.SetDocumentVisibility(ctx, author, spec, meta)
		if err != nil || view.Version != version+1 {
			t.Fatalf("%s view=%+v err=%v", item.name, view, err)
		}
		version = view.Version
		if _, err := commands.SetDocumentVisibility(ctx, author, spec, meta); err != nil {
			t.Fatalf("%s replay=%v", item.name, err)
		}
		var stored string
		if err := fixture.Pool.QueryRow(ctx, `SELECT COALESCE(policy::text,'NULL') FROM documents WHERE public_id=$1`, id).Scan(&stored); err != nil || stored != item.want {
			t.Fatalf("%s stored=%q want%q err=%v", item.name, stored, item.want, err)
		}
		_, err = repo.ReadDocumentById(ctx, reader, DocumentByIdSpec{Id: id})
		if item.allowed && err != nil {
			t.Fatalf("%s named read failed=%v", item.name, err)
		}
		if !item.allowed {
			frontendErrorCode(t, err, apierr.Forbidden)
		}
	}
	stale := SetDocumentVisibilitySpec{Id: id, ExpectedRevision: version - 1, Input: DocumentAudienceFields{Visibility: "restricted", Policy: product.Optional[[]string]{Set: true}}}
	_, err := commands.SetDocumentVisibility(ctx, author, stale, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	frontendErrorCode(t, err, apierr.Conflict)
	invalid := []string{"unknown:principal"}
	stale.ExpectedRevision = version
	stale.Input.Policy = product.Optional[[]string]{Set: true, Value: &invalid}
	_, err = commands.SetDocumentVisibility(ctx, author, stale, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	frontendErrorCode(t, err, apierr.Invalid)
	var unchanged bool
	if err := fixture.Pool.QueryRow(ctx, `SELECT d.version=$2 AND d.visibility='public' AND d.policy=jsonb_build_array($3::text) AND d.body='Exact raw' AND (SELECT count(*) FROM document_readers dr WHERE dr.document_id=d.id)=1 AND (SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id)=4 FROM documents d WHERE d.public_id=$1`, id, version, named[0]).Scan(&unchanged); err != nil || !unchanged {
		t.Fatalf("stale/invalid audience changed policy, grants, body, or revisions: %v %v", unchanged, err)
	}
}
