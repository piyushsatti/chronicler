//go:build integration

package document

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type summaryAuthoringQueryCounter struct {
	dbgen.DBTX
	queries int
}

func (c *summaryAuthoringQueryCounter) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	c.queries++
	return c.DBTX.Query(ctx, sql, args...)
}

func (c *summaryAuthoringQueryCounter) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	c.queries++
	return c.DBTX.QueryRow(ctx, sql, args...)
}

func TestSummaryAuthoringUsesStoredLinksAndCanonicalMetadataAuthority(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	summaryID, orphanID := uuid.NewString(), uuid.NewString()
	for _, id := range []string{summaryID, orphanID} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id,version) SELECT $1::uuid,'summary',($1::uuid)::text,'Authored summary','published','public','Prose',id,1 FROM members WHERE public_id=$2`, id, frontendAuthor); err != nil {
			t.Fatal(err)
		}
	}
	chars := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	for i, id := range chars {
		owner := frontendAuthor
		if i == 1 {
			owner = frontendReader
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status) SELECT $1,$2,'Character',id,'active' FROM members WHERE public_id=$3`, id, fmt.Sprintf("ATTR%d", i), owner); err != nil {
			t.Fatal(err)
		}
	}
	quests, briefs := []string{}, []string{}
	for i := range 3 {
		questID, briefID := uuid.NewString(), uuid.NewString()
		quests, briefs = append(quests, questID), append(briefs, briefID)
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id,version) SELECT $1::uuid,'quest_brief',($1::uuid)::text,'Brief','published','public','Brief',id,1 FROM members WHERE public_id=$2`, briefID, frontendReader); err != nil {
			t.Fatal(err)
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,dm_id,document_id,scheduled_at,created_by) SELECT $1,$2,ARRAY['standard'],m.id,d.id,$3,m.id FROM members m,documents d WHERE m.public_id=$4 AND d.public_id=$5`, questID, fmt.Sprintf("ATTR%d", i), time.Date(2026, 10, 20, i, 0, 0, 0, time.UTC), frontendAuthor, briefID); err != nil {
			t.Fatal(err)
		}
		relation := "summarizes"
		if i == 2 {
			relation = "related"
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,quest_target_id,relation) SELECT d.id,q.id,$3 FROM documents d,quests q WHERE d.public_id=$1 AND q.public_id=$2`, summaryID, questID, relation); err != nil {
			t.Fatal(err)
		}
	}
	for i, relation := range []string{"subject", "manual_player"} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,character_target_id,relation) SELECT d.id,c.id,$3 FROM documents d,characters c WHERE d.public_id=$1 AND c.public_id=$2`, summaryID, chars[i], relation); err != nil {
			t.Fatal(err)
		}
	}
	for _, relation := range []string{"subject", "summarizes"} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,document_target_id,relation) SELECT source.id,target.id,$3 FROM documents source,documents target WHERE source.public_id=$1 AND target.public_id=$2`, summaryID, orphanID, relation); err != nil {
			t.Fatal(err)
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation) SELECT d.id,r.id,$3 FROM documents d,regions r WHERE d.public_id=$1 AND r.public_id=$2`, summaryID, frontendRegion, relation); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status) SELECT q.id,c.id,c.owner_id,'signed_up' FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, quests[0], chars[1]); err != nil {
		t.Fatal(err)
	}
	author, _ := resolve(ctx, frontendAuthor)
	admin, _ := resolve(ctx, frontendAdmin)
	unrelated, _ := resolve(ctx, frontendReader)
	archon, _ := resolve(ctx, frontendArchon)
	repo, _ := NewProductPostgres(fixture.Pool)
	read := func(actor auth.Authority) *SummaryDerivedView {
		t.Helper()
		values, err := repo.ReadBatchSummaryDerived(ctx, actor, []IDKey{{ID: summaryID}})
		if err != nil || len(values) != 1 || values[0].Err != nil || values[0].Value == nil {
			t.Fatalf("read=%+v err=%v", values, err)
		}
		return values[0].Value
	}
	for _, actor := range []auth.Authority{author, admin} {
		view := read(actor)
		if view.Authoring == nil || !view.Authoring.Complete || view.Authoring.CharacterId == nil || *view.Authoring.CharacterId != chars[0] || !reflect.DeepEqual(view.Authoring.QuestIds, quests[:2]) {
			t.Fatalf("actual attribution/quests=%+v", view.Authoring)
		}
		if len(view.Players) != 1 || view.Players[0].CharacterId != chars[1] {
			t.Fatalf("attribution was confused with attendance: %+v", view.Players)
		}
	}
	for _, actor := range []auth.Authority{{}, unrelated, archon} {
		if view := read(actor); view.Authoring != nil {
			t.Fatalf("reader gained authoring projection: %+v", view.Authoring)
		}
	}
	for _, size := range []int{1, 10, 50} {
		counted := &summaryAuthoringQueryCounter{DBTX: fixture.Pool}
		batched, _ := NewProductPostgres(counted)
		keys := make([]IDKey, size)
		for i := range keys {
			keys[i] = IDKey{ID: summaryID}
		}
		values, err := batched.ReadBatchSummaryDerived(ctx, author, keys)
		if err != nil || len(values) != size || counted.queries != 4 {
			t.Fatalf("batch%d queries=%d values=%d err=%v; want3 set queries+1 reader scope", size, counted.queries, len(values), err)
		}
		for _, value := range values {
			if value.Value == nil || value.Value.Authoring == nil || !value.Value.Authoring.Complete {
				t.Fatalf("batch%d lost source-bound projection", size)
			}
		}
	}
	orphan, err := repo.ReadBatchSummaryDerived(ctx, author, []IDKey{{ID: orphanID}})
	if err != nil || orphan[0].Value.Authoring == nil || orphan[0].Value.Authoring.Complete || orphan[0].Value.Authoring.QuestIds == nil || len(orphan[0].Value.Authoring.QuestIds) != 0 || orphan[0].Value.Authoring.CharacterId != nil {
		t.Fatalf("absent links must be explicit incomplete: %+v %v", orphan, err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,quest_target_id,relation) SELECT d.id,q.id,'summarizes' FROM documents d,quests q WHERE d.public_id=$1 AND q.public_id=$2`, orphanID, quests[0]); err != nil {
		t.Fatal(err)
	}
	orphan, err = repo.ReadBatchSummaryDerived(ctx, author, []IDKey{{ID: orphanID}})
	if err != nil || orphan[0].Value.Authoring == nil || !orphan[0].Value.Authoring.Complete || orphan[0].Value.Authoring.CharacterId != nil || len(orphan[0].Value.Players) != 1 {
		t.Fatalf("optional attribution inferred from attendance: %+v %v", orphan, err)
	}
	// Full Summary upsert owns subject/summarizes only; independent edges and their ordinals survive.
	ordinals := func() map[string]int64 {
		t.Helper()
		rows, err := fixture.Pool.Query(ctx, `SELECT l.target_type || ':' || l.relation || ':' || COALESCE(q.public_id,c.public_id,target.public_id,r.public_id)::text,l.summary_append_order FROM document_links l LEFT JOIN quests q ON q.id=l.quest_target_id LEFT JOIN characters c ON c.id=l.character_target_id LEFT JOIN documents target ON target.id=l.document_target_id LEFT JOIN regions r ON r.id=l.region_target_id WHERE l.source_id=(SELECT id FROM documents WHERE public_id=$1) ORDER BY l.summary_append_order`, summaryID)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]int64{}
		for rows.Next() {
			var key string
			var ordinal int64
			if err := rows.Scan(&key, &ordinal); err != nil {
				t.Fatal(err)
			}
			out[key] = ordinal
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return out
	}
	initial := ordinals()
	for range 2 {
		var version int32
		if err := fixture.Pool.QueryRow(ctx, `SELECT version FROM documents WHERE public_id=$1`, summaryID).Scan(&version); err != nil {
			t.Fatal(err)
		}
		tx, err := fixture.Pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		writer, _ := NewProductPostgres(tx)
		_, err = writer.WriteSummary(ctx, author, SummaryWrite{DocumentID: &summaryID, ExpectedRevision: &version, QuestIDs: []string{quests[1], quests[0]}, CharacterID: &chars[0], Title: "Authored summary", Body: "Edited prose", Visibility: "public", Frontmatter: json.RawMessage(`{}`), At: time.Now().UTC()})
		if err != nil {
			_ = tx.Rollback(ctx)
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		if got := ordinals(); !reflect.DeepEqual(initial, got) {
			t.Fatalf("upsert changed independent links/append order: %v -> %v", initial, got)
		}
	}
	var version int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT version FROM documents WHERE public_id=$1`, summaryID).Scan(&version); err != nil {
		t.Fatal(err)
	}
	title := "Metadata-only save"
	spec := EditPublishedDocumentSpec{Id: summaryID, Input: DocumentEditFields{ExpectedRevision: version, Title: product.Optional[string]{Set: true, Value: &title}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	for range 2 {
		if _, err := commands.EditPublishedDocument(ctx, author, spec, meta); err != nil {
			t.Fatal(err)
		}
	}
	if got := ordinals(); !reflect.DeepEqual(initial, got) {
		t.Fatalf("metadata save/replay changed links: %v -> %v", initial, got)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy='[]'::jsonb WHERE public_id=$1`, briefs[0]); err != nil {
		t.Fatal(err)
	}
	if view := read(author); view.Authoring == nil || view.Authoring.Complete || !reflect.DeepEqual(view.Authoring.QuestIds, quests[:2]) {
		t.Fatalf("hidden brief not marked incomplete: %+v", view.Authoring)
	}
	if view := read(admin); view.Authoring == nil || !view.Authoring.Complete {
		t.Fatalf("canonical admin brief source access lost: %+v", view.Authoring)
	}
	if err := fixture.Pool.QueryRow(ctx, `SELECT version FROM documents WHERE public_id=$1`, summaryID).Scan(&version); err != nil {
		t.Fatal(err)
	}
	spec.Input.ExpectedRevision = version
	body := "Prose saved with incomplete relationships"
	spec.Input.Body = product.Optional[string]{Set: true, Value: &body}
	if _, err := commands.EditPublishedDocument(ctx, author, spec, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatalf("separately permitted body/metadata save failed: %v", err)
	}
	if got := ordinals(); !reflect.DeepEqual(initial, got) {
		t.Fatalf("incomplete-authoring body save changed links: %v -> %v", initial, got)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE quests SET deleted_at=now() WHERE public_id=$1`, quests[1]); err != nil {
		t.Fatal(err)
	}
	if view := read(author); view.Authoring == nil || view.Authoring.Complete || !reflect.DeepEqual(view.Authoring.QuestIds, quests[:1]) {
		t.Fatalf("deleted Quest association not explicit: %+v", view.Authoring)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy=NULL WHERE public_id=$1`, briefs[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE quests SET deleted_at=NULL WHERE public_id=$1`, quests[1]); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,character_target_id,relation) SELECT d.id,c.id,'subject' FROM documents d,characters c WHERE d.public_id=$1 AND c.public_id=$2`, summaryID, chars[2]); err != nil {
		t.Fatal(err)
	}
	if view := read(author); view.Authoring == nil || view.Authoring.Complete || view.Authoring.CharacterId != nil {
		t.Fatalf("ambiguous Character attribution guessed: %+v", view.Authoring)
	}
	if _, err := fixture.Pool.Exec(ctx, `DELETE FROM document_links WHERE source_id=(SELECT id FROM documents WHERE public_id=$1) AND character_target_id=(SELECT id FROM characters WHERE public_id=$2) AND relation='subject'`, summaryID, chars[2]); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE characters SET deleted_at=now() WHERE public_id=$1`, chars[0]); err != nil {
		t.Fatal(err)
	}
	if view := read(author); view.Authoring == nil || view.Authoring.Complete || view.Authoring.CharacterId != nil {
		t.Fatalf("deleted Character attribution not explicit: %+v", view.Authoring)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE characters SET deleted_at=NULL WHERE public_id=$1`, chars[0]); err != nil {
		t.Fatal(err)
	}
	if view := read(author); view.Authoring == nil || !view.Authoring.Complete || view.Authoring.CharacterId == nil || *view.Authoring.CharacterId != chars[0] {
		t.Fatalf("independent typed subjects blocked complete Character attribution: %+v", view.Authoring)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET author_id=(SELECT id FROM members WHERE public_id=$2) WHERE public_id=$1`, summaryID, frontendReader); err != nil {
		t.Fatal(err)
	}
	if view := read(author); view.Authoring != nil {
		t.Fatalf("changed ownership retained authoring authority: %+v", view.Authoring)
	}
}
