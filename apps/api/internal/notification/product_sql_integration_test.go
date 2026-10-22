//go:build integration

package notification_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
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
	inboxMember    = "10000000-0000-4000-8000-000000000001"
	inboxOther     = "10000000-0000-4000-8000-000000000002"
	inboxActor     = "10000000-0000-4000-8000-000000000003"
	inboxCharacter = "20000000-0000-4000-8000-000000000001"
	inboxQuest     = "30000000-0000-4000-8000-000000000001"
	inboxDocument  = "40000000-0000-4000-8000-000000000001"
	inboxRevision  = "50000000-0000-4000-8000-000000000001"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		_, _ = os.Stderr.WriteString(err.Error() + "\n")
		code = 1
	}
	os.Exit(code)
}

func inboxFixture(t *testing.T) *dbtest.ProductFixture {
	t.Helper()
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	for _, id := range []string{inboxMember, inboxOther, inboxActor} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1::uuid,$1::text,$1::text,'Member',ARRAY['player'],'active')`, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id) SELECT $1,'quest_brief','notification-brief','PRIVATE TITLE','published','public','PRIVATE BODY',id FROM members WHERE public_id=$2`, inboxDocument, inboxActor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status) SELECT $1,'INBOX','Character',id,'active' FROM members WHERE public_id=$2`, inboxCharacter, inboxMember); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,dm_id,document_id,scheduled_at,created_by) SELECT $1,'INBOX',ARRAY['standard'],m.id,d.id,now()+interval '1 day',m.id FROM members m,documents d WHERE m.public_id=$2 AND d.public_id=$3`, inboxQuest, inboxActor, inboxDocument); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,member_id,character_id,status) SELECT q.id,m.id,c.id,'signed_up' FROM quests q,members m,characters c WHERE q.public_id=$1 AND m.public_id=$2 AND c.public_id=$3`, inboxQuest, inboxMember, inboxCharacter); err != nil {
		t.Fatal(err)
	}
	return f
}

func inboxAuthority(t *testing.T, id string) auth.Authority {
	t.Helper()
	a, err := auth.NewAuthority(id, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	return a
}
func stringPointer(s string) *string { return &s }
func signupEvent(at time.Time, key string) notification.Event {
	return notification.Event{Key: key, Kind: notification.QuestSignupConfirmed, SubjectType: "quest", SubjectID: inboxQuest, ActorID: inboxMember, OccurredAt: at, Facts: notification.Facts{Version: 1, EventKind: notification.QuestSignupConfirmed, CharacterID: stringPointer(inboxCharacter), ToStatus: stringPointer("signed_up")}}
}

func persistInboxEvent(t *testing.T, f *dbtest.ProductFixture, event notification.Event, key string) bool {
	t.Helper()
	ctx := context.Background()
	tx, err := f.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	replay, _ := idempotency.NewRepository(tx)
	chars, _ := character.NewProductPostgres(tx)
	notice, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Character: chars})
	if err != nil {
		t.Fatal(err)
	}
	claim, err := replay.Claim(ctx, event.ActorID, "signupForQuest", key, strings.Repeat("a", 64))
	if err != nil {
		t.Fatal(err)
	}
	if !claim.Replay {
		if err := notification.NewProducer().Record(ctx, notice, event); err != nil {
			t.Fatal(err)
		}
		if err := replay.Complete(ctx, claim, json.RawMessage(`{"Id":"unchanged-result"}`)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return claim.Replay
}

func opaqueInboxError(t *testing.T, err error) {
	t.Helper()
	var typed *apierr.Error
	if !errors.As(err, &typed) || typed.Code != apierr.Internal || typed.Message != "Internal error" {
		t.Fatalf("expected opaque INTERNAL, got %v", err)
	}
}

func TestInboxCommandProofReplayHistoricalReadAndRecipientIsolation(t *testing.T) {
	f := inboxFixture(t)
	ctx := context.Background()
	at := time.Now().UTC().Truncate(time.Microsecond)
	event := signupEvent(at, "signup-event")
	if persistInboxEvent(t, f, event, "signup-key") {
		t.Fatal("new command replayed")
	}
	if !persistInboxEvent(t, f, event, "signup-key") {
		t.Fatal("completed command did not replay")
	}
	reader, _ := notification.NewProductPostgres(f.Pool)
	page, err := reader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("inbox=%+v error=%v", page, err)
	}
	item := page.Items[0]
	if item.SubjectId != inboxQuest || item.SubjectCode == nil || *item.SubjectCode != "INBOX" || item.Title == nil || *item.Title != "Quest signup confirmed" || strings.Contains(*item.Title, "PRIVATE") || item.Summary != nil {
		t.Fatalf("public notification=%+v", item)
	}
	foreign, err := reader.ReadMyNotifications(ctx, inboxAuthority(t, inboxOther), notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(foreign.Items) != 0 {
		t.Fatalf("foreign inbox=%+v error=%v", foreign, err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE quest_participants SET status='withdrawn'`); err != nil {
		t.Fatal(err)
	}
	if page, err := reader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50}); err != nil || len(page.Items) != 1 {
		t.Fatalf("historical transition changed with roster: %+v, %v", page, err)
	}
	var original string
	if err := f.Pool.QueryRow(ctx, `SELECT body FROM notifications WHERE public_id=$1`, item.Id).Scan(&original); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE notifications SET body=jsonb_set(body::jsonb,'{event,facts,toStatus}','"waitlisted"'::jsonb)::text WHERE public_id=$1`, item.Id); err != nil {
		t.Fatal(err)
	}
	_, err = reader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	opaqueInboxError(t, err)
	var unread int
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE read_at IS NULL`).Scan(&unread); err != nil || unread != 1 {
		t.Fatalf("failed read changed inbox: %d %v", unread, err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE notifications SET body=$2 WHERE public_id=$1`, item.Id, original); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE idempotency_keys SET receipt=receipt-'_notificationProofs'`); err != nil {
		t.Fatal(err)
	}
	_, err = reader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	opaqueInboxError(t, err)
	var ledgerExists bool
	if err := f.Pool.QueryRow(ctx, `SELECT to_regclass('public.notification_events') IS NOT NULL OR to_regclass('public.notification_channel_deliveries') IS NOT NULL`).Scan(&ledgerExists); err != nil || ledgerExists {
		t.Fatalf("retired notification ledger exists: %v %v", ledgerExists, err)
	}
}

