//go:build integration

package site

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type siteQueryErrorDB struct {
	dbgen.DBTX
	err error
}

func (db siteQueryErrorDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, db.err
}

func TestProductPostgresReadsSiteSnapshotAndMemberSearch(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	insertMember := func(discordID, handle, display string, roles []string, avatar *string) uuid.UUID {
		t.Helper()
		var publicID uuid.UUID
		if err := fixture.Pool.QueryRow(ctx,
			`INSERT INTO members(discord_id,handle,display_name,roles,avatar_url)
			 VALUES($1,$2,$3,$4,$5) RETURNING public_id`,
			discordID, handle, display, roles, avatar).Scan(&publicID); err != nil {
			t.Fatal(err)
		}
		return publicID
	}
	memberOne := insertMember("site-adapter-one", "adapter-one", "Adapter One", []string{"player", "dm"}, nil)
	memberTwo := insertMember("site-adapter-two", "adapter-two", "Adapter Two", []string{"player"}, ptrString("https://avatar.invalid/two"))
	for i, event := range []struct {
		kind   string
		amount float64
	}{{"voice", 5.5}, {"message", 3}, {"reaction", 2}} {
		if _, err := fixture.Pool.Exec(ctx,
			`INSERT INTO discord_activity_events(event_id,kind,discord_user_id,channel_id,occurred_at,amount)
			 VALUES($1,$2,$3,'site-adapter-channel',now(),$4)`,
			fmt.Sprintf("site-adapter-event-%d", i), event.kind, "site-adapter-one", event.amount); err != nil {
			t.Fatal(err)
		}
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatalf("construct Site Postgres adapter: %v", err)
	}

	snapshot, err := adapter.ReadHomeCommunity(ctx, auth.Authority{}, HomeSpec{IncludeActivity: true})
	if err != nil {
		t.Fatalf("read community snapshot: %v", err)
	}
	roles := map[string]int32{}
	for _, role := range snapshot.MembersByRole {
		roles[role.Key] = role.Count
	}
	if snapshot.TotalMembers < 2 || roles["player"] < 2 || roles["dm"] < 1 {
		t.Fatalf("snapshot totals=%+v roles=%v, want stored members and multi-role membership", snapshot, roles)
	}
	if snapshot.Activity.VoiceMinutes < 5.5 || snapshot.Activity.Messages < 3 || snapshot.Activity.Reactions < 2 {
		t.Fatalf("activity=%+v, want stored event sums", snapshot.Activity)
	}
	stats, err := adapter.ReadSiteStats(ctx, auth.Authority{}, SiteStatsSpec{IncludeActivity: true})
	if err != nil || !reflect.DeepEqual(stats, snapshot) {
		t.Fatalf("site stats=%+v err=%v, want same stored snapshot %+v", stats, err, snapshot)
	}

	page, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "adapter-", Limit: 10, Offset: 0})
	if err != nil {
		t.Fatalf("read member search: %v", err)
	}
	if page.Total != 2 || len(page.Items) != 2 || page.Order != "handle_asc_id_asc" {
		t.Fatalf("page=%+v, want two matches in canonical order", page)
	}
	if page.Items[0].MemberId != memberOne.String() || page.Items[0].AvatarUrl != nil ||
		page.Items[1].MemberId != memberTwo.String() || page.Items[1].AvatarUrl == nil || *page.Items[1].AvatarUrl != "https://avatar.invalid/two" {
		t.Fatalf("search items=%+v, want public IDs and nullable avatars", page.Items)
	}

	latePage, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "adapter-", Limit: 1, Offset: 9})
	if err != nil || latePage.Total != 2 || len(latePage.Items) != 0 {
		t.Fatalf("beyond-end page=%+v err=%v, want empty page with total 2", latePage, err)
	}
	empty, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "no-such-site-adapter-member", Limit: 5})
	if err != nil || empty.Total != 0 || len(empty.Items) != 0 {
		t.Fatalf("empty search=%+v err=%v, want successful zero-result query", empty, err)
	}

	insertMember("site-adapter-unicode-upper", "Éclair", "Unicode upper", []string{"player"}, nil)
	insertMember("site-adapter-unicode-lower", "école", "Unicode lower", []string{"player"}, nil)
	unicode, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "é", Limit: 10})
	if err != nil || unicode.Total != 2 || len(unicode.Items) != 2 {
		t.Fatalf("unicode search=%+v err=%v, want both case-folded prefixes", unicode, err)
	}
	insertMember("site-adapter-wildcard", "%_literal", "Wildcard literal", []string{"player"}, nil)
	wildcard, err := adapter.ReadMemberSearch(ctx, auth.Authority{}, SearchSpec{Query: "%_", Limit: 10})
	if err != nil || wildcard.Total != 1 || len(wildcard.Items) != 1 || wildcard.Items[0].Handle != "%_literal" {
		t.Fatalf("literal wildcard search=%+v err=%v, want one literal prefix", wildcard, err)
	}
}

