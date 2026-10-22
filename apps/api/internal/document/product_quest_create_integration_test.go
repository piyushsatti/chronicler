//go:build integration

package document

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
)

func TestQuestDelegatedBriefPublishesBeforeProjectedReadback(t *testing.T) {
	fixture, ctx, _, resolve := frontendDocumentFixture(t)
	target := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1::uuid,$1::text,'target-dm','Target DM',ARRAY['dm'],'active');`, target); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, target); err != nil {
		t.Fatal(err)
	}
	actor, _ := resolve(ctx, frontendAuthor)
	body := "Public\n> [!dm:@target-dm]\n> DELEGATED-SECRET"
	tx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck
	writer, _ := NewProductPostgres(tx)
	result, err := writer.CreateBrief(ctx, actor, BriefCreate{QuestID: uuid.NewString(), DMID: target, Title: "Delegated Quest", Body: body, At: time.Now().UTC()})
	if err != nil {
		t.Fatal(err)
	}
	view := result.Document
	if view.Status != "published" || view.AuthorId != target || view.Version != 2 || view.EffectiveBody == nil || strings.Contains(*view.EffectiveBody, "DELEGATED-SECRET") || view.BodyComplete || view.CanEditBody {
		t.Fatalf("delegated projection=%+v", view)
	}
	if len(result.Events) != 1 || result.Events[0].Kind != notification.DocumentPublished || result.Events[0].ActorID != frontendAuthor || result.Events[0].Facts.RevisionID == nil {
		t.Fatalf("publish event=%+v", result.Events)
	}
	var revisions, actors int
	var publication, publisher, storedBody string
	if err := tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id),
		(SELECT count(*) FROM document_revisions r JOIN members m ON m.id=r.created_by WHERE r.document_id=d.id AND m.public_id=$2),
		(SELECT r.public_id::text FROM document_revisions r WHERE r.document_id=d.id AND r.reason='published'),
		m.public_id::text,d.body FROM documents d JOIN members m ON m.id=d.published_by WHERE d.public_id=$1`, view.Id, frontendAuthor).Scan(&revisions, &actors, &publication, &publisher, &storedBody); err != nil {
		t.Fatal(err)
	}
	if revisions != 2 || actors != 2 || publication != *result.Events[0].Facts.RevisionID || publisher != frontendAuthor || storedBody != body {
		t.Fatal("delegated insert/publication lost actor, author, revision or raw body provenance")
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	targetActor, _ := resolve(ctx, target)
	reader, _ := NewProductPostgres(fixture.Pool)
	full, err := reader.ReadDocumentById(ctx, targetActor, DocumentByIdSpec{Id: view.Id})
	if err != nil || full.EffectiveBody == nil || *full.EffectiveBody != body || !full.BodyComplete {
		t.Fatalf("target author readback=%+v err=%v", full, err)
	}
}

func TestQuestBriefPublishFailureRollsBackInsertedDraftAndRevision(t *testing.T) {
	fixture, ctx, _, resolve := frontendDocumentFixture(t)
	actor, _ := resolve(ctx, frontendAuthor)
	if _, err := fixture.Pool.Exec(ctx, `CREATE FUNCTION reject_quest_publication() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.status='published' THEN RAISE EXCEPTION 'publication failure';END IF;RETURN NEW;END$$;CREATE TRIGGER reject_quest_publication BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION reject_quest_publication()`); err != nil {
		t.Fatal(err)
	}
	tx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	writer, _ := NewProductPostgres(tx)
	if _, err := writer.CreateBrief(ctx, actor, BriefCreate{QuestID: uuid.NewString(), DMID: frontendAuthor, Title: "Never published", Body: "Tentative", At: time.Now().UTC()}); err == nil {
		t.Fatal("publication failure ignored")
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var documents, revisions int
	if err := fixture.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM documents),(SELECT count(*) FROM document_revisions)`).Scan(&documents, &revisions); err != nil {
		t.Fatal(err)
	}
	if documents != 0 || revisions != 0 {
		t.Fatalf("failed publication left documents=%d revisions=%d", documents, revisions)
	}
}