type inboxObserver struct{}

func (inboxObserver) Observe(context.Context, auth.OverrideFact) {}

func TestInboxSuppressionCursorAndAtomicAcknowledgement(t *testing.T) {
	f := inboxFixture(t)
	ctx := context.Background()
	at := time.Now().UTC().Truncate(time.Microsecond)
	persistInboxEvent(t, f, signupEvent(at, "signup"), "signup")
	revisionAt := at.Add(time.Second)
	if _, err := f.Pool.Exec(ctx, `INSERT INTO document_revisions(public_id,document_id,reason,title,body,created_by,created_at,new_value,rev) SELECT $1,d.id,'edit','PRIVATE REVISION','PRIVATE BODY',m.id,$4,'{"newMentionMemberIds":["10000000-0000-4000-8000-000000000001"]}'::jsonb,1 FROM documents d,members m WHERE d.public_id=$2 AND m.public_id=$3`, inboxRevision, inboxDocument, inboxActor, revisionAt); err != nil {
		t.Fatal(err)
	}
	event := notification.Event{Key: "mention", Kind: notification.DMMentioned, SubjectType: "document", SubjectID: inboxDocument, ActorID: inboxActor, OccurredAt: revisionAt, Facts: notification.Facts{Version: 1, EventKind: notification.DMMentioned, RevisionID: stringPointer(inboxRevision), NewMentionMemberIDs: []string{inboxMember}}}
	persistInboxEvent(t, f, event, "mention")
	publicReader, _ := notification.NewProductPostgres(f.Pool)
	publicPage, err := publicReader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(publicPage.Items) != 2 || publicPage.Items[0].SubjectCode == nil || *publicPage.Items[0].SubjectCode != "INBOX" {
		t.Fatalf("authoritative quest brief destination=%+v error=%v", publicPage, err)
	}
	ambiguousQuestID := uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,dm_id,document_id,scheduled_at,created_by) SELECT $1,'AMBIGUOUS',kinds,dm_id,document_id,scheduled_at,created_by FROM quests WHERE public_id=$2`, ambiguousQuestID, inboxQuest); err != nil {
		t.Fatal(err)
	}
	ambiguousPage, err := publicReader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(ambiguousPage.Items) != 2 || ambiguousPage.Items[0].SubjectCode != nil {
		t.Fatalf("ambiguous quest brief guessed a destination=%+v error=%v", ambiguousPage, err)
	}
	if _, err := f.Pool.Exec(ctx, `DELETE FROM quests WHERE public_id=$1`, ambiguousQuestID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE quests SET deleted_at=now()`); err != nil {
		t.Fatal(err)
	}
	orphanPage, err := publicReader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(orphanPage.Items) != 2 || orphanPage.Items[0].SubjectCode != nil {
		t.Fatalf("unavailable quest brief guessed a destination=%+v error=%v", orphanPage, err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE quests SET deleted_at=NULL`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE documents SET visibility='dm_only' WHERE public_id=$1`, inboxDocument); err != nil {
		t.Fatal(err)
	}
	reader, _ := notification.NewProductPostgres(f.Pool)
	audience, _ := document.NewProductPostgres(f.Pool)
	cursor, _ := notification.NewCursorCodec([]byte("fixture-secret"))
	policy, err := auth.NewPoolPolicy(f.Pool)
	if err != nil {
		t.Fatal(err)
	}
	queries, err := notification.NewProductQueries(notification.ProductReadRepos{Notification: reader, Batch: reader, DocumentAudience: audience}, policy, time.Now, inboxObserver{}, cursor)
	if err != nil {
		t.Fatal(err)
	}
	actor := inboxAuthority(t, inboxMember)
	first, err := queries.MyNotifications(ctx, actor, notification.MyNotificationsSpec{Limit: 1})
	if err != nil || len(first.Items) != 0 || !first.HasMore || first.NextBefore == nil {
		t.Fatalf("suppressed page=%+v error=%v", first, err)
	}
	second, err := queries.MyNotifications(ctx, actor, notification.MyNotificationsSpec{Limit: 1, Before: first.NextBefore})
	if err != nil || len(second.Items) != 1 || second.Items[0].SubjectId != inboxQuest {
		t.Fatalf("cursor did not advance: %+v %v", second, err)
	}
	var unread int
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE read_at IS NULL`).Scan(&unread); err != nil || unread != 2 {
		t.Fatalf("read mutated unread state: %d %v", unread, err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE document_revisions SET new_value='{"newMentionMemberIds":[]}'::jsonb`); err != nil {
		t.Fatal(err)
	}
	_, err = queries.MyNotifications(ctx, actor, notification.MyNotificationsSpec{Limit: 50})
	opaqueInboxError(t, err)
	if _, err := f.Pool.Exec(ctx, `UPDATE document_revisions SET new_value='{"newMentionMemberIds":["10000000-0000-4000-8000-000000000001"]}'::jsonb`); err != nil {
		t.Fatal(err)
	}
	runner := db.NewRunner(f.Pool, func(tx pgx.Tx) notification.ProductCommandRepos {
		pg, _ := notification.NewProductPostgres(tx)
		docs, _ := document.NewProductPostgres(tx)
		replay, _ := idempotency.NewRepository(tx)
		return notification.ProductCommandRepos{Notification: pg, Batch: pg, DocumentAudience: docs, Policy: policy, Replay: replay, Authority: func(context.Context, string) (auth.Authority, error) { return actor, nil }}
	})
	commands, _ := notification.NewProductCommands(runner, time.Now)
	var original string
	if err := f.Pool.QueryRow(ctx, `SELECT body FROM notifications WHERE kind='QUEST_SIGNUP_CONFIRMED'`).Scan(&original); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE notifications SET body='legacy unproven PRIVATE BODY' WHERE kind='QUEST_SIGNUP_CONFIRMED'`); err != nil {
		t.Fatal(err)
	}
	_, err = commands.AcknowledgeSuppressedNotifications(ctx, actor, notification.AcknowledgeSuppressedNotificationsSpec{Limit: 100}, product.CommandMeta{IdempotencyKey: "corrupt-ack"})
	opaqueInboxError(t, err)
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE read_at IS NULL`).Scan(&unread); err != nil || unread != 2 {
		t.Fatalf("corrupt mixed batch partially acknowledged: %d %v", unread, err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE notifications SET body=$1 WHERE kind='QUEST_SIGNUP_CONFIRMED'`, original); err != nil {
		t.Fatal(err)
	}
	meta := product.CommandMeta{IdempotencyKey: "valid-ack"}
	receipt, err := commands.AcknowledgeSuppressedNotifications(ctx, actor, notification.AcknowledgeSuppressedNotificationsSpec{Limit: 100}, meta)
	if err != nil || receipt.AffectedCount != 1 {
		t.Fatalf("ack=%+v error=%v", receipt, err)
	}
	replayed, err := commands.AcknowledgeSuppressedNotifications(ctx, actor, notification.AcknowledgeSuppressedNotificationsSpec{Limit: 100}, meta)
	if err != nil || !replayed.Replayed || replayed.AffectedCount != 1 {
		t.Fatalf("ack replay=%+v error=%v", replayed, err)
	}
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE read_at IS NULL`).Scan(&unread); err != nil || unread != 1 {
		t.Fatalf("ack changed wrong rows: %d %v", unread, err)
	}
}