func TestProductPostgresPropagatesDatabaseReadFailures(t *testing.T) {
	want := errors.New("database unavailable")
	adapter, err := NewProductPostgres(siteQueryErrorDB{err: want})
	if err != nil {
		t.Fatalf("construct Site Postgres adapter: %v", err)
	}
	if _, err := adapter.ReadHomeCommunity(context.Background(), auth.Authority{}, HomeSpec{}); !errors.Is(err, want) {
		t.Fatalf("community error=%v, want original database error", err)
	}
	if _, err := adapter.ReadMemberSearch(context.Background(), auth.Authority{}, SearchSpec{Query: "x", Limit: 1}); !errors.Is(err, want) {
		t.Fatalf("search error=%v, want original database error", err)
	}
	actor, err := auth.NewAuthority(uuid.NewString(), []auth.Role{auth.Admin}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := adapter.ReadAdminOperations(context.Background(), actor, AdminOperationsSpec{Limit: 1}); !errors.Is(err, want) {
		t.Fatalf("document reader grant error=%v, want original database error", err)
	}
}

func TestSiteDeliveryReadsUseTypedPayloadCurrentAudienceAndCausalAudit(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := fixture.Pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	insertMember := func(handle string, roles []string) (int64, string) {
		t.Helper()
		var id int64
		var publicID string
		if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles) VALUES($1,$1,$1,$2) RETURNING id,public_id::text`, handle, roles).Scan(&id, &publicID); err != nil {
			t.Fatal(err)
		}
		return id, publicID
	}
	viewerID, viewerPublicID := insertMember("delivery-viewer", []string{"admin", "dm"})
	authorID, _ := insertMember("delivery-author", []string{"dm"})
	_, ownerPublicID := insertMember("delivery-owner", []string{"player"})
	exec(`INSERT INTO dm_profiles(member_id,status) VALUES($1,'approved'),($2,'approved')`, viewerID, authorID)
	store, err := member.NewFromDBTX(fixture.Pool, ownerPublicID)
	if err != nil {
		t.Fatal(err)
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	type delivery struct {
		jobID, questID, title, code string
		documentID                  int64
	}
	base := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	insertJob := func(index int, payload []byte) string {
		t.Helper()
		var id string
		if err := fixture.Pool.QueryRow(ctx, `INSERT INTO background_jobs(job_key,kind,lane,state,attempts,payload,updated_at) VALUES($1,'quest_discord_delivery','discord','dead',$2,$3,$4) RETURNING public_id::text`, fmt.Sprintf("delivery-read-%d", index), jobs.DiscordMaxAttempts, payload, base.Add(-time.Duration(index)*time.Minute)).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	insertDelivery := func(index int, label, visibility string, policy *string, author int64) delivery {
		t.Helper()
		d := delivery{title: "PROTECTED-DELIVERY-" + label, code: "DELIVERY-" + label}
		if err := fixture.Pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,policy,author_id,body) VALUES('quest_brief',$1,$2,'published',$3,$4::jsonb,$5,'PROTECTED-DELIVERY-BODY') RETURNING id`, "delivery-"+label, d.title, visibility, policy, author).Scan(&d.documentID); err != nil {
			t.Fatal(err)
		}
		var internalID int64
		if err := fixture.Pool.QueryRow(ctx, `INSERT INTO quests(short_code,kinds,dm_id,scheduled_at,document_id,created_by) VALUES($1,ARRAY['standard'],$2,$3,$4,$2) RETURNING id,public_id::text`, d.code, author, base.Add(24*time.Hour), d.documentID).Scan(&internalID, &d.questID); err != nil {
			t.Fatal(err)
		}
		payload, err := json.Marshal(jobs.QuestDiscordPayload{ID: internalID, PublicID: d.questID, DesiredRevision: 1})
		if err != nil {
			t.Fatal(err)
		}
		d.jobID = insertJob(index, payload)
		return d
	}
	public := insertDelivery(0, "public", "public", nil, authorID)
	private := insertDelivery(1, "private", "public", ptrString(`[]`), authorID)
	owned := insertDelivery(2, "owned", "public", ptrString(`[]`), viewerID)
	granted := insertDelivery(3, "granted", "restricted", nil, authorID)
	exec(`INSERT INTO document_readers(document_id,member_id) VALUES($1,$2)`, granted.documentID, viewerID)
	dmOnly := insertDelivery(4, "dm", "dm_only", nil, authorID)
	deletedBrief := insertDelivery(5, "deleted-brief", "public", nil, authorID)
	exec(`UPDATE documents SET deleted_at=now() WHERE id=$1`, deletedBrief.documentID)
	deletedQuest := insertDelivery(6, "deleted-quest", "public", nil, authorID)
	exec(`UPDATE quests SET deleted_at=now() WHERE public_id=$1`, deletedQuest.questID)
	malformedID := insertJob(7, []byte(`{"public_id":"not-a-uuid"}`))
	unmatchedPayload, err := json.Marshal(jobs.QuestDiscordPayload{ID: 999999, PublicID: uuid.NewString(), DesiredRevision: 1})
	if err != nil {
		t.Fatal(err)
	}
	unmatchedID := insertJob(8, unmatchedPayload)
	retiredAliasID := insertJob(9, []byte(fmt.Sprintf(`{"questId":%q}`, public.questID)))
	const total int32 = 10

	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	assertAudit := func(want bool, actorID string) {
		t.Helper()
		if !want {
			if output.Len() != 0 {
				t.Fatalf("ordinary, hidden, or off-page title caused audit: %s", &output)
			}
			return
		}
		lines := strings.Split(strings.TrimSpace(output.String()), "\n")
		if len(lines) != 1 {
			t.Fatalf("audit events=%d, want one: %s", len(lines), &output)
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(lines[0]), &event); err != nil {
			t.Fatal(err)
		}
		for key := range event {
			switch key {
			case "time", "level", "msg", "member_id", "scope", "surface", "operation":
			default:
				t.Fatalf("unsafe audit field %q: %s", key, &output)
			}
		}
		if event["msg"] != "audience.admin_override" || event["level"] != "INFO" || event["member_id"] != actorID || event["scope"] != "listing" || event["surface"] != "site_delivery_titles" || event["operation"] != "list" {
			t.Fatalf("wrong causal audit: %s", &output)
		}
	}
	read := func(actorID string, offset int32, audit bool) AdminOperationsView {
		t.Helper()
		actor, err := store.ResolveAuthority(ctx, actorID)
		if err != nil {
			t.Fatal(err)
		}
		output.Reset()
		view, err := adapter.ReadAdminOperations(ctx, actor, AdminOperationsSpec{Limit: 1, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		if view.DeliveryTotal != total || view.TerminalDeliveryCount != total || view.PendingDeliveryCount != 0 {
			t.Fatalf("population changed through association/audience: %+v", view)
		}
		assertAudit(audit, actorID)
		return view
	}
	assertDelivery := func(actorID string, offset int32, expected delivery, visible, audit bool) {
		t.Helper()
		view := read(actorID, offset, audit)
		if len(view.Deliveries) != 1 {
			t.Fatalf("offset=%d deliveries=%+v", offset, view.Deliveries)
		}
		got := view.Deliveries[0]
		if got.Id != expected.jobID || got.State != "dead" || got.FailureStreak != jobs.DiscordMaxAttempts || got.MaxAttempts != jobs.DiscordMaxAttempts || got.QuestId == nil || *got.QuestId != expected.questID || got.QuestShortCode == nil || *got.QuestShortCode != expected.code || got.QuestLink == nil || *got.QuestLink != "/quests/"+expected.code {
			t.Fatalf("typed payload or internal destination failed: %+v", got)
		}
		if visible && (got.QuestTitle == nil || *got.QuestTitle != expected.title) || !visible && got.QuestTitle != nil {
			t.Fatalf("title visibility=%v, got %+v", visible, got)
		}
	}
	assertDelivery(viewerPublicID, 0, public, true, false)
	assertDelivery(viewerPublicID, 1, private, true, true)
	assertDelivery(viewerPublicID, 2, owned, true, false)
	assertDelivery(viewerPublicID, 3, granted, true, false)
	assertDelivery(viewerPublicID, 4, dmOnly, true, false)
	assertDelivery(viewerPublicID, 5, deletedBrief, false, false)
	for index, jobID := range []string{deletedQuest.jobID, malformedID, unmatchedID, retiredAliasID} {
		view := read(viewerPublicID, int32(index+6), false)
		if len(view.Deliveries) != 1 || view.Deliveries[0].Id != jobID || view.Deliveries[0].QuestId != nil || view.Deliveries[0].QuestTitle != nil || view.Deliveries[0].QuestLink != nil {
			t.Fatalf("missing/deleted target lost job or fabricated association: %+v", view)
		}
	}
	if view := read(viewerPublicID, total, false); len(view.Deliveries) != 0 {
		t.Fatalf("past-end page lost total or retained items: %+v", view)
	}
	exec(`INSERT INTO site_settings(key,payload) VALUES('public_origin','{"origin":"https://example.invalid"}')`)
	assertDelivery(viewerPublicID, 0, public, true, false)
	exec(`DELETE FROM document_readers WHERE document_id=$1 AND member_id=$2`, granted.documentID, viewerID)
	assertDelivery(viewerPublicID, 3, granted, true, true)
	exec(`UPDATE dm_profiles SET status='rejected' WHERE member_id=$1`, viewerID)
	assertDelivery(viewerPublicID, 4, dmOnly, true, true)
	exec(`UPDATE members SET roles=ARRAY['dm'] WHERE id=$1`, viewerID)
	assertDelivery(viewerPublicID, 1, private, false, false)
	assertDelivery(viewerPublicID, 2, owned, true, false)
	assertDelivery(viewerPublicID, 3, granted, false, false)
	assertDelivery(viewerPublicID, 4, dmOnly, false, false)
	exec(`UPDATE dm_profiles SET status='approved' WHERE member_id=$1`, viewerID)
	exec(`INSERT INTO document_readers(document_id,member_id) VALUES($1,$2)`, granted.documentID, viewerID)
	assertDelivery(viewerPublicID, 3, granted, true, false)
	assertDelivery(viewerPublicID, 4, dmOnly, true, false)
	exec(`UPDATE members SET roles=ARRAY['player'] WHERE id=$1`, viewerID)
	assertDelivery(viewerPublicID, 3, granted, false, false)
	assertDelivery(viewerPublicID, 4, dmOnly, false, false)
	assertDelivery(ownerPublicID, 0, public, true, false)
	assertDelivery(ownerPublicID, 1, private, false, false)
	state := "dead"
	actor, err := store.ResolveAuthority(ctx, viewerPublicID)
	if err != nil {
		t.Fatal(err)
	}
	output.Reset()
	filtered, err := adapter.ReadAdminOperations(ctx, actor, AdminOperationsSpec{DeliveryState: &state, Limit: total})
	if err != nil || len(filtered.Deliveries) != int(total) || filtered.DeliveryTotal != total {
		t.Fatalf("state-filtered jobs disappeared: %+v err=%v", filtered, err)
	}
	assertAudit(false, viewerPublicID)
}

func TestRedriveDiscordDeliveryReportsQuestRevisionsAndClearsSafeCode(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	var authorID int64
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members(discord_id,handle,display_name,roles) VALUES('redrive-dm','redrive-dm','Redrive DM',ARRAY['dm']) RETURNING id`).Scan(&authorID); err != nil {
		t.Fatal(err)
	}
	var documentID, internalID int64
	var questID string
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,author_id,body) VALUES('quest_brief','redrive','Redrive quest','published','public',$1,'body') RETURNING id`, authorID).Scan(&documentID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO quests(short_code,kinds,dm_id,scheduled_at,document_id,created_by,discord_desired_revision,discord_applied_revision) VALUES('REDRIVE',ARRAY['standard'],$1,$2,$3,$1,3,2) RETURNING id,public_id::text`, authorID, time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC), documentID).Scan(&internalID, &questID); err != nil {
		t.Fatal(err)
	}
	insertJob := func(key string, payload []byte) string {
		t.Helper()
		var id string
		if err := fixture.Pool.QueryRow(ctx, `INSERT INTO background_jobs(job_key,kind,lane,state,attempts,payload,error_message,safe_error_code) VALUES($1,'quest_discord_delivery','discord','repair_required',1,$2,'discord create message: discord api status 403','DISCORD_PERMISSION') RETURNING public_id::text`, key, payload).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	payload, err := json.Marshal(jobs.QuestDiscordPayload{ID: internalID, PublicID: questID, DesiredRevision: 3})
	if err != nil {
		t.Fatal(err)
	}
	redrive := func(jobID string) (RedriveDiscordDeliveryState, error) {
		t.Helper()
		spec := RedriveDiscordDeliverySpec{JobId: jobID, Reason: "Admin retry from delivery panel"}
		locked, err := adapter.LockRedriveDiscordDelivery(ctx, spec)
		if err != nil {
			t.Fatal(err)
		}
		receipt, err := adapter.StoreRedriveDiscordDelivery(ctx, RedriveDiscordDeliveryWrite{At: time.Now(), Input: spec, ValidatedInput: spec, Locked: locked})
		if err != nil {
			t.Fatal(err)
		}
		if receipt.JobId != jobID || receipt.DeliveryStatus != "queued" {
			t.Fatalf("receipt=%+v", receipt)
		}
		var state string
		var safeCode *string
		var errorMessage *string
		if err := fixture.Pool.QueryRow(ctx, `SELECT state,safe_error_code,error_message FROM background_jobs WHERE public_id=$1::uuid`, jobID).Scan(&state, &safeCode, &errorMessage); err != nil {
			t.Fatal(err)
		}
		if state != "queued" || safeCode != nil || errorMessage != nil {
			t.Fatalf("redrive left state=%s safe_error_code=%v error_message=%v", state, safeCode, errorMessage)
		}
		return locked, nil
	}

	jobID := insertJob("redrive-quest", payload)
	locked, _ := redrive(jobID)
	if locked.Before == nil || locked.Before.QuestId == nil || *locked.Before.QuestId != questID {
		t.Fatalf("locked job did not resolve its quest: %+v", locked.Before)
	}
	if locked.Before.SafeError == nil || *locked.Before.SafeError != "DISCORD_PERMISSION" {
		t.Fatalf("locked job lost its safe code: %+v", locked.Before)
	}
	spec := RedriveDiscordDeliverySpec{JobId: jobID, Reason: "again"}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE background_jobs SET state='dead' WHERE public_id=$1::uuid`, jobID); err != nil {
		t.Fatal(err)
	}
	again, err := adapter.LockRedriveDiscordDelivery(ctx, spec)
	if err != nil {
		t.Fatal(err)
	}
	receipt, err := adapter.StoreRedriveDiscordDelivery(ctx, RedriveDiscordDeliveryWrite{At: time.Now(), Input: spec, ValidatedInput: spec, Locked: again})
	if err != nil {
		t.Fatal(err)
	}
	if receipt.DesiredRevision != 3 || receipt.AppliedRevision != 2 {
		t.Fatalf("receipt revisions desired=%d applied=%d, want 3 and 2", receipt.DesiredRevision, receipt.AppliedRevision)
	}

	// The retired questId alias must not resolve a quest.
	aliasID := insertJob("redrive-alias", []byte(fmt.Sprintf(`{"questId":%q}`, questID)))
	alias, _ := redrive(aliasID)
	if alias.Before == nil || alias.Before.QuestId != nil || alias.Before.DesiredRevision != nil {
		t.Fatalf("retired questId alias matched a quest: %+v", alias.Before)
	}
}

