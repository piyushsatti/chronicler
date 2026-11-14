//go:build integration && frontend_acceptance

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
)

// TestAccountBrowserRetainedJourneys uses migration-only disposable PostgreSQL,
// the mounted application, and stdin-only test JWTs. It never invokes OAuth.
func TestAccountBrowserRetainedJourneys(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("Account acceptance requires a disposable fixture, not DATABASE_URL reuse")
	}
	liveDDBOption := os.Getenv("ACCOUNT_BROWSER_LIVE_DDB")
	if liveDDBOption != "" && liveDDBOption != "public-premade-152579009" {
		t.Fatal("ACCOUNT_BROWSER_LIVE_DDB must be unset or public-premade-152579009")
	}
	liveDDB := liveDDBOption != ""
	script, evidence := os.Getenv("ACCOUNT_BROWSER_SCRIPT"), os.Getenv("ACCOUNT_BROWSER_EVIDENCE")
	if !filepath.IsAbs(script) || !filepath.IsAbs(evidence) {
		t.Fatal("absolute ACCOUNT_BROWSER_SCRIPT and ACCOUNT_BROWSER_EVIDENCE are required")
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(evidence, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"owned-inputs.json", "production-inputs-before.json", "browser-receipt.json"} {
		if _, err := os.Stat(filepath.Join(evidence, name)); !os.IsNotExist(err) {
			t.Fatalf("fresh account-browser/run-N evidence is required; prior artifact %s (%v)", name, err)
		}
	}
	write := func(name string, value any) {
		t.Helper()
		raw, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(evidence, name), append(raw, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	inputs := questBrowserRuntimeInputs(t, root)
	write("production-inputs-before.json", inputs)
	owned := map[string][]byte{}
	identities := map[string]string{}
	scriptCopy := filepath.Join(evidence, "attempt-input-browser.mjs")
	for _, source := range []struct{ path, copy string }{
		{script, scriptCopy},
		{filepath.Join(root, "apps/api/cmd/api/account_browser_integration_test.go"), filepath.Join(evidence, "attempt-input-account_browser_integration_test.go")},
	} {
		raw, err := os.ReadFile(source.path)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(source.copy, raw, 0o444); err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{source.path, source.copy} {
			owned[path] = raw
			identities[path] = fmt.Sprintf("%x", sha256.Sum256(raw))
		}
	}
	write("owned-inputs.json", identities)
	t.Cleanup(func() {
		after := questBrowserRuntimeInputs(t, root)
		write("production-inputs-after.json", after)
		if !reflect.DeepEqual(inputs, after) {
			t.Error("production source changed during acceptance")
		}
		identitiesAfter := map[string]string{}
		for path, before := range owned {
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Errorf("owned source read: %s (%v)", path, err)
				continue
			}
			identitiesAfter[path] = fmt.Sprintf("%x", sha256.Sum256(raw))
			if !bytes.Equal(raw, before) {
				t.Errorf("owned source changed: %s", path)
			}
		}
		write("owned-inputs-after.json", identitiesAfter)
	})
	ctx := context.Background()
	fixture := newProductFixture(t)
	var api *httptest.Server
	var closeRuntime func()
	var listener net.Listener
	port, nodePID := 0, 0
	t.Cleanup(func() {
		if listener != nil {
			if err := listener.Close(); err != nil {
				t.Errorf("close owned port reservation: %v", err)
			}
		}
		if api != nil {
			api.Close()
		}
		if closeRuntime != nil {
			closeRuntime()
		}
		listeners := map[string]bool{}
		addresses := map[string]string{}
		if api != nil {
			addresses["api"] = strings.TrimPrefix(api.URL, "http://")
		}
		if port != 0 {
			addresses["reservedPort"] = fmt.Sprintf("127.0.0.1:%d", port)
		}
		for name, address := range addresses {
			connection, err := net.DialTimeout("tcp", address, time.Second)
			if connection != nil {
				connection.Close()
			}
			listeners[name] = errors.Is(err, syscall.ECONNREFUSED)
			if !listeners[name] {
				t.Errorf("owned %s listener did not refuse connection after cleanup: %v", name, err)
			}
		}
		dropErr := fixture.close()
		if dropErr != nil {
			t.Errorf("drop owned account fixture: %v", dropErr)
		}
		remaining := -1
		absenceErr := fixture.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, fixture.databaseName).Scan(&remaining)
		if absenceErr != nil || remaining != 0 {
			t.Errorf("owned fixture cleanup count=%d error=%v", remaining, absenceErr)
		}
		write("native-cleanup.json", map[string]any{"apiStarted": api != nil, "apiClosed": api != nil, "runtimePoolStarted": closeRuntime != nil, "runtimePoolClosed": closeRuntime != nil, "nodeStarted": nodePID != 0, "listenersClosed": listeners, "databaseDropped": dropErr == nil && absenceErr == nil && remaining == 0, "databaseDropFailed": dropErr != nil, "databaseAbsenceQueryFailed": absenceErr != nil, "databaseRemaining": remaining, "database": fixture.databaseName, "at": time.Now().UTC()})
	})
	var existing int
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM characters)+(SELECT count(*) FROM documents)`).Scan(&existing); err != nil || existing != 0 {
		t.Fatalf("migration-only rows=%d error=%v", existing, err)
	}
	listener, err = net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port = listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	listener = nil
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-account-browser-fixture-key", CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	rows := &authorityDBFixture{pool: fixture.pool, cfg: cfg}
	actors := map[string]authorityDBMember{
		"owner":           rows.member(t, auth.Player, auth.DM),
		"other":           rows.member(t, auth.Player),
		"reviewer":        rows.member(t, auth.Player, auth.Verifier),
		"admin":           rows.member(t, auth.Player, auth.Admin),
		"configuredOwner": rows.member(t, auth.Player),
	}
	cfg.PlatformOwnerMemberID = actors["configuredOwner"].publicID
	rows.cfg = cfg
	tokens, actorIDs := map[string]string{}, map[string]string{}
	for name, actor := range actors {
		rows.exec(t, `UPDATE members SET handle=$2,display_name=$2,status='active' WHERE id=$1`, actor.rowID, "account-fixture-"+strings.ToLower(name))
		actorIDs[name] = actor.publicID
		// Empty claim roles force the real middleware to use current database roles.
		tokens[name] = rows.token(t, actor.publicID)
	}
	tokens["expired"], err = login.Mint(cfg.JWTSecret, login.Claims{MemberID: actors["owner"].publicID, Roles: []auth.Role{auth.Player}, Exp: time.Now().Add(-time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	tokens["falseClaims"], err = login.Mint(cfg.JWTSecret, login.Claims{MemberID: actors["other"].publicID, Roles: []auth.Role{auth.Admin, auth.DM}, Exp: time.Now().Add(time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	owner, admin := actors["owner"], actors["admin"]
	rows.exec(t, `INSERT INTO dm_profiles(member_id,tagline,philosophy,house_rules,table_info,status,review_revision) VALUES($1,'Initial tagline','Initial philosophy','Initial rules','{"opaque":"preserve this value","seats":4}','draft',2)`, owner.rowID)
	regionID, backstoryID := uuid.NewString(), uuid.NewString()
	var region int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Account fixture region','archon') RETURNING id`, regionID).Scan(&region); err != nil {
		t.Fatal(err)
	}
	rows.exec(t, `INSERT INTO backstories(public_id,name,lore,source_region_id) VALUES($1,'Account fixture backstory','Fixture origin',$2)`, backstoryID, region)
	catalog := map[string]string{}
	for _, kind := range []string{"species", "class"} {
		id := uuid.NewString()
		catalog[kind] = id
		rows.exec(t, `INSERT INTO creation_catalog(public_id,kind,code,name,introduced_by_region_id) VALUES($1,$2,$3,$4,$5)`, id, kind, "account-"+kind, "Account fixture "+kind, region)
	}
	characters := map[string]map[string]string{}
	for _, c := range []struct {
		key, code, name string
		member          authorityDBMember
	}{{"mirror", "ACCOUNTMIRROR", "Account fixture mirror", owner}, {"other", "ACCOUNTOTHER", "Account fixture other", actors["other"]}} {
		id := uuid.NewString()
		characters[c.key] = map[string]string{"id": id, "shortCode": c.code, "name": c.name}
		rows.exec(t, `INSERT INTO characters(public_id,short_code,name,owner_id,status,region_id,description,background_text) VALUES($1,$2,$3,$4,'active',$5,'Seeded description','Seeded background')`, id, c.code, c.name, c.member.rowID, region)
	}
	mirrorAt := time.Date(2026, 3, 8, 4, 30, 0, 0, time.UTC)
	mirror := `{"level":3,"xp":900,"armorClass":15,"maxHp":27,"species":"Human","classes":"Fighter 3","background":"Soldier","proficiencies":[]}`
	rows.exec(t, `INSERT INTO character_ddb_mirrors(character_id,payload,synced_at) SELECT id,$2::jsonb,$3 FROM characters WHERE public_id=$1`, characters["mirror"]["id"], mirror, mirrorAt)
	tableID, briefID, questID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	var table, brief, quest int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,category,slug,title,body,status,visibility,author_id,version) VALUES($1,'community','dm_table','account-fixture-table','Account fixture table','Account table original','published','public',$2,20) RETURNING id`, tableID, owner.rowID).Scan(&table); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,slug,title,body,status,visibility,author_id,version) VALUES($1,'quest_brief','account-fixture-brief','Account fixture private brief','Private fixture briefing','published','restricted',$2,1) RETURNING id`, briefID, admin.rowID).Scan(&brief); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO quests(public_id,short_code,kinds,dm_id,created_by,status,scheduled_at,slots_max,filled_count,document_id) VALUES($1,'ACCOUNTQUEST',ARRAY['standard'],$2,$2,'open',$3,4,1,$4) RETURNING id`, questID, owner.rowID, time.Now().UTC().AddDate(0, 0, 2), brief).Scan(&quest); err != nil {
		t.Fatal(err)
	}
	rows.exec(t, `INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)`, quest, region)
	rows.exec(t, `INSERT INTO quest_participants(quest_id,member_id,character_id,status) SELECT $1,$2,id,'signed_up' FROM characters WHERE public_id=$3`, quest, owner.rowID, characters["mirror"]["id"])
	// Seed historical notices with the same paired receipt/source proof mechanism
	// as production. These records are fixture facts, not browser write receipts.
	record := func(event notification.Event, operation string) {
		t.Helper()
		tx, err := fixture.pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx) //nolint:errcheck
		replay, err := idempotency.NewRepository(tx)
		if err != nil {
			t.Fatal(err)
		}
		chars, err := character.NewProductPostgres(tx)
		if err != nil {
			t.Fatal(err)
		}
		docs, err := document.NewProductPostgres(tx)
		if err != nil {
			t.Fatal(err)
		}
		notice, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Character: chars, Document: docs})
		if err != nil {
			t.Fatal(err)
		}
		claim, err := replay.Claim(ctx, event.ActorID, operation, "account-history-"+event.Key, strings.Repeat("a", 64))
		if err != nil {
			t.Fatal(err)
		}
		if claim.Replay {
			t.Fatal("historical fixture key unexpectedly replayed")
		}
		if err := notification.NewProducer().Record(ctx, notice, event); err != nil {
			t.Fatal(err)
		}
		if err := replay.Complete(ctx, claim, json.RawMessage(`{"fixtureHistoricalSource":true}`)); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	ptr := func(value string) *string { return &value }
	base := time.Now().UTC().Add(-time.Hour).Truncate(time.Microsecond)
	for i := 1; i <= 19; i++ {
		revisionID, at := uuid.NewString(), base.Add(time.Duration(i)*time.Second)
		rows.exec(t, `INSERT INTO document_revisions(public_id,document_id,reason,title,body,created_by,created_at,new_value,rev) VALUES($1,$2,'edit','Account fixture table','Historical account table edit',$3,$4,'{}',$5)`, revisionID, table, admin.rowID, at, i)
		record(notification.Event{Key: fmt.Sprintf("table-%02d", i), Kind: notification.DocumentEdited, SubjectType: "document", SubjectID: tableID, ActorID: admin.publicID, OccurredAt: at, Facts: notification.Facts{Version: 1, EventKind: notification.DocumentEdited, RevisionID: ptr(revisionID)}}, "editDocument")
	}
	assessmentID, assessmentAt := uuid.NewString(), base.Add(20*time.Second)
	rows.exec(t, `INSERT INTO verifications(public_id,subject_type,subject_id,verdict,decided_by,created_at) SELECT $1,'character',id,'approved',$3,$4 FROM characters WHERE public_id=$2`, assessmentID, characters["mirror"]["id"], actors["reviewer"].rowID, assessmentAt)
	record(notification.Event{Key: "mirror-approved", Kind: notification.CharacterVerificationDecided, SubjectType: "character", SubjectID: characters["mirror"]["id"], ActorID: actors["reviewer"].publicID, OccurredAt: assessmentAt, Facts: notification.Facts{Version: 1, EventKind: notification.CharacterVerificationDecided, CharacterID: ptr(characters["mirror"]["id"]), VerificationID: ptr(assessmentID), Verdict: ptr("approved")}}, "decideVerification")
	record(notification.Event{Key: "quest-signup", Kind: notification.QuestSignupConfirmed, SubjectType: "quest", SubjectID: questID, ActorID: owner.publicID, OccurredAt: base.Add(21 * time.Second), Facts: notification.Facts{Version: 1, EventKind: notification.QuestSignupConfirmed, CharacterID: ptr(characters["mirror"]["id"]), ToStatus: ptr("signed_up")}}, "signupForQuest")
	mentionID, mentionAt := uuid.NewString(), base.Add(22*time.Second)
	mentionFacts, _ := json.Marshal(map[string]any{"newMentionMemberIds": []string{owner.publicID}})
	rows.exec(t, `INSERT INTO document_revisions(public_id,document_id,reason,title,body,created_by,created_at,new_value,rev) VALUES($1,$2,'edit','Account fixture private brief','Private mention source',$3,$4,$5::jsonb,1)`, mentionID, brief, admin.rowID, mentionAt, mentionFacts)
	record(notification.Event{Key: "suppressed-mention", Kind: notification.DMMentioned, SubjectType: "document", SubjectID: briefID, ActorID: admin.publicID, OccurredAt: mentionAt, Facts: notification.Facts{Version: 1, EventKind: notification.DMMentioned, RevisionID: ptr(mentionID), NewMentionMemberIDs: []string{owner.publicID}}}, "editDocument")
	var initial json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('members',(SELECT count(*) FROM members),'characters',(SELECT count(*) FROM characters),'documents',(SELECT count(*) FROM documents),'quests',(SELECT count(*) FROM quests),'notifications',(SELECT count(*) FROM notifications),'documentRevisions',(SELECT count(*) FROM document_revisions),'assessments',(SELECT count(*) FROM verifications),'participations',(SELECT count(*) FROM quest_participants),'historicalReceipts',(SELECT count(*) FROM idempotency_keys))`).Scan(&initial); err != nil {
		t.Fatal(err)
	}
	var seeded map[string]int
	if err := json.Unmarshal(initial, &seeded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(seeded, map[string]int{"members": 5, "characters": 2, "documents": 2, "quests": 1, "notifications": 22, "documentRevisions": 20, "assessments": 1, "participations": 1, "historicalReceipts": 22}) {
		t.Fatalf("historical fixture counts: %v", seeded)
	}
	var historicalIDs json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('notifications',(SELECT jsonb_agg(public_id ORDER BY created_at,public_id) FROM notifications),'documentRevisions',(SELECT jsonb_agg(public_id ORDER BY created_at,public_id) FROM document_revisions),'assessment',$1::text,'participation',jsonb_build_object('questId',$2::text,'characterId',$3::text,'status','signed_up'))`, assessmentID, questID, characters["mirror"]["id"]).Scan(&historicalIDs); err != nil {
		t.Fatal(err)
	}
	inventory := map[string]any{"database": fixture.databaseName, "actors": actorIDs, "characters": characters, "regionId": regionID, "backstoryId": backstoryID, "catalog": catalog, "table": map[string]string{"id": tableID, "slug": "account-fixture-table"}, "briefId": briefID, "quest": map[string]string{"id": questID, "shortCode": "ACCOUNTQUEST"}, "mirrorAt": mirrorAt, "initialRows": initial, "historicalSourceIds": historicalIDs, "historicalFixtureNotBrowserCommands": true}
	write("native-inventory.json", inventory)
	runtime := wireForTest(ctx, cfg)
	if runtime.Pool != nil {
		closeRuntime = runtime.Pool.Close
	}
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("actual Wire did not bind fixture")
	}
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)
	const settingsFault = "account_settings_retry_fault"
	if _, err := fixture.pool.Exec(ctx, fmt.Sprintf(`ALTER TABLE idempotency_keys ADD CONSTRAINT %s CHECK (NOT (actor_id=%d AND endpoint='graphql:updateMySettings' AND completed_at IS NOT NULL)) NOT VALID`, settingsFault, owner.rowID)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := fixture.pool.Exec(ctx, `ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS account_settings_retry_fault`); err != nil {
			t.Errorf("remove owned settings fault: %v", err)
		}
	})
	settingsQuery, err := os.ReadFile(filepath.Join(root, "apps/web/src/features/personalize/adapters/updateMySettings.graphql"))
	if err != nil {
		t.Fatal(err)
	}
	readSettingsRow := func() (json.RawMessage, error) {
		var raw json.RawMessage
		err := fixture.pool.QueryRow(ctx, `SELECT coalesce((SELECT to_jsonb(s) FROM member_settings s WHERE member_id=$1),'null'::jsonb)`, owner.rowID).Scan(&raw)
		return raw, err
	}
	settingsBefore, err := readSettingsRow()
	if err != nil {
		t.Fatal(err)
	}
	var settingsMu sync.Mutex
	var firstSettingsInput map[string]any
	settingsRequests := 0
	var settingsRetry struct {
		ActorID, FailedKey, RetryKey, PayloadSHA256 string
		FailedStatus, RetryStatus                   int
		FailedCodes, RetryCodes                     []string
		RolledBack, FaultRemoved, Persisted         bool
		Errors                                      []string
	}
	settingsRetry.ActorID = owner.publicID
	actualHandler := apiHandler(mux, cfg, runtime.Authority)
	api = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/graphql" || r.Header.Get("Authorization") != "Bearer "+tokens["owner"] {
			actualHandler.ServeHTTP(w, r)
			return
		}
		original := r.Body
		raw, readErr := io.ReadAll(io.LimitReader(original, (1<<20)+1))
		r.Body = struct {
			io.Reader
			io.Closer
		}{io.MultiReader(bytes.NewReader(raw), original), original}
		var request struct {
			Query         string
			OperationName string
			Variables     struct {
				Input map[string]any
				Meta  struct{ IdempotencyKey string }
			}
		}
		if readErr != nil || len(raw) > 1<<20 || json.Unmarshal(raw, &request) != nil || strings.TrimSpace(request.Query) != strings.TrimSpace(string(settingsQuery)) || request.OperationName != "" && request.OperationName != "UpdateMySettings" {
			actualHandler.ServeHTTP(w, r)
			return
		}
		settingsMu.Lock()
		defer settingsMu.Unlock()
		if settingsRequests >= 2 {
			actualHandler.ServeHTTP(w, r)
			return
		}
		settingsRequests++
		key := request.Variables.Meta.IdempotencyKey
		parsedKey, keyErr := uuid.Parse(key)
		validKey := keyErr == nil && parsedKey != uuid.Nil && parsedKey.String() == key
		input, _ := json.Marshal(request.Variables.Input)
		if settingsRequests == 1 {
			firstSettingsInput = request.Variables.Input
			settingsRetry.FailedKey = key
			settingsRetry.PayloadSHA256 = fmt.Sprintf("%x", sha256.Sum256(input))
		} else if validKey && settingsRetry.RolledBack && key != settingsRetry.FailedKey && reflect.DeepEqual(firstSettingsInput, request.Variables.Input) {
			if _, err := fixture.pool.Exec(ctx, `ALTER TABLE idempotency_keys DROP CONSTRAINT account_settings_retry_fault`); err != nil {
				settingsRetry.Errors = append(settingsRetry.Errors, "fault removal failed")
			} else {
				settingsRetry.RetryKey, settingsRetry.FaultRemoved = key, true
			}
		} else {
			settingsRetry.Errors = append(settingsRetry.Errors, "retry preceded proven rollback or changed actor input/key")
		}
		if !validKey {
			settingsRetry.Errors = append(settingsRetry.Errors, "settings key is not a canonical nonzero UUID")
		}
		tap := &questBrowserHTTPWriter{ResponseWriter: w}
		actualHandler.ServeHTTP(tap, r)
		var response struct {
			Errors []struct{ Extensions struct{ Code string } }
		}
		if tap.overflow || json.Unmarshal(tap.body.Bytes(), &response) != nil {
			settingsRetry.Errors = append(settingsRetry.Errors, "real settings response could not be observed")
		}
		codes := []string{}
		for _, failure := range response.Errors {
			codes = append(codes, failure.Extensions.Code)
		}
		var failedRows, retryRows int
		if err := fixture.pool.QueryRow(ctx, `SELECT count(*) FILTER(WHERE key=$2),count(*) FILTER(WHERE key=$3 AND completed_at IS NOT NULL) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:updateMySettings'`, owner.rowID, settingsRetry.FailedKey, settingsRetry.RetryKey).Scan(&failedRows, &retryRows); err != nil {
			settingsRetry.Errors = append(settingsRetry.Errors, "settings receipt readback failed")
		}
		if settingsRequests == 1 {
			after, err := readSettingsRow()
			settingsRetry.FailedStatus, settingsRetry.FailedCodes = tap.status, codes
			settingsRetry.RolledBack = validKey && err == nil && failedRows == 0 && bytes.Equal(settingsBefore, after) && tap.status == 200 && reflect.DeepEqual(codes, []string{"INTERNAL"})
		} else {
			settingsRetry.RetryStatus, settingsRetry.RetryCodes = tap.status, codes
			var persistedRaw json.RawMessage
			err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('theme',upper(theme),'mode',upper(mode),'effectsEnabled',effects_enabled,'colorblindSafe',colorblind_safe,'reducedMotion',reduced_motion,'density',upper(density),'timezone',timezone,'notifyCharacterVerification',notify_character_verification,'notifyQuestSignup',notify_quest_signup,'notifyDocumentActivity',notify_document_activity,'notifyQuestScheduled',notify_quest_scheduled,'notifyDmMentioned',notify_dm_mentioned) FROM member_settings WHERE member_id=$1`, owner.rowID).Scan(&persistedRaw)
			var persisted map[string]any
			decodeErr := json.Unmarshal(persistedRaw, &persisted)
			settingsRetry.Persisted = err == nil && decodeErr == nil && settingsRetry.FaultRemoved && failedRows == 0 && retryRows == 1 && tap.status == 200 && len(codes) == 0 && reflect.DeepEqual(persisted, firstSettingsInput)
		}
	}))
	stdin, err := json.Marshal(map[string]any{"tokens": tokens, "inventory": inventory, "liveDdb": liveDDB})
	if err != nil {
		t.Fatal(err)
	}
	commandCtx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()
	command := exec.CommandContext(commandCtx, node, scriptCopy)
	command.Env = append(os.Environ(), "ACCOUNT_API_ORIGIN="+api.URL, "ACCOUNT_VITE_PORT="+strconv.Itoa(port), "ACCOUNT_REPO_ROOT="+root)
	command.Stdin = bytes.NewReader(stdin)
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error { return syscall.Kill(-command.Process.Pid, syscall.SIGTERM) }
	command.WaitDelay = 5 * time.Second
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	nodePID = command.Process.Pid
	write("native-browser-process.json", map[string]any{"pid": nodePID, "startedAt": time.Now().UTC(), "credentialsTransport": "stdin-only", "executedScript": scriptCopy, "sha256": identities[scriptCopy]})
	browserErr := command.Wait()
	processEnded := syscall.Kill(nodePID, 0) == syscall.ESRCH
	listenerProbe, listenerErr := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second)
	if listenerErr == nil {
		listenerProbe.Close()
	}
	write("native-browser-process-ended.json", map[string]any{"pid": nodePID, "processEnded": processEnded, "viteListenerClosed": listenerErr != nil, "endedAt": time.Now().UTC()})
	settingsMu.Lock()
	settingsProof := settingsRetry
	settingsMu.Unlock()
	write("native-settings-retry.json", settingsProof)
	if !settingsProof.RolledBack || !settingsProof.FaultRemoved || !settingsProof.Persisted || len(settingsProof.Errors) != 0 {
		t.Errorf("real settings rollback/retry proof incomplete: %+v", settingsProof)
	}
	if !processEnded || listenerErr == nil {
		t.Error("owned Node process or Vite listener remained after child exit")
	}
	var readback json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object(
	 'members',(SELECT jsonb_agg(jsonb_build_object('id',public_id,'handle',handle,'name',display_name,'avatar',avatar_url,'roles',roles) ORDER BY handle) FROM members),
	 'characters',(SELECT jsonb_agg(jsonb_build_object('id',public_id,'code',short_code,'name',name,'status',status,'description',description,'background',background_text,'pcxp',player_xp) ORDER BY short_code) FROM characters),
	 'dmProfiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY member_id) FROM dm_profiles p),
	 'settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY member_id) FROM member_settings s),
	 'availability',(SELECT jsonb_agg(to_jsonb(a) ORDER BY member_id,weekday,start_minute) FROM member_availability a),
	 'notifications',(SELECT jsonb_agg(jsonb_build_object('id',public_id,'kind',kind,'readAt',read_at) ORDER BY created_at,public_id) FROM notifications),
	 'logs',(SELECT jsonb_agg(jsonb_build_object('id',public_id,'body',body) ORDER BY id) FROM character_logs),
	 'progression',(SELECT jsonb_agg(jsonb_build_object('id',public_id,'delta',delta,'note',note) ORDER BY id) FROM character_progression_ledger),
	 'downtime',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM downtime_projects d),
	 'assessments',(SELECT jsonb_agg(jsonb_build_object('id',public_id,'type',subject_type,'verdict',verdict,'revision',review_revision,'at',created_at) ORDER BY created_at,public_id) FROM verifications),
	 'documentRevisions',(SELECT jsonb_agg(public_id ORDER BY created_at,public_id) FROM document_revisions),
	 'receipts',(SELECT count(*) FROM idempotency_keys),
	 'mirrorPreserved',(SELECT payload=$2::jsonb AND synced_at=$3 FROM character_ddb_mirrors WHERE character_id=(SELECT id FROM characters WHERE public_id=$1)),
	 'overrideTableAbsent',to_regclass('public.auth_override_audit') IS NULL
	)`, characters["mirror"]["id"], mirror, mirrorAt).Scan(&readback); err != nil {
		t.Fatal(err)
	}
	write("native-readback.json", readback)
	var receipt struct {
		Completed, BrowserClosed, ViteClosed bool
		Replays                              []struct{ Key string }
		SettingsRetry                        *struct {
			ActorID, FailedKey, RetryKey, PayloadSHA256 string
			FailedOrdinal, RetryOrdinal                 int
			VisibleError, VisibleRetry, Saved           bool
		}
		LiveDdb *struct {
			CharacterID, ProfileKey, SyncKey            string
			APISyncAttempts                             int
			Result, Replay                              character.DdbSyncReceipt
			Before, Saved, After, AfterReplay, Reloaded json.RawMessage
		}
		Created struct {
			Character struct {
				ID string `json:"id"`
			} `json:"character"`
		} `json:"created"`
	}
	raw, readErr := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if readErr != nil || json.Unmarshal(raw, &receipt) != nil {
		t.Fatalf("browser receipt: %v", readErr)
	}
	if proof := receipt.SettingsRetry; proof == nil || proof.ActorID != settingsProof.ActorID || proof.FailedKey != settingsProof.FailedKey || proof.RetryKey != settingsProof.RetryKey || proof.PayloadSHA256 != settingsProof.PayloadSHA256 || proof.FailedOrdinal <= 0 || proof.RetryOrdinal <= proof.FailedOrdinal || !proof.VisibleError || !proof.VisibleRetry || !proof.Saved {
		t.Fatal("browser Retry is not bound to the native failed/committed settings attempts")
	}
	if liveDDB {
		proof := receipt.LiveDdb
		if proof == nil || proof.CharacterID != characters["mirror"]["id"] || proof.ProfileKey == "" || proof.SyncKey == "" || proof.ProfileKey == proof.SyncKey || proof.APISyncAttempts != 1 || proof.Result.AttemptedAt.IsZero() {
			t.Fatal("optional live DDB stage lacks its actual profile/sync/result proof")
		}
		if !reflect.DeepEqual(proof.Result, proof.Replay) {
			t.Fatal("live DDB replay changed the acknowledged result")
		}
		views := make([]character.CharacterView, 5)
		for index, raw := range []json.RawMessage{proof.Before, proof.Saved, proof.After, proof.AfterReplay, proof.Reloaded} {
			if len(raw) == 0 || json.Unmarshal(raw, &views[index]) != nil {
				t.Fatalf("live DDB readback %d missing or invalid", index)
			}
		}
		before, saved, after := views[0], views[1], views[2]
		if before.Id != proof.CharacterID || before.OwnerId != owner.publicID || before.Status != "active" || before.Pcxp != 0 || before.Description == nil || *before.Description != "Account mirror profile kept" || saved.Description == nil || *saved.Description != "Account live DDB profile kept" || !reflect.DeepEqual(saved.BackgroundText, before.BackgroundText) || !reflect.DeepEqual(saved.DdbUrl, before.DdbUrl) || !reflect.DeepEqual(saved.DdbMirror, before.DdbMirror) {
			t.Fatal("live DDB local profile save changed mirror, URL or background")
		}
		if !reflect.DeepEqual(after, views[3]) || !reflect.DeepEqual(after, views[4]) || after.OwnerId != before.OwnerId || after.Status != "active" || after.Pcxp != 0 || !reflect.DeepEqual(after.Description, saved.Description) || !reflect.DeepEqual(after.BackgroundText, saved.BackgroundText) {
			t.Fatal("live DDB replay/reload changed persisted local fields or Character identity")
		}
		var currentRoles []string
		if err := fixture.pool.QueryRow(ctx, `SELECT roles FROM members WHERE id=$1 AND status='active'`, owner.rowID).Scan(&currentRoles); err != nil || !reflect.DeepEqual(currentRoles, []string{"player"}) {
			t.Fatalf("live DDB actor must remain the same current Player owner: %v %v", currentRoles, err)
		}
		for _, command := range []struct{ endpoint, key string }{{"graphql:updateCharacterProfile", proof.ProfileKey}, {"graphql:syncCharacterDdb", proof.SyncKey}} {
			var count int
			if err := fixture.pool.QueryRow(ctx, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint=$2 AND key=$3 AND completed_at IS NOT NULL`, owner.rowID, command.endpoint, command.key).Scan(&count); err != nil || count != 1 {
				t.Fatalf("live DDB %s receipt count=%d error=%v", command.endpoint, count, err)
			}
		}
		var storedReceipt, payload json.RawMessage
		var storedSync character.DdbSyncReceipt
		if err := fixture.pool.QueryRow(ctx, `SELECT receipt FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:syncCharacterDdb' AND key=$2 AND completed_at IS NOT NULL`, owner.rowID, proof.SyncKey).Scan(&storedReceipt); err != nil || idempotency.ValidateUniqueJSON(storedReceipt) != nil || json.Unmarshal(storedReceipt, &storedSync) != nil {
			t.Fatalf("live DDB durable receipt unavailable or invalid: %v", err)
		}
		if storedSync.Succeeded != proof.Result.Succeeded || !reflect.DeepEqual(storedSync.SafeError, proof.Result.SafeError) || !storedSync.AttemptedAt.Equal(proof.Result.AttemptedAt) || storedSync.Character.Id != proof.CharacterID {
			t.Fatal("live DDB durable receipt differs from actual API acknowledgement")
		}
		var url *string
		var syncedAt, updatedAt time.Time
		var description, background, storedOwner, storedStatus string
		var pcxp, mirrorRows, logs, progression, downtime int
		if err := fixture.pool.QueryRow(ctx, `SELECT c.ddb_url,m.payload,m.synced_at,c.updated_at,c.description,c.background_text,owner.public_id::text,c.status,c.player_xp,
		 (SELECT count(*) FROM character_ddb_mirrors WHERE character_id=c.id),
		 (SELECT count(*) FROM character_logs WHERE character_id=c.id),
		 (SELECT count(*) FROM character_progression_ledger WHERE character_id=c.id),
		 (SELECT count(*) FROM downtime_projects WHERE character_id=c.id)
		 FROM characters c JOIN members owner ON owner.id=c.owner_id JOIN character_ddb_mirrors m ON m.character_id=c.id WHERE c.public_id=$1`, proof.CharacterID).Scan(&url, &payload, &syncedAt, &updatedAt, &description, &background, &storedOwner, &storedStatus, &pcxp, &mirrorRows, &logs, &progression, &downtime); err != nil {
			t.Fatal(err)
		}
		if mirrorRows != 1 || logs != 0 || progression != 0 || downtime != 0 || pcxp != 0 || storedOwner != owner.publicID || storedStatus != "active" || description != "Account live DDB profile kept" || background != "Seeded background" || !reflect.DeepEqual(url, after.DdbUrl) || !updatedAt.Equal(after.UpdatedAt) || after.DdbMirror == nil || after.DdbMirror.SyncedAt == nil || !syncedAt.Equal(*after.DdbMirror.SyncedAt) {
			t.Fatal("live DDB SQL state disagrees with API or changed owned local fields/progression")
		}
		if proof.Result.Succeeded {
			if proof.Result.SafeError != nil || url == nil || *url != "https://www.dndbeyond.com/characters/152579009" || !syncedAt.Equal(proof.Result.AttemptedAt) || !updatedAt.Equal(proof.Result.AttemptedAt) || !syncedAt.After(mirrorAt) {
				t.Fatal("live DDB success lacks current canonical URL/mirror/time persistence")
			}
			var fields map[string]json.RawMessage
			var projection character.DdbSnapshot
			if json.Unmarshal(payload, &fields) != nil || len(fields) != 8 || json.Unmarshal(payload, &projection) != nil {
				t.Fatal("live DDB stored v1 projection has an invalid object shape")
			}
			for _, key := range []string{"level", "xp", "armorClass", "maxHp", "species", "classes", "background", "proficiencies"} {
				if _, exists := fields[key]; !exists {
					t.Fatalf("live DDB stored v1 projection lacks %s", key)
				}
			}
			if !reflect.DeepEqual(projection.Level, after.DdbMirror.Level) || !reflect.DeepEqual(projection.XP, after.DdbMirror.Xp) || !reflect.DeepEqual(projection.Species, after.DdbMirror.Species) || !reflect.DeepEqual(projection.Classes, after.DdbMirror.Classes) || !reflect.DeepEqual(projection.Background, after.DdbMirror.Background) {
				t.Fatal("live DDB SQL projection differs from actual API projection")
			}
		} else {
			if proof.Result.SafeError == nil || (*proof.Result.SafeError != "TIMEOUT" && *proof.Result.SafeError != "PROVIDER_HTTP" && *proof.Result.SafeError != "UNAVAILABLE" && *proof.Result.SafeError != "PAYLOAD_DRIFT") || !reflect.DeepEqual(after, saved) || !syncedAt.Equal(mirrorAt) {
				t.Fatal("live DDB provider failure did not preserve the saved profile/last-good state")
			}
			var equal bool
			if err := fixture.pool.QueryRow(ctx, `SELECT $1::jsonb=$2::jsonb`, payload, mirror).Scan(&equal); err != nil || !equal {
				t.Fatalf("live DDB failure changed seeded mirror payload: %v", err)
			}
		}
		var inventoryGood bool
		if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM members)=5 AND (SELECT count(*) FROM characters)=3 AND (SELECT count(*) FROM documents)=2 AND (SELECT count(*) FROM quests)=1 AND (SELECT count(*) FROM character_ddb_mirrors)=1 AND to_regclass('public.auth_override_audit') IS NULL`).Scan(&inventoryGood); err != nil || !inventoryGood {
			t.Fatalf("live DDB changed the final fixture inventory or audit-table truth: %v", err)
		}
		write("native-live-ddb-readback.json", map[string]any{"succeeded": proof.Result.Succeeded, "safeError": proof.Result.SafeError, "attemptedAt": proof.Result.AttemptedAt, "syncKey": proof.SyncKey, "profileKey": proof.ProfileKey, "apiSyncAttempts": 1, "externalProviderCalls": nil, "providerRequestCountInstrumented": false, "mirrorRows": mirrorRows, "mirrorPreserved": !proof.Result.Succeeded, "syncedAt": syncedAt, "characterUpdatedAt": updatedAt, "url": url, "projection": after.DdbMirror, "localFieldsPreserved": true, "sameKeyReplayAndReloadUnchanged": true})
		if !proof.Result.Succeeded && browserErr == nil {
			t.Error("optional positive live DDB acceptance cannot pass on an acknowledged provider failure")
		}
	} else if receipt.LiveDdb != nil {
		t.Fatal("default acceptance unexpectedly ran an optional live DDB attempt")
	}
	if browserErr != nil {
		t.Fatalf("browser: %v (see sanitized receipt)", browserErr)
	}
	if !receipt.Completed || !receipt.BrowserClosed || !receipt.ViteClosed {
		t.Fatalf("incomplete browser cleanup/completion: %+v", receipt)
	}
	if len(receipt.Replays) != 8 {
		t.Fatalf("exact replay coverage count=%d want=8", len(receipt.Replays))
	}
	for _, replay := range receipt.Replays {
		var count int
		if err := fixture.pool.QueryRow(ctx, `SELECT count(*) FROM idempotency_keys WHERE key=$1 AND completed_at IS NOT NULL`, replay.Key).Scan(&count); err != nil || count != 1 {
			t.Fatalf("browser replay receipt count=%d error=%v", count, err)
		}
	}
	var status string
	var xp, logs, projects, ledgerEntries int
	if err := fixture.pool.QueryRow(ctx, `SELECT status,player_xp,(SELECT count(*) FROM character_logs WHERE character_id=c.id),(SELECT count(*) FROM downtime_projects WHERE character_id=c.id),(SELECT count(*) FROM character_progression_ledger WHERE character_id=c.id) FROM characters c WHERE public_id=$1`, receipt.Created.Character.ID).Scan(&status, &xp, &logs, &projects, &ledgerEntries); err != nil {
		t.Fatal(err)
	}
	if status != "retired" || xp != 5 || logs != 1 || projects != 1 || ledgerEntries != 2 {
		t.Fatalf("persisted Character status=%s xp=%d logs=%d projects=%d ledger=%d", status, xp, logs, projects, ledgerEntries)
	}
	var settingsCount int
	if err := fixture.pool.QueryRow(ctx, `SELECT count(*) FROM member_settings s JOIN members m ON m.id=s.member_id WHERE
	 (m.public_id=$1 AND s.theme='midnight' AND s.mode='dark' AND s.density='compact' AND s.colorblind_safe AND NOT s.reduced_motion AND s.timezone='America/New_York'
	 AND NOT s.notify_character_verification AND NOT s.notify_quest_signup AND NOT s.notify_document_activity AND NOT s.notify_quest_scheduled AND NOT s.notify_dm_mentioned)
	 OR (m.public_id=$2 AND s.theme='ember' AND s.mode='system' AND s.density='comfortable' AND NOT s.colorblind_safe AND NOT s.reduced_motion AND s.timezone IS NULL
	 AND s.notify_character_verification AND s.notify_quest_signup AND s.notify_document_activity AND s.notify_quest_scheduled AND s.notify_dm_mentioned)`, owner.publicID, actors["other"].publicID).Scan(&settingsCount); err != nil || settingsCount != 2 {
		t.Fatalf("persisted isolated settings count=%d want=2 error=%v", settingsCount, err)
	}
	if !liveDDB {
		var mirrorGood, overrideAbsent bool
		if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT payload=$2::jsonb AND synced_at=$3 FROM character_ddb_mirrors WHERE character_id=(SELECT id FROM characters WHERE public_id=$1)),to_regclass('public.auth_override_audit') IS NULL`, characters["mirror"]["id"], mirror, mirrorAt).Scan(&mirrorGood, &overrideAbsent); err != nil || !mirrorGood || !overrideAbsent {
			t.Fatalf("mirror=%v auditAbsent=%v error=%v", mirrorGood, overrideAbsent, err)
		}
	}
}