func TestInboxVerificationProofPreservesOriginalVerdict(t *testing.T) {
	f := inboxFixture(t)
	ctx := context.Background()
	at := time.Now().UTC().Truncate(time.Microsecond)
	verificationID := uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO verifications(public_id,subject_type,subject_id,verdict,decided_by,created_at) SELECT $1,'character',c.id,'rejected',m.id,$4 FROM characters c,members m WHERE c.public_id=$2 AND m.public_id=$3`, verificationID, inboxCharacter, inboxActor, at); err != nil {
		t.Fatal(err)
	}
	event := notification.Event{Key: "verification", Kind: notification.CharacterVerificationDecided, SubjectType: "character", SubjectID: inboxCharacter, ActorID: inboxActor, OccurredAt: at, Facts: notification.Facts{Version: 1, EventKind: notification.CharacterVerificationDecided, VerificationID: &verificationID, CharacterID: stringPointer(inboxCharacter), Verdict: stringPointer("rejected")}}
	persistInboxEvent(t, f, event, "verification")
	reader, _ := notification.NewProductPostgres(f.Pool)
	page, err := reader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(page.Items) != 1 || page.Items[0].SubjectCode == nil || *page.Items[0].SubjectCode != "INBOX" || *page.Items[0].Title != "Character verification rejected" {
		t.Fatalf("original verdict=%+v error=%v", page, err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE verifications SET verdict='approved' WHERE public_id=$1`, verificationID); err != nil {
		t.Fatal(err)
	}
	_, err = reader.ReadMyNotifications(ctx, inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: 50})
	opaqueInboxError(t, err)
}

