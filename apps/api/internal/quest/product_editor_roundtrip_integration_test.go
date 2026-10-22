//go:build integration

package quest

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func questStorageSnapshot(t *testing.T, f questCloseFixture) string {
	t.Helper()
	var state string
	err := f.fixture.Pool.QueryRow(context.Background(), `SELECT jsonb_build_object(
		'quests',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM quests v),
		'documents',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM documents v),
		'revisions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM document_revisions v),
		'links',(SELECT jsonb_agg(to_jsonb(v) ORDER BY to_jsonb(v)::text) FROM document_links v),
		'participants',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.character_id) FROM quest_participants v),
		'jobs',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM background_jobs v),
		'notices',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM notifications v),
		'receipts',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.key) FROM idempotency_keys v))::text`).Scan(&state)
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func editorQuestInput() CreateQuestSpec {
	signup, info := "open", "Initial additional info"
	return CreateQuestSpec{Input: CreateQuestFields{Title: "Editor roundtrip", BriefBody: "Initial brief", ScheduledAt: time.Date(2030, 1, 15, 18, 0, 0, 0, time.UTC), DurationHours: 3, SlotsMax: 4, Kinds: []string{"standard"}, SignupType: &signup, AdditionalInfo: &info}}
}

func TestFrontendQuestEditorCreateReadSyncUpdateRoundtrip(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	created, err := f.commands.CreateQuest(ctx, f.actor, editorQuestInput(), product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	if created.DocumentId == nil || created.SignupType == nil || *created.SignupType != "open" {
		t.Fatalf("created=%+v", created)
	}
	reader, _ := NewProductPostgres(f.fixture.Pool)
	participants, err := reader.ReadBatchParticipants(ctx, f.actor, []ParticipantsKey{{ParentID: created.Id, Limit: 20}, {ParentID: created.Id, HasStatus: true, Status: "played", Limit: 20}, {ParentID: created.Id, Limit: 20, Offset: 100}})
	if err != nil {
		t.Fatal(err)
	}
	for _, slot := range participants {
		if slot.Err != nil || slot.Value == nil || len(slot.Value.Items) != 0 {
			t.Fatalf("empty participants=%+v", slot)
		}
	}
	regions, err := reader.ReadBatchQuestRegions(ctx, f.actor, []QuestRegionsKey{{ParentID: created.Id, Limit: 20}})
	if err != nil || len(regions) != 1 || regions[0].Err != nil || regions[0].Value == nil || len(regions[0].Value.Items) != 0 {
		t.Fatalf("empty regions=%+v err=%v", regions, err)
	}
	links, err := reader.ReadBatchQuestHexes(ctx, f.actor, []QuestHexesKey{{ParentID: created.Id, Limit: 20}})
	if err != nil || len(links) != 1 || links[0].Err != nil || links[0].Value == nil || len(links[0].Value.Items) != 0 {
		t.Fatalf("empty pointcrawl links=%+v err=%v", links, err)
	}
	mySignups, err := reader.ReadMyQuestSignups(ctx, f.actor, MyQuestSignupsSpec{Limit: 20, Offset: 100})
	if err != nil || len(mySignups.Items) != 0 {
		t.Fatalf("empty signup page=%+v err=%v", mySignups, err)
	}
	docs, _ := document.NewProductPostgres(f.fixture.Pool)
	brief, err := docs.ReadDocumentById(ctx, f.actor, document.DocumentByIdSpec{Id: *created.DocumentId})
	if err != nil || brief.EffectiveBody == nil || *brief.EffectiveBody != "Initial brief" || brief.Category != nil {
		t.Fatalf("brief=%+v err=%v", brief, err)
	}
	var fm map[string]json.RawMessage
	if err := json.Unmarshal(brief.Frontmatter, &fm); err != nil {
		t.Fatal(err)
	}
	if string(fm["additional_info"]) != `"Initial additional info"` {
		t.Fatalf("frontmatter=%s", brief.Frontmatter)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE documents SET category='Preserved category' WHERE public_id=$1`, brief.Id); err != nil {
		t.Fatal(err)
	}
	syncMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	synced, err := f.commands.SyncQuestDiscord(ctx, f.actor, SyncQuestDiscordSpec{QuestId: created.Id}, syncMeta)
	if err != nil || synced.DesiredRevision != 2 || synced.DeliveryStatus != "queued" {
		t.Fatalf("sync=%+v err=%v", synced, err)
	}
	replayed, err := f.commands.SyncQuestDiscord(ctx, f.actor, SyncQuestDiscordSpec{QuestId: created.Id}, syncMeta)
	if err != nil || replayed != synced {
		t.Fatalf("sync replay=%+v err=%v", replayed, err)
	}
	delivery, err := reader.ReadBatchDelivery(ctx, auth.Authority{}, []IDKey{{ID: created.Id}})
	if err != nil || len(delivery) != 1 || delivery[0].Value == nil || delivery[0].Value.JobId == nil || delivery[0].Value.DesiredRevision != 2 {
		t.Fatalf("delivery=%+v err=%v", delivery, err)
	}
	current, err := reader.ReadQuest(ctx, f.actor, QuestSpec{Id: &created.Id})
	if err != nil {
		t.Fatal(err)
	}
	title, body, info := "Edited Quest", "Edited brief", "Edited additional info"
	updated, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: current.UpdatedAt, Title: product.Optional[string]{Set: true, Value: &title}, BriefBody: product.Optional[string]{Set: true, Value: &body}, AdditionalInfo: product.Optional[string]{Set: true, Value: &info}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	brief, err = docs.ReadDocumentById(ctx, f.actor, document.DocumentByIdSpec{Id: *created.DocumentId})
	if err != nil || updated.DocumentId == nil || *updated.DocumentId != brief.Id || brief.Title != title || brief.EffectiveBody == nil || *brief.EffectiveBody != body || brief.Category == nil || *brief.Category != "Preserved category" || updated.ArcId != nil || updated.Apl != nil || updated.SignupType == nil || *updated.SignupType != "open" {
		t.Fatalf("update=%+v brief=%+v err=%v", updated, brief, err)
	}
	if err := json.Unmarshal(brief.Frontmatter, &fm); err != nil {
		t.Fatal(err)
	}
	if string(fm["additional_info"]) != `"Edited additional info"` {
		t.Fatalf("updated frontmatter=%s", brief.Frontmatter)
	}
	before := questStorageSnapshot(t, f)
	_, err = f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: current.UpdatedAt, BriefBody: product.Optional[string]{Set: true, Value: &body}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Conflict)
	if questStorageSnapshot(t, f) != before {
		t.Fatal("stale editor update changed storage")
	}
}

func TestFrontendQuestDelegatedCreateRequiresApprovedDM(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	other := seedQuestArcDM(t, ctx, f.fixture)
	input := editorQuestInput()
	input.Input.DmId = &other
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE dm_profiles SET status='pending' WHERE member_id=(SELECT id FROM members WHERE public_id=$1)`, other); err != nil {
		t.Fatal(err)
	}
	before := questStorageSnapshot(t, f)
	_, err := f.commands.CreateQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	if questStorageSnapshot(t, f) != before {
		t.Fatal("unapproved DM target created storage")
	}
}

func TestFrontendQuestSignupTypeRejectedBeforeAnyWrites(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	for _, value := range []string{"dm_pick", "", "OPEN", "unknown"} {
		input := editorQuestInput()
		input.Input.SignupType = &value
		before := questStorageSnapshot(t, f)
		_, err := f.commands.CreateQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		assertQuestCloseCode(t, err, apierr.Invalid)
		if questStorageSnapshot(t, f) != before {
			t.Fatal("invalid signup type changed Quest state")
		}
		_, err = f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{SignupType: product.Optional[string]{Set: true, Value: &value}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		assertQuestCloseCode(t, err, apierr.Invalid)
		if questStorageSnapshot(t, f) != before {
			t.Fatal("invalid signup type update changed state")
		}
	}
}

func TestFrontendQuestParticipantPagesRetainNullSentinels(t *testing.T) {
	f := newQuestCloseFixture(t)
	reader, _ := NewProductPostgres(f.fixture.Pool)
	pages, err := reader.ReadBatchParticipants(context.Background(), f.actor, []ParticipantsKey{
		{ParentID: f.questID, Limit: 20}, {ParentID: f.questID, Limit: 20, Offset: 100},
		{ParentID: f.questID, HasStatus: true, Status: "waitlisted", Limit: 20},
	})
	if err != nil || len(pages) != 3 {
		t.Fatalf("pages=%+v err=%v", pages, err)
	}
	for i, page := range pages {
		want := 0
		if i == 0 {
			want = 1
		}
		if page.Err != nil || page.Value == nil || len(page.Value.Items) != want {
			t.Fatalf("page %d=%+v", i, page)
		}
	}
	if pages[0].Value.Items[0].CharacterId != f.characterID {
		t.Fatalf("participant identity/count lost: %+v", pages)
	}
}

func TestFrontendQuestDocumentEventsCommitReplayAndRollback(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	other := seedQuestArcDM(t, ctx, f.fixture)
	var handle string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT handle FROM members WHERE public_id=$1`, other).Scan(&handle); err != nil {
		t.Fatal(err)
	}
	input := editorQuestInput()
	input.Input.DmId = &other
	createMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	created, err := f.commands.CreateQuest(ctx, f.actor, input, createMeta)
	if err != nil {
		t.Fatal(err)
	}
	assertQuestDocumentNotice(t, f, *created.DocumentId, other, "DOCUMENT_PUBLISHED", 1)
	if _, err := f.commands.CreateQuest(ctx, f.actor, input, createMeta); err != nil {
		t.Fatal(err)
	}
	assertQuestDocumentNotice(t, f, *created.DocumentId, other, "DOCUMENT_PUBLISHED", 1)

	// The acting DM edits their own brief; only the newly mentioned DM receives a notice.
	input = editorQuestInput()
	created, err = f.commands.CreateQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	body := "Public\n> [!dm:@" + handle + "]\n> Mention evidence"
	edit := UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: created.UpdatedAt, BriefBody: product.Optional[string]{Set: true, Value: &body}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	if _, err := f.commands.UpdateQuest(ctx, f.actor, edit, meta); err != nil {
		t.Fatal(err)
	}
	assertQuestDocumentNotice(t, f, *created.DocumentId, other, "DM_MENTIONED", 1)
	before := questStorageSnapshot(t, f)
	if _, err := f.commands.UpdateQuest(ctx, f.actor, edit, meta); err != nil {
		t.Fatal(err)
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("editor replay changed storage")
	}

	summary := f.summaryInput()
	saved, err := f.commands.UpsertQuestSummary(ctx, f.actor, summary, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	assertQuestDocumentNotice(t, f, saved.Id, other, "DM_MENTIONED", 0)
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE documents SET status='published',published_at=now() WHERE public_id=$1`, saved.Id); err != nil {
		t.Fatal(err)
	}
	summary.Input.DocumentId, summary.Input.ExpectedRevision, summary.Input.Body = &saved.Id, &saved.Version, body
	meta = product.CommandMeta{IdempotencyKey: uuid.NewString()}
	if _, err := f.commands.UpsertQuestSummary(ctx, f.actor, summary, meta); err != nil {
		t.Fatal(err)
	}
	assertQuestDocumentNotice(t, f, saved.Id, other, "DM_MENTIONED", 1)
	before = questStorageSnapshot(t, f)
	if _, err := f.commands.UpsertQuestSummary(ctx, f.actor, summary, meta); err != nil {
		t.Fatal(err)
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("summary replay changed storage")
	}

	if _, err := f.fixture.Pool.Exec(ctx, `CREATE FUNCTION reject_editor_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected inbox failure';END$$;CREATE TRIGGER reject_editor_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_editor_notice()`); err != nil {
		t.Fatal(err)
	}
	input.Input.DmId = &other
	before = questStorageSnapshot(t, f)
	if _, err := f.commands.CreateQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err == nil {
		t.Fatal("create ignored inbox failure")
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("failed create notice committed Document/Quest/revision/job/receipt")
	}
	third := seedQuestArcDM(t, ctx, f.fixture)
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT handle FROM members WHERE public_id=$1`, third).Scan(&handle); err != nil {
		t.Fatal(err)
	}
	reader, _ := NewProductPostgres(f.fixture.Pool)
	current, err := reader.ReadQuest(ctx, f.actor, QuestSpec{Id: &created.Id})
	if err != nil {
		t.Fatal(err)
	}
	body = "> [!dm:@" + handle + "]\n> Must roll back"
	edit.Input.ExpectedUpdatedAt, edit.Input.BriefBody.Value = current.UpdatedAt, &body
	before = questStorageSnapshot(t, f)
	if _, err := f.commands.UpdateQuest(ctx, f.actor, edit, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err == nil {
		t.Fatal("edit ignored inbox failure")
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("failed edit notice committed partial storage")
	}
	var summaryVersion int32
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT version FROM documents WHERE public_id=$1`, saved.Id).Scan(&summaryVersion); err != nil {
		t.Fatal(err)
	}
	summary.Input.ExpectedRevision, summary.Input.Body = &summaryVersion, body
	before = questStorageSnapshot(t, f)
	if _, err := f.commands.UpsertQuestSummary(ctx, f.actor, summary, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err == nil {
		t.Fatal("summary ignored inbox failure")
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("failed summary notice committed partial storage")
	}
}

func TestFrontendQuestCreatePublicationFailureRollsBackWholeCommand(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	if _, err := f.fixture.Pool.Exec(ctx, `CREATE FUNCTION reject_quest_publication() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.status='published' THEN RAISE EXCEPTION 'publication failure';END IF;RETURN NEW;END$$;CREATE TRIGGER reject_quest_publication BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION reject_quest_publication()`); err != nil {
		t.Fatal(err)
	}
	before := questStorageSnapshot(t, f)
	if _, err := f.commands.CreateQuest(ctx, f.actor, editorQuestInput(), product.CommandMeta{IdempotencyKey: uuid.NewString()}); err == nil {
		t.Fatal("publication failure ignored")
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("publication failure committed Document, Quest, revisions, job or receipt")
	}
}

func TestFrontendQuestEditorPreservesAndClearsNullableMetadata(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	input := editorQuestInput()
	input.Input.SignupType = nil
	created, err := f.commands.CreateQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || created.ArcId != nil || created.Apl != nil || created.SignupType != nil {
		t.Fatalf("null create=%+v err=%v", created, err)
	}
	apl, signup := int32(4), "application"
	set, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: created.UpdatedAt, Apl: product.Optional[int32]{Set: true, Value: &apl}, SignupType: product.Optional[string]{Set: true, Value: &signup}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || set.Apl == nil || *set.Apl != 4 || set.SignupType == nil || *set.SignupType != signup || set.ArcId != nil {
		t.Fatalf("set nullable=%+v err=%v", set, err)
	}
	cleared, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: set.UpdatedAt, Apl: product.Optional[int32]{Set: true}, SignupType: product.Optional[string]{Set: true}, ArcId: product.Optional[string]{Set: true}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || cleared.Apl != nil || cleared.SignupType != nil || cleared.ArcId != nil {
		t.Fatalf("clear nullable=%+v err=%v", cleared, err)
	}
}

func assertQuestDocumentNotice(t *testing.T, f questCloseFixture, documentID, recipient, kind string, want int) {
	t.Helper()
	var count int
	var envelopes []string
	if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT count(*),COALESCE(array_agg(n.body),ARRAY[]::text[]) FROM notifications n JOIN members m ON m.id=n.member_id JOIN documents d ON d.id=n.subject_id WHERE d.public_id=$1::uuid AND m.public_id=$2::uuid AND n.kind=$3`, documentID, recipient, kind).Scan(&count, &envelopes); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("document=%s kind=%s notices=%d want=%d", documentID, kind, count, want)
	}
	for _, envelope := range envelopes {
		var revision string
		if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT r.public_id::text FROM document_revisions r JOIN documents d ON d.id=r.document_id WHERE d.public_id=$1 ORDER BY r.rev DESC LIMIT 1`, documentID).Scan(&revision); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(envelope, revision) || strings.Contains(envelope, "Mention evidence") {
			t.Fatal("notice did not retain exact revision or copied authored prose")
		}
	}
}