func TestReadAdminOperationsReturnsLatestMaintenanceJobPerKind(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	older := time.Date(2026, 10, 20, 1, 0, 0, 0, time.UTC)
	latest := time.Date(2026, 10, 21, 2, 0, 0, 0, time.UTC)
	reconcileAt := time.Date(2026, 10, 21, 3, 0, 0, 0, time.UTC)
	insert := func(key, kind, lane, state string, code *string, at time.Time) {
		t.Helper()
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO background_jobs(job_key,kind,lane,state,safe_error_code,updated_at) VALUES($1,$2,$3,$4,$5,$6)`, key, kind, lane, state, code, at); err != nil {
			t.Fatal(err)
		}
	}
	insert("maintenance-gametime-old", "gametime_fill", "maintenance", "succeeded", nil, older)
	insert("maintenance-gametime-new", "gametime_fill", "maintenance", "repair_required", ptrString("DISCORD_NOT_CONFIGURED"), latest)
	insert("maintenance-reconcile", "reconcile_dry_run", "maintenance", "queued", nil, reconcileAt)
	insert("not-maintenance", "quest_discord_delivery", "discord", "dead", ptrString("DISCORD_PERMISSION"), latest)

	view, err := adapter.ReadAdminOperations(ctx, auth.Authority{}, AdminOperationsSpec{Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(view.ScheduledWork) != 2 {
		t.Fatalf("scheduled=%+v, want latest gametime_fill and reconcile_dry_run", view.ScheduledWork)
	}
	fill, reconcile := view.ScheduledWork[0], view.ScheduledWork[1]
	if fill.Kind != "gametime_fill" || fill.Outcome != "repair_required" || !fill.ExpectedSlot.Equal(latest) || fill.SafeErrorCode == nil || *fill.SafeErrorCode != "DISCORD_NOT_CONFIGURED" {
		t.Fatalf("gametime_fill=%+v", fill)
	}
	if reconcile.Kind != "reconcile_dry_run" || reconcile.Outcome != "queued" || !reconcile.ExpectedSlot.Equal(reconcileAt) || reconcile.SafeErrorCode != nil {
		t.Fatalf("reconcile_dry_run=%+v", reconcile)
	}
}

func ptrString(value string) *string { return &value }
