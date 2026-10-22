//go:build integration

package document

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestDocumentBodyBoundaryRejectsWithoutPersistedEffects(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	actor, _ := resolve(ctx, frontendAuthor)
	category, oversized := "Lore", strings.Repeat("a", 128*1024+1)
	_, err := commands.CreateDocument(ctx, actor, CreateDocumentSpec{Input: DocumentDraftFields{Kind: "codex_entry", Category: &category, Title: "Too large", Body: oversized, Visibility: "public", Frontmatter: json.RawMessage(`{}`)}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	frontendErrorCode(t, err, apierr.Invalid)
	repo, _ := NewProductPostgres(fixture.Pool)
	_, err = repo.CreateBrief(ctx, actor, BriefCreate{QuestID: uuid.NewString(), DMID: frontendAuthor, Title: "Too large brief", Body: oversized, At: time.Now().UTC()})
	frontendErrorCode(t, err, apierr.Invalid)
	summaryID := uuid.NewString()
	for _, documentID := range []*string{nil, &summaryID} {
		version := int32(1)
		_, err = repo.WriteSummary(ctx, actor, SummaryWrite{DocumentID: documentID, ExpectedRevision: &version, QuestIDs: []string{uuid.NewString()}, Title: "Too large summary", Body: oversized, Visibility: "public", At: time.Now().UTC()})
		frontendErrorCode(t, err, apierr.Invalid)
	}
	_, err = frontendDocumentQueries(t, fixture).PreviewBody(ctx, actor, PreviewBodySpec{Body: oversized, Audience: PreviewAudiencePlayer})
	frontendErrorCode(t, err, apierr.Invalid)
	var empty bool
	if err := fixture.Pool.QueryRow(ctx, `SELECT NOT EXISTS(SELECT FROM documents) AND NOT EXISTS(SELECT FROM document_revisions) AND NOT EXISTS(SELECT FROM notifications) AND NOT EXISTS(SELECT FROM idempotency_keys)`).Scan(&empty); err != nil || !empty {
		t.Fatalf("rejected creates retained effects: %v %v", empty, err)
	}
	for _, status := range []string{"draft", "published"} {
		id := uuid.NewString()
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry',$2,'Existing','Lore',$3,'public','Original',id,1 FROM members WHERE public_id=$4`, id, uuid.NewString(), status, frontendAuthor); err != nil {
			t.Fatal(err)
		}
		input := DocumentEditFields{ExpectedRevision: 1, Body: product.Optional[string]{Set: true, Value: &oversized}}
		if status == "draft" {
			_, err = commands.UpdateDocument(ctx, actor, UpdateDocumentSpec{Id: id, Input: input}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		} else {
			_, err = commands.EditPublishedDocument(ctx, actor, EditPublishedDocumentSpec{Id: id, Input: input}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		}
		frontendErrorCode(t, err, apierr.Invalid)
		var unchanged bool
		if err := fixture.Pool.QueryRow(ctx, `SELECT body='Original' AND version=1 AND NOT EXISTS(SELECT FROM document_revisions) AND NOT EXISTS(SELECT FROM notifications) AND NOT EXISTS(SELECT FROM idempotency_keys) FROM documents WHERE public_id=$1`, id).Scan(&unchanged); err != nil || !unchanged {
			t.Fatalf("rejected %s edit retained effects: %v %v", status, unchanged, err)
		}
	}
	briefID := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id,version) SELECT $1,'quest_brief',$2,'Existing brief','published','public','Original',id,1 FROM members WHERE public_id=$3`, briefID, uuid.NewString(), frontendAuthor); err != nil {
		t.Fatal(err)
	}
	_, err = repo.EditBrief(ctx, actor, BriefEdit{DocumentID: briefID, ExpectedVersion: 1, Body: product.Optional[string]{Set: true, Value: &oversized}, At: time.Now().UTC()})
	frontendErrorCode(t, err, apierr.Invalid)
	var unchanged bool
	if err := fixture.Pool.QueryRow(ctx, `SELECT body='Original' AND version=1 AND NOT EXISTS(SELECT FROM document_revisions) AND NOT EXISTS(SELECT FROM notifications) AND NOT EXISTS(SELECT FROM idempotency_keys) FROM documents WHERE public_id=$1`, briefID).Scan(&unchanged); err != nil || !unchanged {
		t.Fatalf("rejected brief edit retained effects: %v %v", unchanged, err)
	}
}

func TestDocumentBodyBoundaryPreservesImportedBodyWhenOmitted(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	actor, _ := resolve(ctx, frontendAuthor)
	large := strings.Repeat("界", 128*1024/3+1)
	for _, status := range []string{"draft", "published"} {
		id := uuid.NewString()
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry',$2,'Imported','Lore',$3,'public',$4,id,1 FROM members WHERE public_id=$5`, id, uuid.NewString(), status, large, frontendAuthor); err != nil {
			t.Fatal(err)
		}
		title := "Metadata saved"
		input := DocumentEditFields{ExpectedRevision: 1, Title: product.Optional[string]{Set: true, Value: &title}}
		var err error
		if status == "draft" {
			_, err = commands.UpdateDocument(ctx, actor, UpdateDocumentSpec{Id: id, Input: input}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		} else {
			_, err = commands.EditPublishedDocument(ctx, actor, EditPublishedDocumentSpec{Id: id, Input: input}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		}
		if err != nil {
			t.Fatalf("metadata-only %s edit rejected: %v", status, err)
		}
		var unchanged bool
		if err := fixture.Pool.QueryRow(ctx, `SELECT body=$2 AND version=2 AND title='Metadata saved' AND (SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id AND r.body=$2)=1 FROM documents d WHERE public_id=$1`, id, large).Scan(&unchanged); err != nil || !unchanged {
			t.Fatalf("imported %s body changed: %v %v", status, unchanged, err)
		}
	}
	boundary := strings.Repeat("界", 128*1024/3) + strings.Repeat("a", 128*1024%3)
	category := "Lore"
	created, err := commands.CreateDocument(ctx, actor, CreateDocumentSpec{Input: DocumentDraftFields{Kind: "codex_entry", Category: &category, Title: "Exact boundary", Body: boundary, Visibility: "public", Frontmatter: json.RawMessage(`{}`)}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || created.EffectiveBody == nil || *created.EffectiveBody != boundary {
		t.Fatalf("exact UTF-8 byte boundary did not roundtrip: %v", err)
	}
}
