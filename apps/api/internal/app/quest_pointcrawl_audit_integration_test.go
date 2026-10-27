//go:build integration

package app

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestQuestPointcrawlBoundAudienceAuditRollbackReplayAndRevocation(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	ownerID := f.owner.Claims().MemberID
	otherID := f.other.Claims().MemberID
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['admin','dm','player'] WHERE public_id=$1`, ownerID); err != nil {
		t.Fatal(err)
	}
	actor, err := f.store.ResolveAuthority(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	signup := "last_game_played"
	created, err := f.services.QuestCommands.CreateQuest(ctx, actor, quest.CreateQuestSpec{Input: quest.CreateQuestFields{Title: "Bound pointcrawl audience", BriefBody: "Public brief", ScheduledAt: time.Date(2032, 1, 1, 18, 0, 0, 0, time.UTC), DurationHours: 3, SlotsMax: 4, Kinds: []string{"standard"}, SignupType: &signup}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	var mapID, documentID int64
	nodeID := uuid.NewString()
	if err := f.db.Pool.QueryRow(ctx, `INSERT INTO maps(name,atlas_code,map_kind) VALUES('Command audit map','command-audit-map','pointcrawl') RETURNING id`).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) VALUES($1,$2,'Command node',0,0,now())`, nodeID, mapID); err != nil {
		t.Fatal(err)
	}
	if err := f.db.Pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,policy,body,author_id) SELECT 'codex_entry','command-audit-location','Private location','published','public','[]'::jsonb,'Private body',id FROM members WHERE public_id=$1 RETURNING id`, otherID).Scan(&documentID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) SELECT n.map_id,n.id,$2,'location',now(),d.author_id FROM pointcrawl_nodes n,documents d WHERE n.public_id=$1 AND d.id=$2`, nodeID, documentID); err != nil {
		t.Fatal(err)
	}
	var auditTable *string
	if err := f.db.Pool.QueryRow(ctx, `SELECT to_regclass('public.auth_override_audit')::text`).Scan(&auditTable); err != nil || auditTable != nil {
		t.Fatalf("separate audit table must remain absent: %v err=%v", auditTable, err)
	}
	snapshot := func() string {
		t.Helper()
		var state string
		if err := f.db.Pool.QueryRow(ctx, `SELECT jsonb_build_object(
		 'quests',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM quests v),
		 'links',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.quest_id,v.node_id,v.role) FROM quest_pointcrawl_nodes v),
		 'documents',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM documents v),
		 'revisions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM document_revisions v),
		 'jobs',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM background_jobs v),
		 'notices',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM notifications v),
		 'receipts',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.endpoint,v.actor_id,v.key) FROM idempotency_keys v))::text`).Scan(&state); err != nil {
			t.Fatal(err)
		}
		return state
	}
	spec := quest.SetQuestHexesSpec{QuestId: created.Id, Hexes: []quest.QuestHexFields{{HexId: nodeID, Role: "expected"}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	frozenAt := time.Date(2026, 10, 20, 12, 34, 56, 123000, time.UTC)
	f.services.QuestCommands.Clock = func() time.Time { return frozenAt }
	result, err := f.services.QuestCommands.SetQuestPointcrawlLinks(ctx, actor, spec, meta)
	if err != nil || len(result) != 1 || result[0].HexId != nodeID || result[0].Role != "expected" {
		t.Fatalf("audience override=%+v err=%v", result, err)
	}
	assertWireOverrideFacts(t, f.db, ownerID, "setQuestPointcrawlLinks", meta.IdempotencyKey, []string{created.Id}, "quest", "AUDIENCE")
	var factAt time.Time
	if err := f.db.Pool.QueryRow(ctx, `SELECT (receipt->'_authorizationOverrides'->0->>'at')::timestamptz FROM idempotency_keys WHERE key=$1`, meta.IdempotencyKey).Scan(&factAt); err != nil || !factAt.Equal(frozenAt) {
		t.Fatalf("command clock=%v err=%v", factAt, err)
	}
	before := snapshot()
	replayed, err := f.services.QuestCommands.SetQuestPointcrawlLinks(ctx, actor, spec, meta)
	if err != nil || !reflect.DeepEqual(result, replayed) || snapshot() != before {
		t.Fatalf("audited replay changed effects: %+v %v", replayed, err)
	}
	meta = product.CommandMeta{IdempotencyKey: uuid.NewString()}
	for _, tc := range []struct{ name, policy, author string }{
		{"explicit grant", `["role:admin"]`, otherID},
		{"public", "null", otherID},
		{"author", `[]`, ownerID},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := f.db.Pool.Exec(ctx, `UPDATE documents SET policy=$2::jsonb,author_id=(SELECT id FROM members WHERE public_id=$3) WHERE id=$1`, documentID, tc.policy, tc.author); err != nil {
				t.Fatal(err)
			}
			result, err := f.services.QuestCommands.SetQuestPointcrawlLinks(ctx, actor, spec, meta)
			if err != nil || len(result) != 1 || result[0].HexId != nodeID || result[0].Role != "expected" {
				t.Fatalf("ordinary command=%+v err=%v", result, err)
			}
			if f.count(t, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, meta.IdempotencyKey) != 1 {
				t.Fatal("ordinary command did not retain one receipt")
			}
			if f.count(t, `SELECT count(*) FROM idempotency_keys WHERE key=$1 AND receipt ? '_authorizationOverrides'`, meta.IdempotencyKey) != 0 {
				t.Fatal("ordinary admission recorded a false override")
			}
			state := snapshot()
			replayed, err := f.services.QuestCommands.SetQuestPointcrawlLinks(ctx, actor, spec, meta)
			if err != nil || !reflect.DeepEqual(replayed, result) || snapshot() != state {
				t.Fatalf("ordinary replay changed effects: %+v err=%v", replayed, err)
			}
		})
		meta = product.CommandMeta{IdempotencyKey: uuid.NewString()}
	}
	// The passed Authority still carries admin. The real binding refreshes it
	// after the map wait and refuses to commit under the revoked database role.
	if _, err := f.db.Pool.Exec(ctx, `UPDATE documents SET policy='[]'::jsonb,author_id=(SELECT id FROM members WHERE public_id=$2) WHERE id=$1`, documentID, otherID); err != nil {
		t.Fatal(err)
	}
	before = snapshot()
	locker, err := f.db.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer locker.Rollback(context.Background()) //nolint:errcheck
	if _, err := locker.Exec(ctx, `SELECT id FROM maps WHERE id=$1 FOR UPDATE`, mapID); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, err := f.services.QuestCommands.SetQuestPointcrawlLinks(ctx, actor, spec, meta)
		done <- err
	}()
	waitForMemberProfileLock(t, f, "-- name: LockProductMap :one")
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['dm','player'] WHERE public_id=$1`, ownerID); err != nil {
		t.Fatal(err)
	}
	if err := locker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	memberProfileCode(t, <-done, apierr.Conflict)
	if snapshot() != before {
		t.Fatal("revocation during lock wait changed command effects")
	}
	// A previously successful receipt must not bypass current node admission.
	var priorKey string
	if err := f.db.Pool.QueryRow(ctx, `SELECT key FROM idempotency_keys WHERE endpoint='graphql:setQuestPointcrawlLinks' ORDER BY key LIMIT 1`).Scan(&priorKey); err != nil {
		t.Fatal(err)
	}
	_, err = f.services.QuestCommands.SetQuestPointcrawlLinks(ctx, actor, spec, product.CommandMeta{IdempotencyKey: priorKey})
	memberProfileCode(t, err, apierr.NotFound)
	if snapshot() != before {
		t.Fatal("revoked replay changed command effects")
	}
	if !actor.Claims().Has(auth.Admin) {
		t.Fatal("fixture did not retain the original admin Authority")
	}
}

func TestReceiptCompletionFailureRollsBackCreatedQuestBriefAndJob(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := t.Context()
	dmID, ownerID := f.owner.Claims().MemberID, f.other.Claims().MemberID
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, dmID); err != nil {
		t.Fatal(err)
	}
	store, err := member.NewFromDBTX(f.db.Pool, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	actor, err := store.ResolveAuthority(ctx, ownerID)
	if err != nil || !actor.IsPlatformOwner() || actor.Claims().Has(auth.Admin) || actor.LiveDM() {
		t.Fatalf("configured Player owner unavailable: %v", err)
	}
	policy, err := auth.NewPoolPolicy(f.db.Pool)
	if err != nil {
		t.Fatal(err)
	}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	at := time.Date(2026, 10, 20, 15, 0, 0, 123000, time.UTC)
	fail, observed := true, false
	runner := db.NewRunner(f.db.Pool, func(tx pgx.Tx) quest.ProductCommandRepos {
		if fail {
			tx = &auditReceiptFailureTx{Tx: tx, onComplete: func(callCtx context.Context, args []any) {
				var receipt map[string]json.RawMessage
				if len(args) != 5 || json.Unmarshal(args[4].([]byte), &receipt) != nil {
					t.Error("completion receipt unavailable")
					return
				}
				var facts []idempotency.CommandOverrideFact
				if idempotency.StrictJSON(receipt["_authorizationOverrides"], &facts) != nil || len(facts) != 1 || facts[0].ActorID != ownerID || facts[0].SubjectID == ownerID || facts[0].RuleCode != "ROLE" || !facts[0].At.Equal(at) {
					t.Error("created Quest fact missing or false")
					return
				}
				var quests, briefs, jobs, relationships int
				if err := tx.QueryRow(callCtx, `SELECT (SELECT count(*) FROM quests),(SELECT count(*) FROM documents WHERE kind='quest_brief'),(SELECT count(*) FROM background_jobs),(SELECT count(*) FROM quests q JOIN documents d ON d.id=q.document_id WHERE q.public_id=$1 AND d.kind='quest_brief')`, facts[0].SubjectID).Scan(&quests, &briefs, &jobs, &relationships); err != nil || quests != 1 || briefs != 1 || jobs != 1 || relationships != 1 {
					t.Errorf("tentative Quest effects quests=%d briefs=%d jobs=%d relation=%d err=%v", quests, briefs, jobs, relationships, err)
					return
				}
				observed = true
			}}
		}
		return bindQuestCommandRepos(tx, policy, store.ResolveAuthority, notification.NewProducer())
	})
	commands, err := quest.NewProductCommands(runner, func() time.Time { return at }, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	commands.Queries = f.services.QuestQueries
	spec := quest.CreateQuestSpec{Input: quest.CreateQuestFields{Title: "Must commit receipt too", BriefBody: "Authored brief", ScheduledAt: at.Add(24 * time.Hour), DurationHours: 2, SlotsMax: 3, DmId: &dmID}}
	_, err = commands.CreateQuest(ctx, actor, spec, meta)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "22012" || !observed {
		t.Fatalf("completion failure=%v observed=%v", err, observed)
	}
	for _, table := range []string{"quests", "documents", "document_links", "document_revisions", "background_jobs", "notifications", "idempotency_keys"} {
		if count := f.count(t, `SELECT count(*) FROM `+table); count != 0 {
			t.Fatalf("rollback left %d %s", count, table)
		}
	}
	fail = false
	result, err := commands.CreateQuest(ctx, actor, spec, meta)
	if err != nil {
		t.Fatal(err)
	}
	assertWireOverrideFacts(t, f.db, ownerID, "createQuest", meta.IdempotencyKey, []string{result.Id}, "quest", "ROLE")
	var before, after string
	const state = `SELECT jsonb_build_object('quests',(SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM quests q),'docs',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM documents d),'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM background_jobs j),'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.key) FROM idempotency_keys r))::text`
	if err := f.db.Pool.QueryRow(ctx, state).Scan(&before); err != nil {
		t.Fatal(err)
	}
	replayed, err := commands.CreateQuest(ctx, actor, spec, meta)
	if err != nil || replayed.Id != result.Id || replayed.DocumentId == nil || result.DocumentId == nil || *replayed.DocumentId != *result.DocumentId {
		t.Fatalf("creation replay=%+v err=%v", replayed, err)
	}
	if err := f.db.Pool.QueryRow(ctx, state).Scan(&after); err != nil || before != after {
		t.Fatalf("creation replay changed receipt/brief/job: %v", err)
	}
}

// Only the receipt completion boundary is faulted; all business writes and the
// recorder use the actual PostgreSQL transaction and production app binder.
type auditReceiptFailureTx struct {
	pgx.Tx
	onComplete func(context.Context, []any)
}

func (tx *auditReceiptFailureTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if strings.HasPrefix(sql, "UPDATE idempotency_keys") {
		tx.onComplete(ctx, args)
		return tx.Tx.Exec(ctx, `SELECT 1 / 0`)
	}
	return tx.Tx.Exec(ctx, sql, args...)
}

func TestReceiptCompletionFailureRollsBackRealDocumentNotice(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := t.Context()
	actorID := f.owner.Claims().MemberID
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['admin','player'] WHERE public_id=$1`, actorID); err != nil {
		t.Fatal(err)
	}
	actor, err := f.store.ResolveAuthority(ctx, actorID)
	if err != nil {
		t.Fatal(err)
	}
	docID := uuid.NewString()
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id,version) SELECT $1,'codex_entry','audit-receipt-rollback','Before','published','public','HIDDEN_BODY_SENTINEL',id,1 FROM members WHERE public_id=$2`, docID, f.other.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPoolPolicy(f.db.Pool)
	if err != nil {
		t.Fatal(err)
	}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	at := time.Date(2026, 10, 20, 14, 0, 0, 123000, time.UTC)
	title := "Tentative edit"
	spec := document.EditPublishedDocumentSpec{Id: docID, Input: document.DocumentEditFields{ExpectedRevision: 1, Title: product.Optional[string]{Set: true, Value: &title}}}
	fail := true
	observed := false
	runner := db.NewRunner(f.db.Pool, func(tx pgx.Tx) document.ProductCommandRepos {
		if fail {
			tx = &auditReceiptFailureTx{Tx: tx, onComplete: func(callCtx context.Context, args []any) {
				var receipt map[string]json.RawMessage
				if len(args) != 5 || json.Unmarshal(args[4].([]byte), &receipt) != nil || receipt["_authorizationOverrides"] == nil || receipt["_notificationProofs"] == nil {
					t.Error("completion did not carry both actual sidecars")
					return
				}
				var facts []idempotency.CommandOverrideFact
				if idempotency.StrictJSON(receipt["_authorizationOverrides"], &facts) != nil || len(facts) != 1 || facts[0].ActorID != actorID || facts[0].SubjectID != docID || facts[0].RuleCode != "OWNERSHIP" || !facts[0].At.Equal(at) || strings.Contains(string(receipt["_authorizationOverrides"]), "HIDDEN_BODY_SENTINEL") {
					t.Errorf("unsafe/different completion fact: %s", receipt["_authorizationOverrides"])
					return
				}
				var revisions, notices, version int
				if err := tx.QueryRow(callCtx, `SELECT (SELECT count(*) FROM document_revisions),(SELECT count(*) FROM notifications),(SELECT version FROM documents WHERE public_id=$1)`, docID).Scan(&revisions, &notices, &version); err != nil || revisions != 1 || notices != 1 || version != 2 {
					t.Errorf("pre-completion effects revisions=%d notices=%d version=%d err=%v", revisions, notices, version, err)
					return
				}
				observed = true
			}}
		}
		return bindDocumentCommandRepos(tx, policy, f.store.ResolveAuthority, notification.NewProducer())
	})
	commands, err := document.NewProductCommands(runner, func() time.Time { return at }, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	_, err = commands.EditPublishedDocument(ctx, actor, spec, meta)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "22012" || !observed {
		t.Fatalf("actual completion failure=%v observed=%v", err, observed)
	}
	var version, revisions, notices, jobs, claims int
	if err := f.db.Pool.QueryRow(ctx, `SELECT (SELECT version FROM documents WHERE public_id=$1),(SELECT count(*) FROM document_revisions),(SELECT count(*) FROM notifications),(SELECT count(*) FROM background_jobs),(SELECT count(*) FROM idempotency_keys)`, docID).Scan(&version, &revisions, &notices, &jobs, &claims); err != nil || version != 1 || revisions != 0 || notices != 0 || jobs != 0 || claims != 0 {
		t.Fatalf("rollback version=%d revisions=%d notices=%d jobs=%d claims=%d err=%v", version, revisions, notices, jobs, claims, err)
	}
	fail = false
	result, err := commands.EditPublishedDocument(ctx, actor, spec, meta)
	if err != nil || result.Id != docID || result.Version != 2 {
		t.Fatalf("retry=%+v err=%v", result, err)
	}
	assertWireOverrideFacts(t, f.db, actorID, "editPublishedDocument", meta.IdempotencyKey, []string{docID}, "document", "OWNERSHIP")
	var before, after string
	const state = `SELECT jsonb_build_object('revisions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM document_revisions r),'notices',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM notifications n),'receipt',(SELECT receipt FROM idempotency_keys WHERE key=$1))::text`
	if err := f.db.Pool.QueryRow(ctx, state, meta.IdempotencyKey).Scan(&before); err != nil {
		t.Fatal(err)
	}
	replayed, err := commands.EditPublishedDocument(ctx, actor, spec, meta)
	if err != nil || replayed.Id != result.Id || replayed.Version != result.Version {
		t.Fatalf("mixed receipt replay=%+v err=%v", replayed, err)
	}
	if err := f.db.Pool.QueryRow(ctx, state, meta.IdempotencyKey).Scan(&after); err != nil || before != after {
		t.Fatalf("replay changed fact/proof/effects: %v", err)
	}
	noticesStore, _ := notification.NewProductPostgres(f.db.Pool)
	inbox, err := noticesStore.ReadMyNotifications(ctx, f.other, notification.MyNotificationsSpec{Limit: 50})
	if err != nil || len(inbox.Items) != 1 || inbox.Items[0].SubjectId != docID {
		t.Fatalf("mixed proof actual inbox=%+v err=%v", inbox, err)
	}
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player'] WHERE public_id=$1`, actorID); err != nil {
		t.Fatal(err)
	}
	_, err = commands.EditPublishedDocument(ctx, actor, spec, meta)
	memberProfileCode(t, err, apierr.Forbidden)
	if err := f.db.Pool.QueryRow(ctx, state, meta.IdempotencyKey).Scan(&after); err != nil || before != after {
		t.Fatalf("revoked replay changed stored effects: %v", err)
	}
}
