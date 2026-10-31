//go:build integration

package site

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		_, _ = os.Stderr.WriteString("close product fixture: " + err.Error() + "\n")
		if code == 0 {
			code = 1
		}
	}
	os.Exit(code)
}

var siteProductMacro = regexp.MustCompile(`sqlc\.(?:n?arg)\(([a-z_]+)\)`)
var siteProductNamedArg = regexp.MustCompile(`@([a-z_]+)`)

func siteProductSQL(t *testing.T, name, mode string) string {
	t.Helper()
	data, err := os.ReadFile("../../db/queries/site_product.sql")
	if err != nil {
		t.Fatal(err)
	}
	matches := 0
	var query string
	for _, part := range strings.Split(string(data), "-- name: ")[1:] {
		header, body, ok := strings.Cut(part, "\n")
		if !ok {
			continue
		}
		fields := strings.Fields(header)
		if len(fields) > 0 && fields[0] == name {
			matches++
			if strings.TrimSpace(header) != name+" "+mode {
				t.Fatalf("wrong annotation for %s: %q", name, header)
			}
			query = strings.TrimSpace(body)
		}
	}
	if matches != 1 {
		t.Fatalf("named Site SQL %s occurrence count=%d, want exactly one", name, matches)
	}
	return siteProductMacro.ReplaceAllString(query, "@$1")
}

func siteProductArgs(t *testing.T, query string, values pgx.StrictNamedArgs) pgx.StrictNamedArgs {
	t.Helper()
	want := map[string]struct{}{}
	for _, match := range siteProductNamedArg.FindAllStringSubmatch(query, -1) {
		want[match[1]] = struct{}{}
	}
	if len(want) != len(values) {
		t.Fatalf("query has %d unique named args, received %d keyed values", len(want), len(values))
	}
	for name := range want {
		if _, ok := values[name]; !ok {
			t.Fatalf("query argument %q has no keyed value", name)
		}
	}
	for name := range values {
		if _, ok := want[name]; !ok {
			t.Fatalf("keyed value %q is unused by query", name)
		}
	}
	return values
}

