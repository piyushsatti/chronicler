//go:build integration && frontend_acceptance

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

// This opt-in lane requires the supported installed browser environment. It
// never runs a worker, calls OAuth, or restores the shared QA database.
func TestAdminBrowserRetainedJourneys(t *testing.T) {
	script, evidence := os.Getenv("ADMIN_BROWSER_SCRIPT"), os.Getenv("ADMIN_BROWSER_EVIDENCE")
	if !filepath.IsAbs(script) || !filepath.IsAbs(evidence) {
		t.Fatal("explicit absolute ADMIN_BROWSER_SCRIPT and ADMIN_BROWSER_EVIDENCE are required")
	}
	if _, err := os.Stat(script); err != nil {
		t.Fatal(err)
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(evidence, 0o755); err != nil {
		t.Fatal(err)
	}
	attempt, err := os.OpenFile(filepath.Join(evidence, "attempt-started"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal("a fresh per-attempt evidence directory is required:", err)
	}
	if err := attempt.Close(); err != nil {
		t.Fatal(err)
	}
	writeEvidence := func(name string, value any) {
		t.Helper()
		bytes, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(evidence, name), append(bytes, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	inputs := questBrowserRuntimeInputs(t, root)
	writeEvidence("production-inputs-before.json", inputs)
	owned := map[string][]byte{}
	identities := map[string]string{}
	for _, source := range []struct{ path, copy string }{
		{script, "browser-input.mjs"},
		{filepath.Join(root, "apps/api/cmd/api/admin_browser_integration_test.go"), "native-input.go.txt"},
	} {
		raw, err := os.ReadFile(source.path)
		if err != nil {
			t.Fatal(err)
		}
		owned[source.path] = raw
		identities[source.path] = fmt.Sprintf("%x", sha256.Sum256(raw))
		snapshot := filepath.Join(evidence, source.copy)
		if err := os.WriteFile(snapshot, raw, 0o444); err != nil {
			t.Fatal(err)
		}
		owned[snapshot] = raw
		identities[snapshot] = fmt.Sprintf("%x", sha256.Sum256(raw))
	}
	writeEvidence("owned-inputs-before.json", identities)
	t.Cleanup(func() {
		after := questBrowserRuntimeInputs(t, root)
		writeEvidence("production-inputs-after.json", after)
		if !reflect.DeepEqual(inputs, after) {
			t.Error("production inputs changed during Admin browser acceptance")
		}
		identitiesAfter := map[string]string{}
		for source, before := range owned {
			current, err := os.ReadFile(source)
			if err != nil {
				t.Error(err)
				continue
			}
			identitiesAfter[source] = fmt.Sprintf("%x", sha256.Sum256(current))
			if !bytes.Equal(before, current) {
				t.Errorf("owned source changed during Admin browser acceptance: %s", source)
			}
		}
		writeEvidence("owned-inputs-after.json", identitiesAfter)
	})
	ctx := context.Background()
	fixture := newProductFixture(t)
	var api *httptest.Server
	var closeRuntime func()
	port := 0
	t.Cleanup(func() {
		if api != nil {
			api.Close()
		}
		if closeRuntime != nil {
			closeRuntime()
		}
		listeners := map[string]bool{}
		for name, address := range map[string]string{"vite": fmt.Sprintf("127.0.0.1:%d", port), "api": func() string {
			if api != nil {
				return strings.TrimPrefix(api.URL, "http://")
			}
			return ""
		}()} {
			if address == "" || strings.HasSuffix(address, ":0") {
				continue
			}
			connection, err := net.DialTimeout("tcp", address, time.Second)
			listeners[name] = errors.Is(err, syscall.ECONNREFUSED)
			if connection != nil {
				connection.Close()
			}
			if !listeners[name] {
				t.Errorf("owned %s listener did not refuse connection after cleanup: %v", name, err)
			}
		}
		if err := fixture.close(); err != nil {
			t.Errorf("drop admin browser fixture: %v", err)
			return
		}
		var databases int
		if err := fixture.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, fixture.databaseName).Scan(&databases); err != nil || databases != 0 {
			t.Errorf("fixture database remains: count=%d err=%v", databases, err)
		}
		writeEvidence("native-cleanup.json", map[string]any{"at": time.Now().UTC(), "database": fixture.databaseName, "databaseDropped": databases == 0, "apiStarted": api != nil, "apiClosed": api != nil, "listenersClosed": listeners})
	})
	rows := &authorityDBFixture{pool: fixture.pool}
	var existing int
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM documents)`).Scan(&existing); err != nil || existing != 0 {
		t.Fatalf("migrations-only fixture was not empty: count=%d err=%v", existing, err)
	}
	members := make([]map[string]any, 0, 51)
	addMember := func(handle string, roles ...auth.Role) authorityDBMember {
		member := rows.member(t, roles...)
		rows.exec(t, `UPDATE members SET handle=$2,display_name=$2,joined_at=$3 WHERE id=$1`, member.rowID, handle, time.Date(2026, 1, 1, 0, len(members), 0, 0, time.UTC))
		members = append(members, map[string]any{"id": member.publicID, "handle": handle, "roles": roles, "status": "active"})
		return member
	}
	admin := addMember("admin-browser-admin", auth.Admin)
	owner := addMember("admin-browser-configured-owner", auth.Player)
	verifier := addMember("admin-browser-verifier", auth.Verifier)
	dm := addMember("admin-browser-dm", auth.DM)
	foreign := addMember("admin-browser-foreign-dm", auth.DM)
	player := addMember("admin-browser-player", auth.Player)
	rows.profile(t, dm, "approved")
	rows.profile(t, foreign, "approved")
	rows.exec(t, `INSERT INTO dm_profiles(member_id,status,review_revision,tagline,philosophy) VALUES($1,'pending',1,'Native review candidate','Public fixture philosophy')`, player.rowID)
	var target authorityDBMember
	for index := 0; index < 45; index++ {
		handle := fmt.Sprintf("admin-browser-directory-%02d", index)
		if index == 0 {
			handle = "admin-browser-role-target"
		}
		member := addMember(handle, auth.Player)
		if index == 0 {
			target = member
		}
		if index == 44 {
			rows.exec(t, `UPDATE members SET status='inactive' WHERE id=$1`, member.rowID)
			members[len(members)-1]["status"] = "inactive"
		}
	}
	var region int64
	regionID, classID, speciesID, backstoryID, anchorID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Admin browser Region','server') RETURNING id`, regionID).Scan(&region); err != nil {
		t.Fatal(err)
	}
	rows.exec(t, `INSERT INTO creation_catalog(public_id,kind,code,name,description,introduced_by_region_id) VALUES($1,'class','admin-browser-class','Admin browser class','Initial class description',$3),($2,'species','admin-browser-species','Admin browser species','Initial species description',NULL)`, classID, speciesID, region)
	rows.exec(t, `INSERT INTO backstories(public_id,name,lore,cohort,source_region_id) VALUES($1,'Admin browser backstory','Initial native lore','player',$2)`, backstoryID, region)
	anchorAt := time.Date(2026, 10, 1, 7, 44, 15, 123456000, time.UTC)
	rows.exec(t, `INSERT INTO time_anchors(public_id,real_utc,epoch_day,rate,note) VALUES($1,$2,100,1,'Initial native anchor')`, anchorID, anchorAt)
	calendar := `{"era":{"name":"Admin fixture era","abbrev":"AF"},"days_per_week":7,"weekdays":["One","Two","Three","Four","Five","Six","Seven"],"periods":[{"name":"Fixture month","type":"month","days":30}],"rate_real_days_per_game_day":1,"moons":[{"name":"Fixture moon","cycle_days":28}],"fixture_extra":{"keep":"retained"}}`
	rows.exec(t, `INSERT INTO game_calendar(id,definition) VALUES(1,$1::jsonb)`, calendar)
	rows.exec(t, `INSERT INTO game_time_map(real_date,game_day) VALUES(CURRENT_DATE-1,99),(CURRENT_DATE,100)`)
	rows.exec(t, `INSERT INTO site_settings(key,payload) VALUES('home_banner','{"enabled":true,"title":"Initial native banner","body":"Initial native body","ctaLabel":"Quest board","ctaHref":"/quests","mediaKind":"fixture-reference","mediaUrl":"https://example.invalid/admin-fixture","mediaLabel":"Initial media reference"}')`)
	documents := make([]map[string]any, 0, 29)
	addDocument := func(kind, category, slug, title, body string, author authorityDBMember) (int64, string) {
		id := uuid.NewString()
		var row int64
		var categoryValue any
		if category != "" {
			categoryValue = category
		}
		frontmatter := "{}"
		if category == "dm_table" {
			frontmatter = "blurb: Native Admin dashboard fixture\ntags:\n  - fixture\n"
		}
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,category,slug,title,body,author_id,status,visibility,policy,frontmatter_yaml) VALUES($1,$2,$3,$4,$5,$6,$7,'published','public',NULL,$8) RETURNING id`, id, kind, categoryValue, slug, title, body, author.rowID, frontmatter).Scan(&row); err != nil {
			t.Fatal(err)
		}
		documents = append(documents, map[string]any{"id": id, "kind": kind, "category": categoryValue, "slug": slug, "title": title, "authorId": author.publicID, "status": "published", "visibility": "public", "policy": nil})
		return row, id
	}
	_, ownTableID := addDocument("community", "dm_table", "admin-browser-dm-table", "Admin browser own table", "Native own table body", dm)
	_, foreignTableID := addDocument("community", "dm_table", "admin-browser-foreign-table", "Admin browser foreign table", "Native foreign table body", foreign)
	quests := make([]map[string]any, 0, 27)
	deliveries := make([]map[string]any, 0, 26)
	for index := 0; index < 27; index++ {
		questID := uuid.NewString()
		actor, title := dm, fmt.Sprintf("Admin browser own quest %02d", index+1)
		code := fmt.Sprintf("admin-browser-quest-%02d", index+1)
		if index == 26 {
			actor, title, code = foreign, "Admin browser foreign quest", "admin-browser-foreign-quest"
		}
		brief, briefID := addDocument("quest_brief", "", "quest-"+strings.ReplaceAll(questID, "-", ""), title, "Native admin quest brief", actor)
		var questRow int64
		applied := 0
		if index == 25 {
			applied = 1
		}
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by,discord_desired_revision,discord_applied_revision) VALUES($1,$2,ARRAY['standard'],'closed',$3,CURRENT_DATE-($4::int*interval '1 day'),$5,$3,1,$6) RETURNING id`, questID, code, actor.rowID, index+1, brief, applied).Scan(&questRow); err != nil {
			t.Fatal(err)
		}
		quests = append(quests, map[string]any{"id": questID, "shortCode": code, "dmId": actor.publicID, "briefId": briefID, "title": title, "status": "closed"})
		if index == 26 {
			continue
		}
		payload, err := json.Marshal(jobs.QuestDiscordPayload{ID: questRow, PublicID: questID, DesiredRevision: 1})
		if err != nil {
			t.Fatal(err)
		}
		state, attempts := "dead", jobs.DiscordMaxAttempts
		if index == 25 {
			state, attempts = "succeeded", 1
		}
		jobID := uuid.NewString()
		rows.exec(t, `INSERT INTO background_jobs(public_id,job_key,kind,lane,state,attempts,lease_token,payload,updated_at) VALUES($1,$2,'quest_discord_delivery','discord',$3,$4,1,$5::jsonb,clock_timestamp()-($6::int*interval '1 second'))`, jobID, jobs.QuestDiscordKey(questID), state, attempts, payload, index)
		deliveries = append(deliveries, map[string]any{"id": jobID, "questId": questID, "state": state, "payload": json.RawMessage(payload), "providerCalled": false})
	}
	rows.exec(t, `INSERT INTO bot_heartbeats(payload,received_at) VALUES('{"fixture":"admin-browser"}',clock_timestamp()-interval '10 minutes')`)
	writeEvidence("native-inventory.json", map[string]any{"database": fixture.databaseName, "members": members, "memberCount": len(members), "documents": documents, "quests": quests, "primaryDmQuestCount": 26, "liveTablesPerDm": 1, "ownTableId": ownTableID, "foreignTableId": foreignTableID, "deliveries": deliveries, "deliveryCount": 26, "expectedActiveAlerts": 26, "regionId": regionID, "classId": classID, "speciesId": speciesID, "backstoryId": backstoryID, "anchorId": anchorID, "anchorRealUtc": anchorAt, "calendar": json.RawMessage(calendar), "roleTargetId": target.publicID, "reviewCandidateId": player.publicID, "workersStarted": false})

	reserved, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port = reserved.Addr().(*net.TCPAddr).Port
	if err := reserved.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-admin-browser-fixture-key", PlatformOwnerMemberID: owner.publicID, CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	rows.cfg = cfg
	runtime := wireForTest(ctx, cfg)
	if runtime.Pool != nil {
		closeRuntime = runtime.Pool.Close
	}
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("production Wire did not bind the isolated fixture")
	}
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)
	api = httptest.NewServer(apiHandler(mux, cfg, runtime.Authority))
	sessions := map[string]map[string]string{}
	for name, actor := range map[string]authorityDBMember{"admin": admin, "owner": owner, "verifier": verifier, "dm": dm, "foreign": foreign, "player": player} {
		// Claims intentionally retain the original roles after the self-revocation
		// journey; production authority still comes from current PostgreSQL rows.
		var roles []auth.Role
		switch name {
		case "admin":
			roles = []auth.Role{auth.Admin}
		case "verifier":
			roles = []auth.Role{auth.Verifier}
		case "dm", "foreign":
			roles = []auth.Role{auth.DM}
		case "player", "owner":
			roles = []auth.Role{auth.Player}
		}
		sessions[name] = map[string]string{"id": actor.publicID, "token": rows.token(t, actor.publicID, roles...)}
	}
	sessionBytes, err := json.Marshal(sessions)
	if err != nil {
		t.Fatal(err)
	}
	commandCtx, cancel := context.WithTimeout(ctx, 240*time.Second)
	defer cancel()
	command := exec.CommandContext(commandCtx, node, filepath.Join(evidence, "browser-input.mjs"))
	command.Env = append(os.Environ(), "ADMIN_API_ORIGIN="+api.URL, "ADMIN_VITE_PORT="+strconv.Itoa(port), "ADMIN_REPO_ROOT="+root)
	command.Stdin = bytes.NewReader(sessionBytes)
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error { return syscall.Kill(-command.Process.Pid, syscall.SIGTERM) }
	command.WaitDelay = 5 * time.Second
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	if err := command.Start(); err != nil {
		t.Fatal("start native Admin browser acceptance:", err)
	}
	writeEvidence("native-host.json", map[string]any{"at": time.Now().UTC(), "goPid": os.Getpid(), "nodePid": command.Process.Pid, "apiOrigin": api.URL, "webOrigin": fmt.Sprintf("http://127.0.0.1:%d", port), "credentials": "stdin only"})
	browserErr := command.Wait()
	writeEvidence("native-child-ended.json", map[string]any{"at": time.Now().UTC(), "nodePid": command.Process.Pid, "waitReturned": true, "success": browserErr == nil})
	if browserErr != nil {
		t.Fatal("native Admin browser acceptance:", browserErr)
	}
	var browserReceipt struct {
		Complete, BrowserClosed, ViteClosed bool
		Journeys                            []struct {
			Actor        string
			OwnerCommand *struct {
				ActorID, Key     string
				Original, Replay json.RawMessage
			}
		}
	}
	receipt, err := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(receipt, &browserReceipt); err != nil {
		t.Fatal("native Admin browser acceptance:", err)
	}
	if !browserReceipt.Complete || !browserReceipt.BrowserClosed || !browserReceipt.ViteClosed {
		t.Fatal("Admin browser did not complete and close all resources")
	}
	assertCount := func(query string, want int, args ...any) {
		t.Helper()
		var count int
		if err := fixture.pool.QueryRow(ctx, query, args...).Scan(&count); err != nil || count != want {
			t.Fatalf("native readback count=%d, want %d: %v", count, want, err)
		}
	}
	assertCount(`SELECT count(*) FROM site_settings WHERE key='home_banner' AND payload->>'title'='Configured owner saved banner' AND payload->>'body'='Admin browser saved body' AND payload->>'mediaKind'='fixture-reference' AND payload->>'mediaLabel'='Admin media reference'`, 1)
	assertCount(`SELECT count(*) FROM creation_catalog WHERE public_id=$1 AND name='Admin browser revised class' AND description='Browser persisted catalog description' AND available=false AND retired=true AND introduced_by_region_id=$2`, 1, classID, region)
	assertCount(`SELECT count(*) FROM creation_catalog WHERE kind='background' AND name='Admin browser created background' AND introduced_by_region_id=$1`, 1, region)
	assertCount(`SELECT count(*) FROM backstories WHERE public_id=$1 AND name='Admin browser revised backstory' AND lore='Native browser lore readback' AND cohort='player' AND source_region_id=$2`, 1, backstoryID, region)
	assertCount(`SELECT count(*) FROM time_anchors WHERE public_id=$1 AND real_utc=$2 AND epoch_day=100 AND rate=1 AND note='Native browser anchor readback'`, 1, anchorID, anchorAt)
	assertCount(`SELECT count(*) FROM game_time_map WHERE real_date=CURRENT_DATE-1 AND game_day=99`, 1)
	assertCount(`SELECT count(*) FROM game_time_map WHERE real_date>=CURRENT_DATE AND real_date<CURRENT_DATE+30`, 30)
	assertCount(`SELECT count(*) FROM dm_profiles WHERE member_id=$1 AND status='approved' AND review_revision=2`, 1, player.rowID)
	assertCount(`SELECT count(*) FROM verifications WHERE subject_type='dm_profile' AND subject_id=$1 AND verdict='approved' AND decided_by=$2 AND review_revision=1`, 1, player.rowID, verifier.rowID)
	assertCount(`SELECT count(*) FROM members WHERE public_id=$1 AND roles=ARRAY['lieutenant','player']::text[]`, 1, target.publicID)
	assertCount(`SELECT count(*) FROM members WHERE public_id=$1 AND roles=ARRAY['player']::text[]`, 1, admin.publicID)
	ownerJourneys := 0
	ownerKey := ""
	for _, journey := range browserReceipt.Journeys {
		if journey.Actor != "owner" {
			continue
		}
		ownerJourneys++
		proof := journey.OwnerCommand
		if proof == nil || proof.ActorID != owner.publicID || proof.Key == "" || !bytes.Equal(proof.Original, proof.Replay) {
			t.Fatal("configured owner original/replay acknowledgement proof missing or different")
		}
		ownerKey = proof.Key
	}
	if ownerJourneys != 1 {
		t.Fatalf("configured owner journeys=%d want1", ownerJourneys)
	}
	currentOwner, err := runtime.Authority(ctx, owner.publicID)
	if err != nil || !currentOwner.IsPlatformOwner() || !reflect.DeepEqual(currentOwner.Claims().Roles, []auth.Role{auth.Player}) {
		t.Fatalf("configured Player owner authority changed: err=%v", err)
	}
	assertCount(`SELECT count(*) FROM members WHERE id=$1 AND roles=ARRAY['player']::text[] AND status='active'`, 1, owner.rowID)
	assertCount(`SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:updateHomeBanner' AND completed_at IS NOT NULL`, 1, owner.rowID)
	assertCount(`SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:updateHomeBanner' AND key=$2 AND completed_at IS NOT NULL AND receipt->>'Title'='Configured owner saved banner'`, 1, owner.rowID, ownerKey)
	var encodedFacts json.RawMessage
	var bannerAt time.Time
	if err := fixture.pool.QueryRow(ctx, `SELECT k.receipt->'_authorizationOverrides',s.updated_at FROM idempotency_keys k CROSS JOIN site_settings s WHERE k.actor_id=$1 AND k.endpoint='graphql:updateHomeBanner' AND k.key=$2 AND k.completed_at IS NOT NULL AND s.key='home_banner'`, owner.rowID, ownerKey).Scan(&encodedFacts, &bannerAt); err != nil {
		t.Fatal(err)
	}
	var facts []idempotency.CommandOverrideFact
	if err := idempotency.StrictJSON(encodedFacts, &facts); err != nil || len(facts) != 1 {
		t.Fatalf("configured owner durable facts=%s err=%v", encodedFacts, err)
	}
	fact := facts[0]
	if fact.ActorID != owner.publicID || fact.Operation != "Mutation.updateHomeBanner" || fact.SubjectType != "site" || fact.SubjectID != "home_banner" || fact.RuleCode != "ROLE" || fact.At.IsZero() || !fact.At.Equal(fact.At.Truncate(time.Microsecond)) || !fact.At.Equal(bannerAt) {
		t.Fatalf("configured owner fact mismatch: %+v siteAt=%s", fact, bannerAt)
	}
	if _, offset := fact.At.Zone(); offset != 0 {
		t.Fatal("configured owner fact clock must be UTC")
	}
	assertCount(`SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:updateHomeBanner' AND completed_at IS NOT NULL AND NOT(receipt ? '_authorizationOverrides')`, 1, admin.rowID)
	assertCount(`SELECT count(*) FROM background_jobs WHERE kind='quest_discord_delivery' AND redrive_count=0 AND ((state='dead' AND attempts=$1) OR (state='succeeded' AND attempts=1))`, 26, jobs.DiscordMaxAttempts)
	var auditMissing bool
	if err := fixture.pool.QueryRow(ctx, `SELECT to_regclass('auth_override_audit') IS NULL`).Scan(&auditMissing); err != nil || !auditMissing {
		t.Fatalf("unexpected separate audit table: missing=%v err=%v", auditMissing, err)
	}
	var stored json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT definition FROM game_calendar WHERE id=1`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	var actual, expected any
	if err := json.Unmarshal(stored, &actual); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(strings.Replace(calendar, `"abbrev":"AF"`, `"abbrev":"AB"`, 1)), &expected); err != nil || !reflect.DeepEqual(actual, expected) {
		t.Fatalf("calendar fields/extras changed: err=%v actual=%s", err, stored)
	}
	writeEvidence("native-readback.json", map[string]any{"at": time.Now().UTC(), "mutationsReadBack": true, "ownerWritePersisted": true, "ownerExactReplay": true, "ownerOverrideFactCount": len(facts), "ownerOverrideFact": fact, "separateAuditTableAbsent": true, "selfRoleRevoked": true, "futureProjectionCells": 30, "calendarExtrasPreserved": true})
}
