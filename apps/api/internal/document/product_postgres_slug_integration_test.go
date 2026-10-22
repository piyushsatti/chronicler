//go:build integration

package document

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestStoreCreateDocumentKeepsCodexSlugOffEditorRoute(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	const authorID = "10000000-0000-4000-8000-000000000001"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status)
		VALUES($1,'slug-author','slug-author','Slug Author',ARRAY['player'],'active')`, authorID); err != nil {
		t.Fatal(err)
	}
	reader, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, kind, title, slug string
	}{
		{name: "reserved Codex title", kind: "codex_entry", title: "New", slug: "new-entry"},
		{name: "normalized duplicate", kind: "codex_entry", title: " NEW! ", slug: "new-entry-2"},
		{name: "other kind unchanged", kind: "community", title: "New", slug: "new"},
		{name: "ordinary Codex title unchanged", kind: "codex_entry", title: "New Horizon", slug: "new-horizon"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tx, err := fixture.Pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			writer, err := NewProductPostgres(tx)
			if err != nil {
				t.Fatal(err)
			}
			category := "Lore"
			input := CreateDocumentSpec{Input: DocumentDraftFields{
				Kind: tc.kind, Title: tc.title, Body: "A reader-reachable document.",
				Category: &category, Visibility: "public",
			}}
			id, revisionID := uuid.NewString(), uuid.NewString()
			at := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
			created, err := writer.StoreCreateDocument(ctx, CreateDocumentWrite{
				ActorID: authorID, At: at, Input: input, ValidatedInput: input,
				Locked: CreateDocumentState{SubjectID: id}, RevisionID: &revisionID,
			})
			if err != nil {
				t.Fatal(err)
			}
			if created.Id != id || created.Slug != tc.slug || created.Title != tc.title || created.Kind != tc.kind || created.Version != 1 || created.Status != "draft" {
				t.Fatalf("created document=%+v, want id=%s slug=%s title=%q kind=%s draft version 1", created, id, tc.slug, tc.title, tc.kind)
			}
			var slug, title, kind, revisionTitle, revisionBody, reason string
			var version, revision int32
			if err := tx.QueryRow(ctx, `SELECT d.slug,d.title,d.kind,d.version,r.rev,r.title,r.body,r.reason
				FROM documents d JOIN document_revisions r ON r.document_id=d.id WHERE d.public_id=$1`, id).
				Scan(&slug, &title, &kind, &version, &revision, &revisionTitle, &revisionBody, &reason); err != nil {
				t.Fatal(err)
			}
			if slug != tc.slug || title != tc.title || kind != tc.kind || version != 1 || revision != 1 || revisionTitle != tc.title || revisionBody != input.Input.Body || reason != "created" {
				t.Fatalf("persisted document/revision=%q %q %q %d / %d %q %q %q", slug, title, kind, version, revision, revisionTitle, revisionBody, reason)
			}
			publish := PublishDocumentSpec{Id: id, ExpectedRevision: created.Version}
			locked, err := writer.LockPublishDocument(ctx, publish)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := writer.StorePublishDocument(ctx, PublishDocumentWrite{
				ActorID: authorID, At: at.Add(time.Second), Input: publish, ValidatedInput: publish, Locked: locked,
			}); err != nil {
				t.Fatal(err)
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			if tc.kind == "codex_entry" {
				entry, err := reader.ReadCodexEntry(ctx, auth.Authority{}, CodexEntrySpec{Slug: created.Slug})
				if err != nil {
					t.Fatal(err)
				}
				if entry == nil || entry.Document.Id != id || entry.Document.Title != tc.title || entry.Document.EffectiveBody == nil || *entry.Document.EffectiveBody != input.Input.Body {
					t.Fatalf("canonical reader=%+v, want persisted %s and its body", entry, id)
				}
			}
		})
	}
}