type countedInboxDB struct {
	dbgen.DBTX
	calls int
}

func (c *countedInboxDB) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	c.calls++
	return c.DBTX.Query(ctx, sql, args...)
}

func TestInboxProofQueriesRemainBoundedAtOneTenAndFiftyRows(t *testing.T) {
	f := inboxFixture(t)
	at := time.Now().UTC().Truncate(time.Microsecond)
	for i := 0; i < 50; i++ {
		key := uuid.NewString()
		persistInboxEvent(t, f, signupEvent(at.Add(time.Duration(i)*time.Second), key), key)
	}
	for _, size := range []int32{1, 10, 50} {
		counter := &countedInboxDB{DBTX: f.Pool}
		reader, _ := notification.NewProductPostgres(counter)
		page, err := reader.ReadMyNotifications(context.Background(), inboxAuthority(t, inboxMember), notification.MyNotificationsSpec{Limit: size})
		if err != nil || len(page.Items) != int(size) || counter.calls != 2 {
			t.Fatalf("size=%d items=%d SQL calls=%d error=%v", size, len(page.Items), counter.calls, err)
		}
	}
}

func TestInboxInsertFailureRollsBackBusinessWriteAndCommandClaim(t *testing.T) {
	f := inboxFixture(t)
	ctx := context.Background()
	if _, err := f.Pool.Exec(ctx, `CREATE FUNCTION reject_inbox_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture inbox failure'; END $$; CREATE TRIGGER reject_inbox_fixture BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_inbox_fixture()`); err != nil {
		t.Fatal(err)
	}
	tx, err := f.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	replay, _ := idempotency.NewRepository(tx)
	chars, _ := character.NewProductPostgres(tx)
	notice, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Character: chars})
	if err != nil {
		t.Fatal(err)
	}
	_, err = replay.Claim(ctx, inboxMember, "signupForQuest", "rollback-key", strings.Repeat("a", 64))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE quest_participants SET status='waitlisted'`); err != nil {
		t.Fatal(err)
	}
	if err := notification.NewProducer().Record(ctx, notice, signupEvent(time.Now().UTC().Truncate(time.Microsecond), "rollback")); err == nil {
		t.Fatal("failed insert became success")
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var status string
	var notices, claims int
	if err := f.Pool.QueryRow(ctx, `SELECT status,(SELECT count(*) FROM notifications),(SELECT count(*) FROM idempotency_keys) FROM quest_participants`).Scan(&status, &notices, &claims); err != nil || status != "signed_up" || notices != 0 || claims != 0 {
		t.Fatalf("partial transaction effects status=%s notices=%d claims=%d error=%v", status, notices, claims, err)
	}
}
