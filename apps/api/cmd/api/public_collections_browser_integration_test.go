//go:build integration && frontend_acceptance

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	"sort"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

// TestPublicCollectionsBrowser uses a frozen production build and a migrations-only
// database. Historical public fixtures are inputs; all browser/API operations are reads.
func TestPublicCollectionsBrowser(t *testing.T) {
	if os.Getenv("PUBLIC_COLLECTIONS_RUNTIME_RELEASE") != "isolated-public-collections" || os.Getenv("DATABASE_URL") != "" {
		t.Fatal("explicit isolated release and no DATABASE_URL required")
	}
	script, evidence, build := os.Getenv("PUBLIC_COLLECTIONS_SCRIPT"), os.Getenv("PUBLIC_COLLECTIONS_EVIDENCE"), os.Getenv("PUBLIC_COLLECTIONS_BUILD")
	for _, value := range []string{script, evidence, build} {
		if !filepath.IsAbs(value) {
			t.Fatal("absolute script, fresh evidence and frozen production build paths required")
		}
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(evidence, 0o755); err != nil {
		t.Fatal(err)
	}
	marker, err := os.OpenFile(filepath.Join(evidence, "attempt-started"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal("fresh attempt required:", err)
	}
	if err := marker.Close(); err != nil {
		t.Fatal(err)
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
	sourceBefore := questBrowserRuntimeInputs(t, root)
	buildBefore := publicCollectionsBuildInputs(t, root, build)
	write("production-inputs-before.json", sourceBefore)
	write("build-inputs-before.json", buildBefore)
	owned := map[string][]byte{}
	identities := map[string]string{}
	scriptCopy := filepath.Join(evidence, "attempt-input-browser.mjs")
	for _, entry := range []struct{ source, copy string }{
		{script, scriptCopy},
		{filepath.Join(root, "apps/api/cmd/api/public_collections_browser_integration_test.go"), filepath.Join(evidence, "attempt-input-public_collections_browser_integration_test.go")},
		{filepath.Join(root, "apps/api/cmd/api/quest_browser_integration_test.go"), filepath.Join(evidence, "attempt-helper-quest.go")},
		{filepath.Join(root, "apps/api/cmd/api/authority_integration_test.go"), filepath.Join(evidence, "attempt-helper-authority.go")},
		{filepath.Join(root, "apps/api/cmd/api/graphql_product_fixture_test.go"), filepath.Join(evidence, "attempt-helper-product-fixture.go")},
	} {
		raw, err := os.ReadFile(entry.source)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(entry.copy, raw, 0o444); err != nil {
			t.Fatal(err)
		}
		for _, name := range []string{entry.source, entry.copy} {
			owned[name] = raw
			identities[name] = fmt.Sprintf("%x", sha256.Sum256(raw))
		}
	}
	write("owned-inputs-before.json", identities)
	t.Cleanup(func() {
		after := questBrowserRuntimeInputs(t, root)
		buildAfter := publicCollectionsBuildInputs(t, root, build)
		write("production-inputs-after.json", after)
		write("build-inputs-after.json", buildAfter)
		if !reflect.DeepEqual(sourceBefore, after) || !reflect.DeepEqual(buildBefore, buildAfter) {
			t.Error("production/build inputs changed during acceptance")
		}
		afterOwned := map[string]string{}
		for name, expected := range owned {
			raw, err := os.ReadFile(name)
			if err != nil || !bytes.Equal(raw, expected) {
				t.Errorf("owned input changed: %s (%v)", name, err)
			}
			afterOwned[name] = fmt.Sprintf("%x", sha256.Sum256(raw))
		}
		write("owned-inputs-after.json", afterOwned)
	})

	ctx := context.Background()
	fixture := newProductFixture(t)
	var api *httptest.Server
	var runtime app.API
	var reservation net.Listener
	var command *exec.Cmd
	port := 0
	t.Cleanup(func() {
		if command != nil && command.Process != nil && command.ProcessState == nil {
			_ = syscall.Kill(-command.Process.Pid, syscall.SIGTERM)
			_ = command.Wait()
		}
		if reservation != nil {
			_ = reservation.Close()
		}
		if api != nil {
			api.CloseClientConnections()
			api.Close()
		}
		if runtime.Pool != nil {
			runtime.Pool.Close()
		}
		dropErr := fixture.close()
		var remaining int
		absenceErr := fixture.server.admin.QueryRow(ctx, "SELECT count(*) FROM pg_database WHERE datname=$1", fixture.databaseName).Scan(&remaining)
		if dropErr != nil || absenceErr != nil || remaining != 0 {
			t.Errorf("owned database cleanup: %v %v remaining=%d", dropErr, absenceErr, remaining)
		}
		listeners := map[string]bool{}
		addresses := map[string]string{}
		if api != nil {
			addresses["api"] = strings.TrimPrefix(api.URL, "http://")
		}
		if port != 0 {
			addresses["preview"] = fmt.Sprintf("127.0.0.1:%d", port)
		}
		for name, address := range addresses {
			c, err := net.DialTimeout("tcp", address, time.Second)
			if c != nil {
				_ = c.Close()
			}
			listeners[name] = errors.Is(err, syscall.ECONNREFUSED)
			if !listeners[name] {
				t.Errorf("owned %s listener not closed: %v", name, err)
			}
		}
		write("native-cleanup.json", map[string]any{"at": time.Now().UTC(), "database": fixture.databaseName, "databaseDropped": dropErr == nil && absenceErr == nil && remaining == 0, "nodeStarted": command != nil && command.Process != nil, "nodeWaited": command != nil && command.ProcessState != nil, "listenersClosed": listeners})
	})
	var initial int
	if err := fixture.pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM characters)+(SELECT count(*) FROM quests)").Scan(&initial); err != nil || initial != 0 {
		t.Fatalf("migrations-only fixture required: %d (%v)", initial, err)
	}
	reservation, err = net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port = reservation.Addr().(*net.TCPAddr).Port
	if err := reservation.Close(); err != nil {
		t.Fatal(err)
	}
	reservation = nil
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-public-collections-fixture-key", CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	rows := &authorityDBFixture{pool: fixture.pool, cfg: cfg}
	members := []map[string]any{}
	memberRows := []authorityDBMember{}
	for i := 1; i <= 101; i++ {
		roles := []auth.Role{auth.Player}
		dm := i <= 24 || i == 101
		if dm {
			roles = append(roles, auth.DM)
		}
		if i == 1 {
			roles = append(roles, auth.Verifier)
		}
		m := rows.member(t, roles...)
		handle, name := fmt.Sprintf("collections-member-%03d", i), fmt.Sprintf("Collections Member %03d", i)
		rows.exec(t, "UPDATE members SET handle=$2,display_name=$3,status='active',joined_at=$4,updated_at=$4 WHERE id=$1", m.rowID, handle, name, time.Date(2026, 8, 1, 0, i, 0, 0, time.UTC))
		if dm {
			rows.exec(t, "INSERT INTO dm_profiles(member_id,status,review_revision,tagline,accepting_players) VALUES($1,'approved',1,$2,$3)", m.rowID, "Collections public DM "+handle, i >= 13)
		}
		members = append(members, map[string]any{"id": m.publicID, "handle": handle, "name": name, "isDm": dm})
		memberRows = append(memberRows, m)
	}
	host, player, verifier := memberRows[100], memberRows[99], memberRows[0]
	rows.exec(t, "INSERT INTO member_availability(member_id,weekday,start_minute,end_minute,note) VALUES($1,0,1080,1200,'Collections last-member Sunday')", host.rowID)
	tokens, actorIDs := map[string]string{}, map[string]string{"host": host.publicID, "player": player.publicID, "verifier": verifier.publicID}
	for name, id := range actorIDs {
		token, err := login.Mint(cfg.JWTSecret, login.Claims{MemberID: id, Exp: time.Now().Add(time.Hour).Unix()})
		if err != nil {
			t.Fatal(err)
		}
		tokens[name] = token
	}
	regionID := uuid.NewString()
	var region int64
	if err := fixture.pool.QueryRow(ctx, "INSERT INTO regions(public_id,name,kind) VALUES($1,'Collections Region','server') RETURNING id", regionID).Scan(&region); err != nil {
		t.Fatal(err)
	}
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	seedDoc := func(kind, category, slug, title, body string, author authorityDBMember, at time.Time) (int64, map[string]any) {
		t.Helper()
		id := uuid.NewString()
		var categoryValue any
		if category != "" {
			categoryValue = category
		}
		var row int64
		if err := fixture.pool.QueryRow(ctx, "INSERT INTO documents(public_id,kind,category,slug,title,body,status,visibility,author_id,published_by,published_at,created_at,updated_at,version,frontmatter_yaml) VALUES($1,$2,$3,$4,$5,$6,'published','public',$7,$7,$8,$8,$8,1,'{}') RETURNING id", id, kind, categoryValue, slug, title, body, author.rowID, at).Scan(&row); err != nil {
			t.Fatal(err)
		}
		return row, map[string]any{"id": id, "slug": slug, "title": title, "body": body, "category": category}
	}
	rules, codex, characters, sessions := []map[string]any{}, []map[string]any{}, []map[string]any{}, []map[string]any{}
	for i := 1; i <= 101; i++ {
		category := "guide"
		if i > 50 {
			category = "ruling"
		}
		title, body := fmt.Sprintf("Collections Rule %03d", i), fmt.Sprintf("Collections rule body %03d.", i)
		if i == 101 {
			title, body = "Collections LAST RULE TITLE", "EXCERPT_ONLY_LAST_RULE distinctive public text."
		}
		_, doc := seedDoc("rule", category, fmt.Sprintf("collections-rule-%03d", i), title, body, verifier, base.Add(-time.Duration(i)*time.Minute))
		rules = append(rules, doc)
	}
	for i := 1; i <= 51; i++ {
		category := "Artifact"
		if i > 25 {
			category = "NPC"
		}
		_, doc := seedDoc("codex_entry", category, fmt.Sprintf("collections-codex-%03d", i), fmt.Sprintf("Collections Codex %03d", i), fmt.Sprintf("Collections codex public body %03d.", i), host, base.Add(-time.Duration(i)*time.Minute))
		codex = append(codex, doc)
	}
	for i := 1; i <= 26; i++ {
		id, name, code, status, owner := uuid.NewString(), fmt.Sprintf("Collections PC %03d", i), fmt.Sprintf("COLLECTIONPC%03d", i), "active", player
		if i >= 25 {
			owner = host
		}
		if i == 26 {
			status = "retired"
		}
		rows.exec(t, "INSERT INTO characters(public_id,short_code,name,owner_id,region_id,status,description,background_text,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'Collections public description','Collections public background',$7,$7)", id, code, name, owner.rowID, region, status, base.Add(-time.Duration(i)*time.Minute))
		characters = append(characters, map[string]any{"id": id, "shortCode": code, "name": name, "status": status, "ownerId": owner.publicID})
	}
	_, table := seedDoc("community", "dm_table", "collections-host-table", "Collections Host Table", "Collections public table prose.", host, base)
	for i := 1; i <= 21; i++ {
		brief, doc := seedDoc("quest_brief", "", fmt.Sprintf("collections-brief-%03d", i), fmt.Sprintf("Collections Session %03d", i), fmt.Sprintf("Collections public session body %03d.", i), host, base.Add(time.Duration(i)*time.Hour))
		id, code := uuid.NewString(), fmt.Sprintf("COLLECTIONSESSION%03d", i)
		var quest int64
		if err := fixture.pool.QueryRow(ctx, "INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by,created_at,updated_at) VALUES($1,$2,ARRAY['standard'],'played',$3,$4,$5,$3,$4,$4) RETURNING id", id, code, host.rowID, base.Add(time.Duration(i)*time.Hour), brief).Scan(&quest); err != nil {
			t.Fatal(err)
		}
		rows.exec(t, "INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)", quest, region)
		sessions = append(sessions, map[string]any{"id": id, "shortCode": code, "title": doc["title"]})
	}
	counts := map[string]int{"members": 101, "dm_profiles": 25, "documents": 174, "characters": 26, "quests": 21, "regions": 1, "quest_regions": 21, "member_availability": 1, "document_links": 0, "document_revisions": 0, "notifications": 0, "idempotency_keys": 0, "background_jobs": 0}
	for table, expected := range counts {
		var count int
		if err := fixture.pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil || count != expected {
			t.Fatalf("seed %s count=%d want%d (%v)", table, count, expected, err)
		}
	}
	// Additive directory fixtures preserve the original guest Codex51/NPC26 population.
	baseCounts := map[string]int{}
	for name, count := range counts {
		baseCounts[name] = count
	}
	assertGuestCodexCensus := func() {
		t.Helper()
		var all, npc int
		if err := fixture.pool.QueryRow(ctx, "SELECT count(*),count(*) FILTER(WHERE category='NPC') FROM documents WHERE kind='codex_entry' AND status='published' AND visibility='public' AND policy IS NULL AND deleted_at IS NULL").Scan(&all, &npc); err != nil || all != 51 || npc != 26 {
			t.Fatalf("original guest Codex census drift all=%d NPC=%d: %v", all, npc, err)
		}
	}
	assertGuestCodexCensus()
	extension := map[string]any{}
	hostOnly, denied := []map[string]any{}, []map[string]any{}
	privateDoc := func(category, slug, title, body string, allowed bool, at time.Time) (int64, map[string]any) {
		t.Helper()
		row, doc := seedDoc("codex_entry", category, slug, title, body, verifier, at)
		policy := []string{}
		if allowed {
			policy = append(policy, "member:"+host.publicID)
		}
		raw, err := json.Marshal(policy)
		if err != nil {
			t.Fatal(err)
		}
		rows.exec(t, "UPDATE documents SET policy=$2::jsonb WHERE id=$1", row, string(raw))
		if allowed {
			hostOnly = append(hostOnly, doc)
		} else {
			denied = append(denied, doc)
		}
		return row, doc
	}
	npcEntries := append([]map[string]any{}, codex[25:]...)
	factionEntries := []map[string]any{}
	for i := 1; i <= 25; i++ {
		_, doc := privateDoc("NPC", fmt.Sprintf("collections-private-npc-%03d", i), fmt.Sprintf("Collections private NPC %03d", i), fmt.Sprintf("Collections host-only NPC prose %03d.", i), true, base.Add(-time.Duration(100+i)*time.Minute))
		npcEntries = append(npcEntries, doc)
	}
	for i := 1; i <= 51; i++ {
		_, doc := privateDoc("Faction", fmt.Sprintf("collections-private-faction-%03d", i), fmt.Sprintf("Collections private Faction %03d", i), fmt.Sprintf("Collections host-only Faction prose %03d.", i), true, base.Add(-time.Duration(200+i)*time.Minute))
		factionEntries = append(factionEntries, doc)
	}
	for _, category := range []string{"NPC", "Faction"} {
		privateDoc(category, "collections-denied-"+strings.ToLower(category), "Collections denied "+category+" sentinel", "Collections denied "+category+" sentinel prose.", false, base.Add(time.Hour))
	}
	locationRow, location := privateDoc("Locations", "collections-region-location", "Collections regional location", "Collections host-only regional location prose.", true, base)
	hiddenRow, hiddenLocation := privateDoc("Locations", "collections-denied-location", "Collections denied Region location sentinel", "Collections denied Region location sentinel prose.", false, base)
	activityRegionID, hiddenRegionID, mapID, nodeID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	var activityRegion, hiddenRegion, mapRow int64
	if err := fixture.pool.QueryRow(ctx, "INSERT INTO regions(public_id,name,kind,document_id) VALUES($1,'Collections Activity Region','server',$2) RETURNING id", activityRegionID, locationRow).Scan(&activityRegion); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, "INSERT INTO regions(public_id,name,kind,document_id) VALUES($1,'Collections Unavailable Document Region','server',$2) RETURNING id", hiddenRegionID, hiddenRow).Scan(&hiddenRegion); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, "INSERT INTO maps(public_id,name,atlas_code,map_kind,family,region_id,created_by) VALUES($1,'Collections Activity Map','collections-activity','pointcrawl','campaign',$2,$3) RETURNING id", mapID, activityRegion, verifier.rowID).Scan(&mapRow); err != nil {
		t.Fatal(err)
	}
	rows.exec(t, "INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) VALUES($1,$2,'Collections Activity Gate',1,1,clock_timestamp())", nodeID, mapRow)
	activities := []map[string]any{}
	activityAt := time.Now().UTC().Truncate(time.Second)
	for i, display := range []string{"filling", "scheduled", "live"} {
		id, code := uuid.NewString(), "COLLECTIONACTIVITY"+strings.ToUpper(display)
		brief, doc := seedDoc("quest_brief", "", "collections-activity-"+display, "Collections Activity "+display, "Collections public activity "+display+" brief.", verifier, base)
		status, filled, scheduled := "open", 1, activityAt.Add(24*time.Hour)
		if display == "scheduled" {
			status = "full"
		}
		if display == "live" {
			filled, scheduled = 0, activityAt.Add(-time.Hour)
		}
		var quest int64
		if err := fixture.pool.QueryRow(ctx, "INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,duration_hours,slots_max,filled_count,signup_type,document_id,created_by) VALUES($1,$2,ARRAY['standard'],$3,$4,$5,4,$6,$7,'last_game_played',$8,$4) RETURNING id", id, code, status, verifier.rowID, scheduled, 2-i%2, filled, brief).Scan(&quest); err != nil {
			t.Fatal(err)
		}
		rows.exec(t, "INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)", quest, activityRegion)
		if filled > 0 {
			rows.exec(t, "INSERT INTO quest_participants(quest_id,member_id,character_id,status) VALUES($1,$2,(SELECT id FROM characters WHERE public_id=$3),'signed_up')", quest, player.rowID, characters[0]["id"])
		}
		activities = append(activities, map[string]any{"id": id, "shortCode": code, "title": doc["title"], "body": doc["body"], "displayStatus": display, "scheduledAt": scheduled.Format(time.RFC3339), "slotsMax": 2 - i%2, "filledCount": filled})
	}
	extension["npc"], extension["factions"], extension["hostOnly"], extension["denied"] = npcEntries, factionEntries, hostOnly, denied
	extension["region"] = map[string]any{"id": activityRegionID, "name": "Collections Activity Region", "document": location, "mapId": mapID, "mapName": "Collections Activity Map", "atlasCode": "collections-activity", "nodeId": nodeID, "nodeName": "Collections Activity Gate", "activities": activities}
	extension["hiddenRegion"] = map[string]any{"id": hiddenRegionID, "name": "Collections Unavailable Document Region", "document": hiddenLocation}
	extension["regionIds"] = []string{regionID, activityRegionID, hiddenRegionID}
	extension["authorId"] = verifier.publicID
	extension["allowPolicy"] = []string{"member:" + host.publicID}
	extension["denyPolicy"] = []string{}
	counts["documents"], counts["regions"], counts["quests"], counts["quest_regions"] = 257, 3, 24, 24
	counts["maps"], counts["pointcrawl_nodes"], counts["quest_participants"] = 1, 1, 2
	for table, expected := range counts {
		var count int
		if err := fixture.pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil || count != expected {
			t.Fatalf("additive seed %s count=%d want%d (%v)", table, count, expected, err)
		}
	}
	assertGuestCodexCensus()
	var d5 string
	if err := fixture.pool.QueryRow(ctx, "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uq_documents_dm_table_per_member'").Scan(&d5); err != nil || !strings.Contains(d5, "UNIQUE") || !strings.Contains(d5, "deleted_at IS NULL") {
		t.Fatal("canonical one-live-table constraint missing:", err)
	}
	inventory := map[string]any{"members": members, "rules": rules, "codex": codex, "characters": characters, "sessions": sessions, "table": table, "actors": actorIDs, "counts": counts, "baseCounts": baseCounts, "extension": extension, "historicalSeeds": true, "browserProductWrites": false, "oneLiveTableIndex": d5}
	write("native-inventory.json", inventory)
	// Snapshot every public product table, including otherwise-empty effects, before Wire.
	snapshot := func() map[string]json.RawMessage {
		t.Helper()
		names, err := fixture.pool.Query(ctx, "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'goose_db_version' ORDER BY tablename")
		if err != nil {
			t.Fatal(err)
		}
		tables := []string{}
		for names.Next() {
			var name string
			if err := names.Scan(&name); err != nil {
				t.Fatal(err)
			}
			tables = append(tables, name)
		}
		if err := names.Err(); err != nil {
			t.Fatal(err)
		}
		names.Close()
		out := map[string]json.RawMessage{}
		for _, name := range tables {
			for _, c := range name {
				if !(c >= 'a' && c <= 'z' || c == '_') {
					t.Fatal("unexpected product table identifier")
				}
			}
			var raw []byte
			if err := fixture.pool.QueryRow(ctx, "SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM "+name+" r").Scan(&raw); err != nil {
				t.Fatal(err)
			}
			out[name] = append(json.RawMessage{}, raw...)
		}
		return out
	}
	sqlBefore := snapshot()
	write("native-all-tables-before.json", sqlBefore)
	runtime = app.Wire(ctx, cfg)
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("production Wire did not bind isolated database")
	}
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)
	api = httptest.NewServer(apiHandler(mux, cfg, runtime.Authority))
	input, err := json.Marshal(map[string]any{"tokens": tokens, "inventory": inventory})
	if err != nil {
		t.Fatal(err)
	}
	runCtx, cancel := context.WithTimeout(ctx, 240*time.Second)
	defer cancel()
	command = exec.CommandContext(runCtx, node, scriptCopy)
	command.Dir = root
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error { return syscall.Kill(-command.Process.Pid, syscall.SIGTERM) }
	command.WaitDelay = 10 * time.Second
	command.Env = append(os.Environ(), "PUBLIC_COLLECTIONS_REPO_ROOT="+root, "PUBLIC_COLLECTIONS_API_ORIGIN="+api.URL, "PUBLIC_COLLECTIONS_PORT="+strconv.Itoa(port))
	command.Stdin = bytes.NewReader(input)
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	write("native-host.json", map[string]any{"at": time.Now().UTC(), "pid": command.Process.Pid, "apiOrigin": api.URL, "port": port, "credentials": "stdin only", "executedScript": scriptCopy, "scriptSha256": identities[scriptCopy], "build": build})
	browserErr := command.Wait()
	write("native-child-ended.json", map[string]any{"at": time.Now().UTC(), "pid": command.Process.Pid, "waited": true, "exit": command.ProcessState.ExitCode()})
	sqlAfter := snapshot()
	assertGuestCodexCensus()
	write("native-all-tables-after.json", sqlAfter)
	if !reflect.DeepEqual(sqlBefore, sqlAfter) {
		t.Error("read-only browser acceptance changed product tables")
	}
	var receipt struct {
		Completed, BrowserClosed, PreviewClosed, FrontendUnchanged bool
		Checks                                                     []json.RawMessage
		Errors, Unsafe, PageErrors, CleanupErrors                  []json.RawMessage
		Operations                                                 []struct {
			Ordinal                                   int
			Kind, Name, Outcome, FinishedAt, FailedAt string
			Status                                    int
			BodyRead                                  bool
			Codes                                     []string
			GraphqlErrorPaths                         [][]string
			Actor                                     string
		}
	}
	raw, err := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &receipt); err != nil {
		t.Fatal(err)
	}
	if !receipt.Completed || !receipt.BrowserClosed || !receipt.PreviewClosed || !receipt.FrontendUnchanged || len(receipt.Checks) != 15 || len(receipt.Errors) > 0 || len(receipt.Unsafe) > 0 || len(receipt.PageErrors) > 0 || len(receipt.CleanupErrors) > 0 || len(receipt.Operations) == 0 {
		t.Error("incomplete/unsafe public collection browser receipt")
	}
	wantChecks := []string{
		"rules-complete-independent-pages-title-excerpt-reader-reload",
		"community-complete-late-member-availability-both-rosters-reload",
		"public-player-dm-pages-search-accepting",
		"character-pages-name-all-mine-same-context-account-switch",
		"codex-page-two-category-search-canonical-reader-reload",
		"profile-table-session-continuation-current-owner-links",
		"me-composition-current-profile-and-sign-out",
		"phone-rules-complete-pages-search-reader-reload",
		"phone-community-complete-availability-rosters-reload",
		"npc-fixed-prefix-complete-pages-private-suppression-reader-reload",
		"faction-fixed-prefix-complete-pages-private-suppression-reader-reload",
		"region-complete-current-activity-document-map-quest-navigation",
		"rules-current-verifier-create-links-editor-destinations-no-persistence",
		"chronicle-authorized-create-link-server-preview-no-persistence",
		"welcome-login-and-guest-home-navigation-no-oauth",
	}
	for index, raw := range receipt.Checks {
		var check struct{ Name string }
		if err := json.Unmarshal(raw, &check); err != nil || index >= len(wantChecks) || check.Name != wantChecks[index] {
			t.Errorf("unexpected public collection checkpoint%d: %v", index, err)
		}
	}
	for index, operation := range receipt.Operations {
		if operation.Ordinal != index+1 || operation.Kind != "query" || operation.Outcome != "complete" || operation.FinishedAt == "" || operation.FailedAt != "" || operation.Status != http.StatusOK || !operation.BodyRead {
			t.Errorf("incomplete/unsafe public collection operation %d (%s)", operation.Ordinal, operation.Name)
		}
		expectedField := map[string]string{"CurrentAdminAccess": "adminOperations", "CurrentReviewAccess": "pendingDmProfileVerifications"}[operation.Name]
		if expectedField != "" && (operation.Actor == "host" || operation.Actor == "player" || (operation.Actor == "verifier" && operation.Name == "CurrentAdminAccess")) {
			if !reflect.DeepEqual(operation.Codes, []string{"FORBIDDEN"}) || !reflect.DeepEqual(operation.GraphqlErrorPaths, [][]string{{expectedField}}) {
				t.Errorf("unexpected access denial for public collection operation %d", operation.Ordinal)
			}
		} else if len(operation.Codes) != 0 || len(operation.GraphqlErrorPaths) != 0 {
			t.Errorf("unexpected GraphQL error for public collection operation %d", operation.Ordinal)
		}
	}
	write("native-readback.json", map[string]any{"at": time.Now().UTC(), "allProductTablesUnchanged": reflect.DeepEqual(sqlBefore, sqlAfter), "productTableCount": len(sqlBefore), "counts": counts, "browserChecks": len(receipt.Checks), "oneLiveTable": true, "noProductMutations": true})
	if browserErr != nil {
		t.Fatal("actual public collection browser:", browserErr)
	}
}