func TestPhase3TaskSIT03CommunitySnapshotUsesStoredCountsAndRoleMembership(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	insertMember := func(discordID, handle string, roles []string) (int64, uuid.UUID) {
		t.Helper()
		var id int64
		var publicID uuid.UUID
		err := fixture.Pool.QueryRow(ctx,
			`INSERT INTO members(discord_id,handle,display_name,roles,status)
			 VALUES($1,$2,$2,$3,'active') RETURNING id,public_id`,
			discordID, handle, roles).Scan(&id, &publicID)
		if err != nil {
			t.Fatal(err)
		}
		return id, publicID
	}
	playerID, _ := insertMember("sit03-player", "sit03-player", []string{"player"})
	dmID, _ := insertMember("sit03-dm", "sit03-dm", []string{"dm", "player"})
	_, _ = insertMember("sit03-multi-role", "sit03-multi-role", []string{"player", "dm"})
	if _, err := fixture.Pool.Exec(ctx,
		`INSERT INTO dm_profiles(member_id,status) VALUES($1,'approved')`, dmID); err != nil {
		t.Fatalf("insert approved DM profile: %v", err)
	}
	var regionID, mapID, documentID int64
	if err := fixture.Pool.QueryRow(ctx,
		`INSERT INTO regions(name,kind) VALUES('SIT03 region','server') RETURNING id`).Scan(&regionID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx,
		`INSERT INTO maps(name,atlas_code,map_kind,region_id)
		 VALUES('SIT03 map','SIT03-MAP','pointcrawl',$1) RETURNING id`, regionID).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx,
		`INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) VALUES($1,'SIT03 node',0,0,'2026-10-17T00:00:00Z')`, mapID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx,
		`INSERT INTO characters(short_code,name,owner_id,status)
		 VALUES('SIT03-C','SIT03 Character',$1,'active')`, playerID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx,
		`INSERT INTO documents(kind,slug,title,status,visibility,author_id)
		 VALUES('quest_brief','sit03-brief','SIT03 brief','published','public',$1) RETURNING id`, dmID).Scan(&documentID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx,
		`INSERT INTO quests(short_code,kinds,dm_id,scheduled_at,document_id,created_by)
		 VALUES('SIT03-Q',ARRAY['standard'],$1,'2030-01-01T00:00:00Z',$2,$1)`, dmID, documentID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx,
		`INSERT INTO discord_activity_events(event_id,kind,discord_user_id,channel_id,occurred_at,amount)
		 VALUES('sit03-voice','voice','discord-player','channel','2026-10-17T00:00:00Z',12.5),
		       ('sit03-message','message','discord-player','channel','2026-10-17T00:00:00Z',3),
		       ('sit03-reaction','reaction','discord-player','channel','2026-10-17T00:00:00Z',2)`); err != nil {
		t.Fatal(err)
	}
	query := siteProductSQL(t, "SiteCommunitySnapshot", ":many")
	rows, err := fixture.Pool.Query(ctx, query)
	if err != nil {
		t.Fatalf("execute community snapshot SQL: %v", err)
	}
	defer rows.Close()
	roles := map[string]int32{}
	var totals struct {
		members, characters, maps, nodes, regions, quests, dms int32
		voice, messages, reactions                             float64
	}
	rowCount := 0
	for rows.Next() {
		var role *string
		var membersByRole *int32
		if err := rows.Scan(&totals.members, &totals.characters, &totals.maps,
			&totals.nodes, &totals.regions, &totals.quests, &totals.dms,
			&role, &membersByRole); err != nil {
			t.Fatal(err)
		}
		rowCount++
		if role != nil && membersByRole != nil {
			roles[*role] = *membersByRole
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if rowCount != 2 || totals.members != 3 || totals.characters != 1 || totals.maps != 1 ||
		totals.nodes != 1 || totals.regions != 1 || totals.quests != 1 || totals.dms != 1 {
		t.Fatalf("snapshot totals rows=%d got=%+v, want stored counts for fixture", rowCount, totals)
	}
	if roles["player"] != 3 || roles["dm"] != 2 {
		t.Fatalf("member role counts=%v, want player=3 dm=2", roles)
	}
	if err := fixture.Pool.QueryRow(ctx, siteProductSQL(t, "SiteActivitySummary", ":one")).Scan(&totals.voice, &totals.messages, &totals.reactions); err != nil {
		t.Fatal(err)
	}
	if totals.voice != 12.5 || totals.messages != 3 || totals.reactions != 2 {
		t.Fatalf("activity totals=%+v, want stored event sums", totals)
	}
}

func TestPhase3TaskSIT03MemberDiscoveryCountsLiteralUnicodePrefixesAndPagesInOrder(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	for _, member := range []struct{ discordID, handle, display string }{
		{"sit03-unicode-upper", "Éclair", "Upper"},
		{"sit03-unicode-lower", "école", "Lower"},
		{"sit03-wildcard", "%_needle", "Wildcard"},
		{"sit03-backslash", `\needle`, "Backslash"},
		{"sit03-other", "zebra", "Other"},
	} {
		if _, err := fixture.Pool.Exec(ctx,
			`INSERT INTO members(discord_id,handle,display_name,roles)
			 VALUES($1,$2,$3,ARRAY['player'])`, member.discordID, member.handle, member.display); err != nil {
			t.Fatal(err)
		}
	}
	query := siteProductSQL(t, "SiteMemberDiscovery", ":many")
	read := func(prefix string, limit, offset int32) (int32, []string) {
		t.Helper()
		rows, err := fixture.Pool.Query(ctx, query, siteProductArgs(t, query, pgx.StrictNamedArgs{
			"query": prefix, "page_limit": limit, "page_offset": offset,
		}))
		if err != nil {
			t.Fatalf("search prefix %q: %v", prefix, err)
		}
		defer rows.Close()
		var total int32
		var handles []string
		for rows.Next() {
			var id *uuid.UUID
			var handle, display *string
			var avatar *string
			if err := rows.Scan(&total, &id, &handle, &display, &avatar); err != nil {
				t.Fatal(err)
			}
			if handle != nil {
				handles = append(handles, *handle)
			}
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return total, handles
	}
	if total, got := read("é", 1, 0); total != 2 || len(got) != 1 || got[0] != "Éclair" {
		t.Fatalf("unicode first page total=%d handles=%v, want total=2 page=[Éclair]", total, got)
	}
	if total, got := read("é", 1, 1); total != 2 || len(got) != 1 || got[0] != "école" {
		t.Fatalf("unicode second page total=%d handles=%v, want total=2 page=[école]", total, got)
	}
	if total, got := read("%_", 10, 0); total != 1 || len(got) != 1 || got[0] != "%_needle" {
		t.Fatalf("escaped wildcard prefix total=%d handles=%v, want literal %%_ match", total, got)
	}
	if total, got := read(`\`, 10, 0); total != 1 || len(got) != 1 || got[0] != `\needle` {
		t.Fatalf("escaped backslash prefix total=%d handles=%v, want literal backslash match", total, got)
	}
}

func TestPhase3TaskSIT03SettingReplacementPersistsAndRollsBackWithCaller(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	testSetting := func(settingKey, initial, replacement string, at time.Time) {
		t.Helper()
		ensure := siteProductSQL(t, "SiteEnsureSetting", ":execrows")
		if _, err := fixture.Pool.Exec(ctx, ensure, siteProductArgs(t, ensure, pgx.StrictNamedArgs{
			"setting_key": settingKey, "initial_payload": initial, "at": at.Add(-time.Hour),
		})); err != nil {
			t.Fatalf("ensure %s setting: %v", settingKey, err)
		}
		if _, err := fixture.Pool.Exec(ctx, ensure, siteProductArgs(t, ensure, pgx.StrictNamedArgs{
			"setting_key": settingKey, "initial_payload": `{"unexpected":true}`, "at": at,
		})); err != nil {
			t.Fatalf("re-ensure %s setting: %v", settingKey, err)
		}
		lock := siteProductSQL(t, "SiteLockSetting", ":one")
		replace := siteProductSQL(t, "SiteReplaceSetting", ":one")
		tx, err := fixture.Pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var beforeKey string
		var beforePayload []byte
		var beforeAt time.Time
		if err := tx.QueryRow(ctx, lock, siteProductArgs(t, lock, pgx.StrictNamedArgs{"setting_key": settingKey})).Scan(&beforeKey, &beforePayload, &beforeAt); err != nil {
			t.Fatalf("lock %s setting: %v", settingKey, err)
		}
		if beforeKey != settingKey || !beforeAt.Equal(at.Add(-time.Hour)) {
			t.Fatalf("locked setting key/time=%q/%s", beforeKey, beforeAt)
		}
		if !equalJSON(beforePayload, []byte(initial)) {
			t.Fatalf("re-ensuring %s changed its stored payload to %s, want %s", settingKey, beforePayload, initial)
		}
		var afterKey string
		var afterPayload []byte
		var updatedAt time.Time
		if err := tx.QueryRow(ctx, replace, siteProductArgs(t, replace, pgx.StrictNamedArgs{
			"setting_key": settingKey, "payload": replacement, "at": at,
		})).Scan(&afterKey, &afterPayload, &updatedAt); err != nil {
			t.Fatalf("replace %s setting: %v", settingKey, err)
		}
		if afterKey != settingKey || !updatedAt.Equal(at) || !equalJSON(afterPayload, []byte(replacement)) {
			t.Fatalf("replacement key/payload/time=%q/%s/%s", afterKey, afterPayload, updatedAt)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatalf("commit caller-owned setting transaction: %v", err)
		}
		read := siteProductSQL(t, "SiteReadSetting", ":one")
		var readKey string
		var readPayload []byte
		var readAt time.Time
		if err := fixture.Pool.QueryRow(ctx, read, siteProductArgs(t, read, pgx.StrictNamedArgs{"setting_key": settingKey})).Scan(&readKey, &readPayload, &readAt); err != nil {
			t.Fatalf("read replacement for %s setting: %v", settingKey, err)
		}
		if readKey != settingKey || !equalJSON(readPayload, []byte(replacement)) || !readAt.Equal(at) {
			t.Fatalf("read setting key/payload/time=%q/%s/%s", readKey, readPayload, readAt)
		}
	}
	testSetting("home_banner",
		`{"enabled":true,"body":"Read the ledger","ctaHref":"/codex/lore-river","ctaLabel":"Read","mediaKind":null,"mediaLabel":null,"mediaUrl":null,"title":"Welcome"}`,
		`{"enabled":false,"body":"The bridge reopens","ctaHref":null,"ctaLabel":null,"mediaKind":"illustration","mediaLabel":"North bridge","mediaUrl":"/assets/bridge.webp","title":"News"}`,
		time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC))
	testSetting("quest_announcement_role",
		`{"enabled":true,"roleId":"123456789"}`,
		`{"enabled":false,"roleId":null}`,
		time.Date(2026, 10, 17, 13, 0, 0, 0, time.UTC))

	rollbackKey := "home_banner"
	replace := siteProductSQL(t, "SiteReplaceSetting", ":one")
	tx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var before []byte
	if err := tx.QueryRow(ctx, `SELECT payload FROM site_settings WHERE key=$1 FOR UPDATE`, rollbackKey).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, replace, siteProductArgs(t, replace, pgx.StrictNamedArgs{
		"setting_key": rollbackKey, "payload": `{"enabled":true,"title":"rolled back"}`,
		"at": time.Date(2026, 10, 17, 14, 0, 0, 0, time.UTC),
	})); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback caller-owned transaction: %v", err)
	}
	var stored []byte
	if err := fixture.Pool.QueryRow(ctx, `SELECT payload FROM site_settings WHERE key=$1`, rollbackKey).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if !equalJSON(stored, before) {
		t.Fatalf("caller rollback left payload %s, want %s", stored, before)
	}

}

func TestSiteActiveAlertsUseRetainedDiagnosticsDestination(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	var jobID string
	if err := fixture.Pool.QueryRow(ctx, `
		INSERT INTO background_jobs(job_key,kind,lane,state,attempts,payload)
		VALUES('site-diagnostics-fixture','gametime_fill','maintenance','dead',5,
		       jsonb_build_object('slot',to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI')))
		RETURNING public_id::text`).Scan(&jobID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO bot_heartbeats(received_at) VALUES(clock_timestamp()-interval '10 minutes')`); err != nil {
		t.Fatal(err)
	}
	query := siteProductSQL(t, "SiteActiveAlerts", ":many")
	readPage := func(limit, offset int32) []dbgen.SiteActiveAlertsRow {
		t.Helper()
		rows, err := fixture.Pool.Query(ctx, query, siteProductArgs(t, query, pgx.StrictNamedArgs{"page_limit": limit, "page_offset": offset}))
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var result []dbgen.SiteActiveAlertsRow
		for rows.Next() {
			var row dbgen.SiteActiveAlertsRow
			if err := rows.Scan(&row.Total, &row.Key, &row.Label, &row.Severity, &row.RemediationHref, &row.FirstSeenAt, &row.LastSeenAt); err != nil {
				t.Fatal(err)
			}
			result = append(result, row)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return result
	}
	assertCount := func(want int32) {
		t.Helper()
		var count int32
		if err := fixture.Pool.QueryRow(ctx, siteProductSQL(t, "SiteActiveAlertCount", ":one")).Scan(&count); err != nil || count != want {
			t.Fatalf("active alert count=%d, want %d: %v", count, want, err)
		}
	}
	wantKeys := []string{"job:" + jobID + ":state:dead", "bot:heartbeat:stale"}
	rows := readPage(10, 0)
	if len(rows) != 2 {
		t.Fatalf("alert rows=%+v, want both job and heartbeat producers", rows)
	}
	for index, row := range rows {
		if row.Total != 2 || !row.Key.Valid || row.Key.String != wantKeys[index] || !row.RemediationHref.Valid || row.RemediationHref.String != "/admin/data-health" {
			t.Fatalf("alert row=%+v, want retained diagnostics destination", row)
		}
	}
	assertCount(2)
	second := readPage(1, 1)
	if len(second) != 1 || second[0].Total != 2 || second[0].Key.String != wantKeys[1] || second[0].RemediationHref.String != "/admin/data-health" {
		t.Fatalf("second page=%+v", second)
	}
	past := readPage(1, 2)
	if len(past) != 1 || past[0].Total != 2 || past[0].Key.Valid {
		t.Fatalf("past-end page=%+v, want retained total and no phantom alert", past)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE bot_heartbeats SET received_at=clock_timestamp()`); err != nil {
		t.Fatal(err)
	}
	fresh := readPage(10, 0)
	if len(fresh) != 1 || fresh[0].Total != 1 || fresh[0].Key.String != wantKeys[0] || fresh[0].RemediationHref.String != "/admin/data-health" {
		t.Fatalf("fresh heartbeat page=%+v, want only the job alert", fresh)
	}
	assertCount(1)
}

func equalJSON(left, right []byte) bool {
	var leftValue, rightValue any
	if json.Unmarshal(left, &leftValue) != nil || json.Unmarshal(right, &rightValue) != nil {
		return false
	}
	return reflect.DeepEqual(leftValue, rightValue)
}