func publicCollectionsBuildInputs(t *testing.T, root, build string) map[string]string {
	t.Helper()
	result := map[string]string{}
	add := func(path string) []byte {
		if _, exists := result[path]; exists {
			t.Fatal("duplicate build input:", path)
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		result[path] = fmt.Sprintf("%x", sha256.Sum256(raw))
		return raw
	}
	var receipt struct {
		BuildExit, SourceInputs, DistFiles       int
		SourceManifestSha256, DistManifestSha256 string
		SourceDrift                              []string
	}
	if err := json.Unmarshal(add(filepath.Join(build, "build-receipt.json")), &receipt); err != nil {
		t.Fatal(err)
	}
	if receipt.BuildExit != 0 || receipt.SourceInputs <= 0 || receipt.DistFiles <= 0 || len(receipt.SourceDrift) != 0 {
		t.Fatal("unsuccessful/drifting production build receipt")
	}
	distEntries := []string{}
	for _, entry := range []struct {
		name, expected string
		count          int
		dist           bool
	}{
		{"source.sha256", receipt.SourceManifestSha256, receipt.SourceInputs, false},
		{"dist.sha256", receipt.DistManifestSha256, receipt.DistFiles, true},
	} {
		manifest := add(filepath.Join(build, entry.name))
		if fmt.Sprintf("%x", sha256.Sum256(manifest)) != entry.expected {
			t.Fatal("build manifest digest mismatch:", entry.name)
		}
		lines := strings.Split(strings.TrimSpace(string(manifest)), "\n")
		if len(lines) != entry.count {
			t.Fatal("build manifest count mismatch:", entry.name)
		}
		for _, line := range lines {
			parts := strings.SplitN(line, "  ", 2)
			if len(parts) != 2 {
				t.Fatal("invalid build manifest line")
			}
			if decoded, err := hex.DecodeString(parts[0]); err != nil || len(decoded) != sha256.Size {
				t.Fatal("invalid manifest SHA")
			}
			relative := filepath.Clean(parts[1])
			if filepath.IsAbs(relative) || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
				t.Fatal("manifest path escapes checkout")
			}
			base := root
			if entry.dist {
				base = filepath.Join(build, "dist")
				distEntries = append(distEntries, relative)
			}
			path := filepath.Join(base, relative)
			if raw := add(path); fmt.Sprintf("%x", sha256.Sum256(raw)) != parts[0] {
				t.Fatal("frozen build input drift:", relative)
			}
		}
	}
	actualDist := []string{}
	err := filepath.WalkDir(filepath.Join(build, "dist"), func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("nonregular dist artifact: %s", path)
		}
		relative, err := filepath.Rel(filepath.Join(build, "dist"), path)
		if err != nil {
			return err
		}
		actualDist = append(actualDist, relative)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(actualDist)
	sort.Strings(distEntries)
	if !reflect.DeepEqual(actualDist, distEntries) {
		t.Fatal("incomplete frozen dist inventory")
	}
	if _, exists := result[filepath.Join(build, "dist", "index.html")]; !exists {
		t.Fatal("missing frozen HTML entry")
	}
	return result
}
