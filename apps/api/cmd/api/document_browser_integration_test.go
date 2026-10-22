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
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

// This opt-in acceptance uses a migration-only database and canonical Wire/JWT
// boundaries. It never logs in, touches QA, or supplies an override audit sink.
func TestDocumentBrowserCurrentBoundaries(t *testing.T) {
	if os.Getenv("DOCUMENT_BROWSER_RUNTIME_RELEASE") != "isolated-document-browser" || os.Getenv("DATABASE_URL") != "" {
		t.Fatal("explicit isolated Document release and no DATABASE_URL are required")
	}
	script, evidence := os.Getenv("DOCUMENT_BROWSER_SCRIPT"), os.Getenv("DOCUMENT_BROWSER_EVIDENCE")
	frontendReceipt := os.Getenv("DOCUMENT_FRONTEND_RECEIPT")
	if !filepath.IsAbs(frontendReceipt) {
		t.Fatal("absolute frozen frontend receipt is required")
	}
	if !filepath.IsAbs(script) || !filepath.IsAbs(evidence) {
		t.Fatal("absolute Document browser script/evidence paths are required")
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
		t.Fatal("a fresh attempt is required:", err)
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
	before := questBrowserRuntimeInputs(t, root)
	write("production-inputs-before.json", before)
	owned := map[string][]byte{}
	identities := map[string]string{}
	for _, source := range []string{script, filepath.Join(root, "apps/api/cmd/api/document_browser_integration_test.go"), filepath.Join(root, "apps/api/cmd/api/quest_browser_integration_test.go"), filepath.Join(root, "apps/api/cmd/api/authority_integration_test.go"), filepath.Join(root, "apps/api/cmd/api/graphql_product_fixture_test.go")} {
		raw, err := os.ReadFile(source)
		if err != nil {
			t.Fatal(err)
		}
		copyPath := filepath.Join(evidence, "attempt-input-"+filepath.Base(source))
		if err := os.WriteFile(copyPath, raw, 0o444); err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{source, copyPath} {
			owned[path] = raw
			identities[path] = fmt.Sprintf("%x", sha256.Sum256(raw))
		}
	}
	write("owned-inputs-before.json", identities)
	t.Cleanup(func() {
		after := questBrowserRuntimeInputs(t, root)
		write("production-inputs-after.json", after)
		if !reflect.DeepEqual(before, after) {
			t.Error("production inputs changed during Document acceptance")
		}
		actual := map[string]string{}
		for path, expected := range owned {
			raw, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(raw, expected) {
				t.Errorf("owned input changed: %s (%v)", path, err)
			}
			actual[path] = fmt.Sprintf("%x", sha256.Sum256(raw))
		}
		write("owned-inputs-after.json", actual)
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
		if dropErr != nil {
			t.Errorf("fixture drop: %v", dropErr)
		}
		remaining := -1
		absenceErr := fixture.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, fixture.databaseName).Scan(&remaining)
		if absenceErr != nil || remaining != 0 {
			t.Errorf("fixture absence=%d (%v)", remaining, absenceErr)
		}
		listeners := map[string]bool{}
		addresses := map[string]string{}
		if port != 0 {
			addresses["vite"] = fmt.Sprintf("127.0.0.1:%d", port)
		}
		if api != nil {
			addresses["api"] = strings.TrimPrefix(api.URL, "http://")
		}
		for name, address := range addresses {
			connection, err := net.DialTimeout("tcp", address, time.Second)
			if connection != nil {
				_ = connection.Close()
			}
			listeners[name] = errors.Is(err, syscall.ECONNREFUSED)
			if !listeners[name] {
				t.Errorf("owned listener %s: %v", name, err)
			}
		}
		write("native-cleanup.json", map[string]any{"database": fixture.databaseName, "databaseDropped": dropErr == nil && absenceErr == nil && remaining == 0, "apiStarted": api != nil, "runtimeStarted": runtime.Pool != nil, "nodeStarted": command != nil && command.Process != nil, "listenersClosed": listeners, "at": time.Now().UTC()})
	})
	var initial int
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM quests)+(SELECT count(*) FROM characters)`).Scan(&initial); err != nil || initial != 0 {
		t.Fatalf("migration-only rows=%d (%v)", initial, err)
	}
	// Inventory is bounded before any rows are seeded; no guessed enums or tables.
	write("planned-inventory.json", map[string]int{"members": 21, "dmProfiles": 2, "regions": 1, "archonAssignments": 1, "focalDocuments": 4, "dependentBriefs": 2, "quests": 2, "characters": 1, "participants": 2, "summaryLinks": 4, "locationRegionLinks": 1, "canonicalGuideHistoryCommands": 21, "actualUICreates": 4, "supplementUICreates": 2, "importedEntities": 1, "finalDocuments": 13, "readerAliases": 9, "privateAudienceCommands": 3, "finalCompletedReceipts": 72})
	write("planned-compatibility-inventory.json", map[string]int{"questArcs": 1, "routePatterns": 10, "additionalCommands": 0, "demoWidths": 3})
	reservation, err = net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port = reservation.Addr().(*net.TCPAddr).Port
	if err := reservation.Close(); err != nil {
		t.Fatal(err)
	}
	reservation = nil
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-document-browser-fixture-key", CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	rows := &authorityDBFixture{pool: fixture.pool, cfg: cfg}
	actors := map[string]authorityDBMember{"verifier": rows.member(t, auth.Player, auth.Verifier), "owner": rows.member(t, auth.Player, auth.DM), "archon": rows.member(t, auth.Player, auth.DM, auth.Archon), "player": rows.member(t, auth.Player), "other": rows.member(t, auth.Player), "admin": rows.member(t, auth.Player, auth.Admin)}
	tokens, actorIDs, handles := map[string]string{}, map[string]string{}, map[string]string{}
	for name, actor := range actors {
		handle := "document-" + name
		rows.exec(t, `UPDATE members SET status='active',handle=$2,display_name=$2 WHERE id=$1`, actor.rowID, handle)
		actorIDs[name] = actor.publicID
		handles[name] = handle
		tokens[name] = rows.token(t, actor.publicID)
	}
	for _, name := range []string{"owner", "archon"} {
		rows.profile(t, actors[name], "approved")
	}
	for i := 0; i < 15; i++ {
		m := rows.member(t, auth.Player)
		rows.exec(t, `UPDATE members SET status='active',handle=$2,display_name=$2 WHERE id=$1`, m.rowID, fmt.Sprintf("document-picker-%02d", i))
	}
	regionID := uuid.NewString()
	var region int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Document browser Region','archon') RETURNING id`, regionID).Scan(&region); err != nil {
		t.Fatal(err)
	}
	rows.exec(t, `INSERT INTO archon_assignments(member_id,region_id) VALUES($1,$2)`, actors["archon"].rowID, region)
	documents := map[string]map[string]any{}
	docRows := map[string]int64{}
	seed := func(key, kind, category, status, visibility, body string, author authorityDBMember) int64 {
		t.Helper()
		id, slug, title := uuid.NewString(), "document-browser-"+key, "Document browser "+key
		var row int64
		var cat any
		if category != "" {
			cat = category
		}
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,category,slug,title,body,status,visibility,author_id,version,frontmatter_yaml) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,'{}') RETURNING id`, id, kind, cat, slug, title, body, status, visibility, author.rowID).Scan(&row); err != nil {
			t.Fatal(err)
		}
		documents[key] = map[string]any{"id": id, "slug": slug, "title": title, "body": body}
		docRows[key] = row
		return row
	}
	// Imported literal category and opaque prose metadata predate the authoring
	// gate. Only this historical row is seeded; all new ordinary records use UI.
	imported := seed("imported-entities", "codex_entry", "Entities", "draft", "public", "IMPORTED ENTITIES ORIGINAL BODY", actors["owner"])
	documents["importedEntities"] = documents["imported-entities"]
	docRows["importedEntities"] = imported
	delete(documents, "imported-entities")
	delete(docRows, "imported-entities")
	const importedYAML = "aliases:\n  - The Old Record\n  - Entity Alias\nsource: imported-fixture\nopaque:\n  enabled: true\n  nullable: null\n  count: 7\n  tags: [old, retained]\n  nested:\n    value: 2.5\n  literal: \"001\"\n"
	importedFrontmatter := map[string]any{"aliases": []string{"The Old Record", "Entity Alias"}, "source": "imported-fixture", "opaque": map[string]any{"enabled": true, "nullable": nil, "count": 7, "tags": []string{"old", "retained"}, "nested": map[string]any{"value": 2.5}, "literal": "001"}}
	rows.exec(t, `UPDATE documents SET frontmatter_yaml=$2 WHERE id=$1`, imported, importedYAML)
	var importedRaw string
	var importedRevisionCount int
	if err := fixture.pool.QueryRow(ctx, `SELECT frontmatter_yaml,(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id) FROM documents d WHERE id=$1`, imported).Scan(&importedRaw, &importedRevisionCount); err != nil || importedRaw != importedYAML || importedRevisionCount != 0 {
		t.Fatalf("imported baseline YAML/revisions mismatch (%v)", err)
	}
	write("imported-entities-baseline.json", map[string]any{"id": documents["importedEntities"]["id"], "rawYAML": importedRaw, "frontmatter": importedFrontmatter, "category": "Entities", "version": 1, "revisionCount": importedRevisionCount, "body": "IMPORTED ENTITIES ORIGINAL BODY"})
	locationSecret := "LOCATION PRIVATE SOURCE SECRET"
	locationBody := "Location public prose\n\n> [!dm:@document-owner]\n> " + locationSecret
	location := seed("location", "codex_entry", "Locations", "published", "public", locationBody, actors["owner"])
	rows.exec(t, `INSERT INTO document_links(source_id,region_target_id,relation) VALUES($1,$2,'subject')`, location, region)
	seed("private", "codex_entry", "Lore", "draft", "dm_only", "PRIVATE DRAFT SOURCE SECRET", actors["owner"])
	summary := seed("summary", "summary", "", "published", "public", "Summary browser original", actors["player"])
	characterID := uuid.NewString()
	var character int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status,region_id) VALUES($1,'DOCBROWSERPC','Document browser PC',$2,'active',$3) RETURNING id`, characterID, actors["player"].rowID, region).Scan(&character); err != nil {
		t.Fatal(err)
	}
	questIDs := []string{}
	questRows := []int64{}
	for i := 0; i < 2; i++ {
		brief := seed(fmt.Sprintf("brief-%d", i), "quest_brief", "", "published", "public", fmt.Sprintf("Quest brief %d", i), actors["owner"])
		if i == 0 {
			rows.exec(t, `UPDATE documents SET policy='[]'::jsonb WHERE id=$1`, brief)
		}
		id := uuid.NewString()
		var quest int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,created_by,scheduled_at,slots_max,filled_count,document_id) VALUES($1,$2,ARRAY['standard'],'played',$3,$3,now()-interval '1 day',1,1,$4) RETURNING id`, id, fmt.Sprintf("DOCBROWSER%d", i), actors["owner"].rowID, brief).Scan(&quest); err != nil {
			t.Fatal(err)
		}
		rows.exec(t, `INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)`, quest, region)
		rows.exec(t, `INSERT INTO quest_participants(quest_id,member_id,character_id,status) VALUES($1,$2,$3,'played')`, quest, actors["player"].rowID, character)
		questIDs = append(questIDs, id)
		questRows = append(questRows, quest)
	}
	rows.exec(t, `INSERT INTO document_links(source_id,quest_target_id,relation) VALUES($1,$2,'summarizes'),($1,$3,'mentions')`, summary, questRows[0], questRows[1])
	rows.exec(t, `INSERT INTO document_links(source_id,character_target_id,relation) VALUES($1,$2,'subject'),($1,$2,'manual_player')`, summary, character)
	compatibilityArcID := uuid.NewString()
	const compatibilityArcName = "Document route compatibility series"
	var compatibilityArcRow int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO quest_arcs(public_id,name,created_by) VALUES($1,$2,$3) RETURNING id`, compatibilityArcID, compatibilityArcName, actors["owner"].rowID).Scan(&compatibilityArcRow); err != nil {
		t.Fatal(err)
	}
	var compatibilityArcBefore json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT to_jsonb(a) FROM quest_arcs a WHERE id=$1`, compatibilityArcRow).Scan(&compatibilityArcBefore); err != nil {
		t.Fatal(err)
	}
	linksQuery := `SELECT COALESCE(jsonb_agg(jsonb_build_object('type',target_type,'id',target_id,'relation',relation,'ordinal',summary_append_order) ORDER BY target_type,target_id,relation),'[]'::jsonb) FROM document_links WHERE source_id=$1`
	var initialLinks json.RawMessage
	if err := fixture.pool.QueryRow(ctx, linksQuery, summary).Scan(&initialLinks); err != nil {
		t.Fatal(err)
	}
	runtime = app.Wire(ctx, cfg)
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("actual Wire not bound")
	}
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)
	observer := &questBrowserHTTPObserver{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if actor, ok := r.Context().Value(questBrowserHTTPActorKey{}).(*questBrowserHTTPActor); ok {
			actor.authority, actor.resolved = auth.AuthorityFromContext(r.Context())
		}
		mux.ServeHTTP(w, r)
	})
	api = httptest.NewServer(observer.wrap(apiHandler(inner, cfg, runtime.Authority)))
	graph := func(actor, query string, variables map[string]any) map[string]json.RawMessage {
		t.Helper()
		payload, err := json.Marshal(map[string]any{"query": query, "variables": variables})
		if err != nil {
			t.Fatal(err)
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, api.URL+"/v1/graphql", bytes.NewReader(payload))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Authorization", "Bearer "+tokens[actor])
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		raw, readErr := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		_ = response.Body.Close()
		if readErr != nil {
			t.Fatal(readErr)
		}
		var wire struct {
			Data   map[string]json.RawMessage `json:"data"`
			Errors []json.RawMessage          `json:"errors"`
		}
		if err := json.Unmarshal(raw, &wire); err != nil || response.StatusCode != 200 || len(wire.Errors) > 0 {
			t.Fatalf("canonical seed GraphQL=%d %s (%v)", response.StatusCode, raw, err)
		}
		return wire.Data
	}
	createQuery := `mutation DocumentBrowserSetupCreate($input:DocumentDraftInput!,$meta:CommandMeta!){createDocument(input:$input,meta:$meta){id slug title version}}`
	created := graph("verifier", createQuery, map[string]any{"input": map[string]any{"kind": "rule", "category": "guide", "title": "Document browser Guide seed", "body": "Guide history seed", "visibility": "public", "frontmatter": map[string]any{}}, "meta": map[string]string{"idempotencyKey": uuid.NewString()}})
	var guide struct {
		ID, Slug, Title string
		Version         int32
	}
	if err := json.Unmarshal(created["createDocument"], &guide); err != nil {
		t.Fatal(err)
	}
	updateQuery := `mutation DocumentBrowserSetupHistory($id:ID!,$input:DocumentEditInput!,$meta:CommandMeta!){updateDocument(id:$id,input:$input,meta:$meta){id version}}`
	for i := 0; i < 20; i++ {
		value := graph("verifier", updateQuery, map[string]any{"id": guide.ID, "input": map[string]any{"expectedRevision": guide.Version, "title": fmt.Sprintf("Document browser Guide history %02d", i)}, "meta": map[string]string{"idempotencyKey": uuid.NewString()}})
		if err := json.Unmarshal(value["updateDocument"], &guide); err != nil {
			t.Fatal(err)
		}
	}
	var setupReceiptKeys []string
	if err := fixture.pool.QueryRow(ctx, `SELECT array_agg(key ORDER BY key) FROM idempotency_keys WHERE completed_at IS NOT NULL`).Scan(&setupReceiptKeys); err != nil || len(setupReceiptKeys) != 21 {
		t.Fatalf("canonical setup receipt inventory=%d want21 (%v)", len(setupReceiptKeys), err)
	}
	write("canonical-setup-receipt-keys.json", setupReceiptKeys)
	documents["guide"] = map[string]any{"id": guide.ID, "slug": guide.Slug, "title": guide.Title, "body": "Guide history seed"}
	var guideRow int64
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM documents WHERE public_id=$1`, guide.ID).Scan(&guideRow); err != nil {
		t.Fatal(err)
	}
	docRows["guide"] = guideRow
	shortExpiry := time.Now().Add(45 * time.Second).Unix()
	tokens["short"], err = login.Mint(cfg.JWTSecret, login.Claims{MemberID: actors["owner"].publicID, Exp: shortExpiry})
	if err != nil {
		t.Fatal(err)
	}
	tokens["ownerNew"], err = login.Mint(cfg.JWTSecret, login.Claims{MemberID: actors["owner"].publicID, Exp: time.Now().Add(70 * time.Minute).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	actorIDs["short"], actorIDs["ownerNew"] = actors["owner"].publicID, actors["owner"].publicID
	inventory := map[string]any{"database": fixture.databaseName, "actors": actorIDs, "handles": handles, "regionId": regionID, "documents": documents, "locationSecret": locationSecret, "questIds": questIDs, "characterId": characterID, "summaryLinks": initialLinks, "shortExpiresAt": shortExpiry, "importedFrontmatter": importedFrontmatter}
	inventory["compatibility"] = map[string]any{
		"arc":       map[string]any{"id": compatibilityArcID, "name": compatibilityArcName, "createdBy": actors["owner"].publicID},
		"quest":     map[string]any{"id": questIDs[1], "shortCode": "DOCBROWSER1", "title": documents["brief-1"]["title"]},
		"character": map[string]string{"id": characterID, "shortCode": "DOCBROWSERPC", "name": "Document browser PC"},
		"player":    map[string]string{"id": actors["player"].publicID, "handle": handles["player"], "displayName": handles["player"]},
	}
	write("native-inventory.json", inventory)
	stdin, err := json.Marshal(map[string]any{"tokens": tokens, "inventory": inventory})
	if err != nil {
		t.Fatal(err)
	}
	commandCtx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()
	command = exec.CommandContext(commandCtx, node, filepath.Join(evidence, "attempt-input-"+filepath.Base(script)))
	command.Dir = root
	command.Env = append(os.Environ(), "DOCUMENT_REPO_ROOT="+root, "DOCUMENT_BROWSER_API_ORIGIN="+api.URL, "DOCUMENT_BROWSER_VITE_PORT="+strconv.Itoa(port))
	command.Stdin, command.Stdout, command.Stderr = bytes.NewReader(stdin), os.Stdout, os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error {
		if command.Process == nil {
			return nil
		}
		return syscall.Kill(-command.Process.Pid, syscall.SIGTERM)
	}
	command.WaitDelay = 5 * time.Second
	browserErr := command.Run()
	api.Close()
	observed, _ := observer.snapshot()
	write("http-observer.json", observed)
	hiddenRuleDenials := map[string]bool{"": true, actors["other"].publicID: true}
	for _, outcome := range observed {
		if outcome.Status == 200 && len(outcome.Codes) == 0 {
			continue
		}
		if outcome.expectedDenial {
			continue
		}
		if documentBrowserConsumeHiddenRuleDenial(outcome, guide.Slug, actors["other"].publicID, hiddenRuleDenials) {
			continue
		}
		allowed := outcome.Status == 200 && len(outcome.Codes) == 1
		if allowed {
			switch outcome.Codes[0] {
			case "FORBIDDEN":
				allowed = outcome.Operation == "DocumentBrowserDeniedRead" || outcome.Operation == "EditorDocumentBySlug" && outcome.MemberID == actors["other"].publicID || outcome.Operation == "EditPublishedDocument" && (outcome.MemberID == actors["archon"].publicID || outcome.MemberID == actors["verifier"].publicID) || outcome.Operation == "DocumentBrowserMetadata" && outcome.MemberID == actors["archon"].publicID || outcome.Operation == "RuleDetail" && outcome.MemberID == actors["player"].publicID || outcome.Operation == "CurrentReviewAccess" && outcome.MemberID == actors["verifier"].publicID
				allowed = allowed || outcome.MemberID == "" && (outcome.Operation == "RetainedDocumentById" || outcome.Operation == "RetainedDocumentBySlug" || outcome.Operation == "CodexEntry")
			case "CONFLICT":
				allowed = outcome.Operation == "EditorAudience" && outcome.MemberID == actors["verifier"].publicID || outcome.Operation == "DocumentBrowserMetadata" && outcome.MemberID == actors["player"].publicID
			case "NOT_FOUND":
				allowed = outcome.Operation == "DocumentBrowserMetadata" && outcome.MemberID == actors["player"].publicID
			case "INVALID":
				allowed = outcome.Operation == "DocumentBrowserMetadata" && outcome.MemberID == actors["owner"].publicID
			default:
				allowed = false
			}
		}
		if !allowed {
			t.Errorf("unexpected actual response: op=%s actor=%s status=%d codes=%v", outcome.Operation, outcome.MemberID, outcome.Status, outcome.Codes)
		}
	}
	if len(hiddenRuleDenials) != 0 {
		t.Errorf("missing exact hidden Rules denials: %d", len(hiddenRuleDenials))
	}
	var persisted json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM documents d),'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY source_id,target_type,target_id,relation) FROM document_links l),'receipts',(SELECT jsonb_agg(jsonb_build_object('actor',actor_id,'endpoint',endpoint,'key',key,'receipt',receipt,'completed',completed_at) ORDER BY actor_id,endpoint,key) FROM idempotency_keys),'notices',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM notifications n))`).Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	write("native-persisted-readback.json", persisted)
	var compatibilityArcAfter json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT to_jsonb(a) FROM quest_arcs a WHERE id=$1`, compatibilityArcRow).Scan(&compatibilityArcAfter); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(compatibilityArcBefore, compatibilityArcAfter) {
		t.Error("compatibility navigation changed the inventoried Arc row")
	}
	write("native-compatibility-readback.json", map[string]any{"arcBefore": compatibilityArcBefore, "arcAfter": compatibilityArcAfter, "unchanged": bytes.Equal(compatibilityArcBefore, compatibilityArcAfter)})
	var links json.RawMessage
	if err := fixture.pool.QueryRow(ctx, linksQuery, summary).Scan(&links); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(initialLinks, links) {
		t.Errorf("Summary links/append order changed: %s => %s", initialLinks, links)
	}
	count := func(want int, query string, args ...any) {
		t.Helper()
		var n int
		if err := fixture.pool.QueryRow(ctx, query, args...).Scan(&n); err != nil || n != want {
			t.Errorf("count=%d want=%d (%v): %s", n, want, err, query)
		}
	}
	for table, want := range map[string]int{"members": 21, "documents": 13, "quests": 2, "characters": 1, "quest_participants": 2, "archon_assignments": 1, "document_links": 5, "background_jobs": 0} {
		count(want, "SELECT count(*) FROM "+table)
	}
	count(1, `SELECT count(*) FROM quest_arcs`)
	count(1, `SELECT count(*) FROM quest_arcs WHERE id=$1 AND public_id=$2::uuid AND name=$3 AND created_by=$4`, compatibilityArcRow, compatibilityArcID, compatibilityArcName, actors["owner"].rowID)
	count(0, `SELECT count(*) FROM quests WHERE arc_id IS NOT NULL`)
	count(1, `SELECT count(*) FROM documents WHERE id=$1 AND body=$2 AND title='Document browser Location metadata' AND version=2`, location, locationBody)
	count(1, `SELECT count(*) FROM documents WHERE id=$1 AND title='Document browser Summary metadata' AND body='Summary browser original' AND version=5`, summary)
	count(1, `SELECT count(*) FROM documents WHERE id=$1 AND body='SAME ACCOUNT COMMITTED' AND status='draft' AND version=3`, docRows["private"])
	count(1, `SELECT count(*) FROM documents d WHERE public_id=$1 AND category='guide' AND status='published' AND visibility='public' AND policy IS NULL AND deleted_at IS NULL AND d.version=(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id)`, guide.ID)
	count(1, `SELECT count(*) FROM notifications WHERE kind='DOCUMENT_EDITED' AND subject_type='document' AND subject_id=$1 AND member_id=$2`, location, actors["owner"].rowID)
	count(0, `SELECT count(*) FROM documents WHERE title IN ('SHOULD NOT WRITE','LOCATION REVOKED WRITE','GUIDE REVOKED WRITE','STALE SUMMARY')`)
	count(1, `SELECT count(*) FROM members WHERE id=$1 AND roles @> ARRAY['player','verifier']::text[] AND cardinality(roles)=2`, actors["verifier"].rowID)
	var receipt struct {
		Completed, BrowserClosed, ViteClosed bool
		LocationReplayKey, SummaryReplayKey  string
		Created                              map[string]struct {
			ID, Slug, Actor, CreateKey string
			FinalVersion               int32
			Replay                     struct {
				ID, Slug string
				Version  int32
			}
			Commands []struct {
				Name, Key        string
				Version          int32
				ExpectedRevision *int32
				Ordinal          int
			}
		}
		FrontendChecks []struct {
			Stage, Receipt, ReceiptSha256, SourceManifestSha256, DistManifestSha256 string
			SourceInputs, DistFiles                                                 int
		}
		PrivateCollections struct {
			ID, Slug, BaselineVisibility  string
			BaselinePolicy                []string
			BaselineReaderIds             []string
			BaselineVersion, FinalVersion int32
			StartedAfterOrdinal           int
			Commands                      []struct {
				Actor, Key, Visibility    string
				ExpectedRevision, Version int32
				Policy, ReaderIds         []string
			}
			Reads []struct {
				Family, Actor, BodyHash string
				Visible                 bool
				Ordinal                 int
				IDs                     []string
			}
			LateResponse struct {
				RequestOrdinal               int
				RequestHash, ActualPrivateId string
				ActualStatus                 int
				Replacement, NoRestoration   bool
			}
			Logout     struct{ ActualUI, TokenRemoved, GuestSearchAndChronicleDenied bool }
			Withdrawal struct {
				AfterWarmOwnerCache  bool
				Version              int32
				BeforeRefetchOrdinal int
			}
		}
		SupplementStartOrdinal int
		OriginalCommandKeys    []string
		Supplement             map[string]struct {
			ID, Slug, Actor, CreateKey   string
			InitialVersion, FinalVersion int32
			Replay                       struct {
				ID, Slug string
				Version  int32
			}
			Commands []struct {
				Name, Key        string
				Version          int32
				ExpectedRevision *int32
				Ordinal          int
			}
		}
		SupplementAliases []struct {
			Href, ID, Slug, By string
			LookupOrdinal      *int
			ReaderOrdinal      int
			Reloaded           bool
		}
		Operations []struct {
			Kind, Key string
			Codes     []string
		}
		DirectReads []struct {
			Kind      string
			Codes     []string
			Variables struct {
				Meta struct{ IdempotencyKey string }
			}
		}
		Checks          []struct{ Name string }
		RemainingRoutes struct {
			StartedAfterOrdinal, AdditionalMutationCount int
			Aliases                                      []struct {
				Href, Destination, ID, Actor, Operation string
				ReaderOrdinal, ReloadOrdinal            int
				LookupOrdinal                           *int
				Reloaded                                bool
			}
			Boundaries []struct {
				Href, Result    string
				Ordinal         int
				NoGuessedLookup bool
			}
			Demos []struct {
				Href, Canonical, Screenshot string
				Width                       int
				LocalTyping                 bool
				Modes                       []string
				KeyboardFocus               struct {
					Visible        bool
					Outline, Width string
				}
			}
			Preview struct {
				Actor, BodyHash, Source string
				Ordinal                 int
			}
		}
	}
	raw, readErr := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if readErr == nil {
		readErr = json.Unmarshal(raw, &receipt)
	}
	if readErr != nil {
		t.Error(readErr)
	} else {
		for _, op := range receipt.Operations {
			if op.Kind == "mutation" && len(op.Codes) > 0 && op.Key != "" {
				count(0, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, op.Key)
			}
		}
		for _, op := range receipt.DirectReads {
			if op.Kind == "mutation" && len(op.Codes) > 0 {
				count(0, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, op.Variables.Meta.IdempotencyKey)
			}
		}
		for _, key := range []string{receipt.LocationReplayKey, receipt.SummaryReplayKey} {
			if key != "" {
				count(1, `SELECT count(*) FROM idempotency_keys WHERE key=$1 AND completed_at IS NOT NULL`, key)
			}
		}
		cases := []struct{ key, actor, kind, category, draftTitle, title, body string }{
			{"artifact", "admin", "codex_entry", "Artifact", "Document created Artifact draft", "Document created Artifact final", "ARTIFACT UI CREATED BODY"},
			{"guide", "admin", "rule", "guide", "Document created Guide draft", "Document created Guide final", "GUIDE UI CREATED BODY"},
			{"ruling", "admin", "rule", "ruling", "Document created Ruling draft", "Document created Ruling final", "RULING UI CREATED BODY"},
			{"dmTable", "owner", "community", "dm_table", "Document created DM table draft", "Document created DM table final", "DM TABLE UI CREATED BODY"},
		}
		if len(receipt.Created) != len(cases) {
			t.Errorf("actual created identities=%d want4", len(receipt.Created))
		}
		ids, slugs, commandKeys := map[string]bool{}, map[string]bool{}, map[string]bool{}
		allIDs := []string{}
		for _, original := range documents {
			ids[original["id"].(string)] = true
			allIDs = append(allIDs, original["id"].(string))
		}
		for _, expected := range cases {
			actual, ok := receipt.Created[expected.key]
			if !ok {
				t.Errorf("missing actual create %s", expected.key)
				continue
			}
			if _, err := uuid.Parse(actual.ID); err != nil || ids[actual.ID] || actual.Slug == "" || slugs[actual.Slug] || actual.Actor != expected.actor {
				t.Errorf("invalid/duplicate actual create identity %s", expected.key)
				continue
			}
			ids[actual.ID], slugs[actual.Slug] = true, true
			allIDs = append(allIDs, actual.ID)
			if actual.Replay.ID != actual.ID || actual.Replay.Slug != actual.Slug || actual.Replay.Version != 1 || len(actual.Commands) < 3 || len(actual.Commands) > 4 {
				t.Errorf("create replay/command chain invalid %s", expected.key)
				continue
			}
			if actual.Commands[0].Name != "CreateDocument" || actual.Commands[0].Key != actual.CreateKey || actual.Commands[len(actual.Commands)-1].Name != "PublishDocument" || actual.FinalVersion != int32(len(actual.Commands)) {
				t.Errorf("actual command boundaries invalid %s", expected.key)
			}
			count(1, `SELECT count(*) FROM documents d JOIN members a ON a.id=d.author_id JOIN members p ON p.id=d.published_by
				WHERE d.public_id=$1 AND d.slug=$2 AND d.kind=$3 AND d.category=$4 AND a.public_id=$5 AND p.id=a.id
				AND d.title=$6 AND d.body=$7 AND d.status='published' AND d.visibility='public' AND d.policy IS NULL
				AND d.deleted_at IS NULL AND d.deleted_by IS NULL AND d.published_at IS NOT NULL AND btrim(d.frontmatter_yaml,E' \t\r\n')='{}'
				AND d.version=$8 AND d.version=(SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id)
				AND NOT EXISTS(SELECT FROM document_readers dr WHERE dr.document_id=d.id)`, actual.ID, actual.Slug, expected.kind, expected.category, actorIDs[expected.actor], expected.title, expected.body, actual.FinalVersion)
			previousOrdinal := 0
			for index, proof := range actual.Commands {
				endpoint, reason, revisionTitle := "updateDocument", "updated", expected.title
				if index == 0 {
					endpoint, reason, revisionTitle = "createDocument", "created", expected.draftTitle
				} else if index == len(actual.Commands)-1 {
					endpoint, reason = "publishDocument", "published"
				}
				wantOperation := map[string]string{"createDocument": "CreateDocument", "updateDocument": "UpdateDocument", "publishDocument": "PublishDocument"}[endpoint]
				if proof.Name != wantOperation || proof.Version != int32(index+1) || proof.Key == "" || commandKeys[proof.Key] || proof.Ordinal <= previousOrdinal || (index == 0 && proof.ExpectedRevision != nil) || (index > 0 && (proof.ExpectedRevision == nil || *proof.ExpectedRevision != int32(index))) {
					t.Errorf("actual command proof invalid %s index%d", expected.key, index)
				}
				previousOrdinal, commandKeys[proof.Key] = proof.Ordinal, true
				count(1, `SELECT count(*) FROM idempotency_keys k JOIN members a ON a.id=k.actor_id WHERE a.public_id=$1 AND k.endpoint=$2 AND k.key=$3 AND k.completed_at IS NOT NULL AND k.receipt->>'Id'=$4 AND k.receipt->>'Slug'=$5 AND (k.receipt->>'Version')::integer=$6`, actorIDs[expected.actor], "graphql:"+endpoint, proof.Key, actual.ID, actual.Slug, proof.Version)
				count(1, `SELECT count(*) FROM document_revisions r JOIN documents d ON d.id=r.document_id JOIN members a ON a.id=r.created_by
					WHERE d.public_id=$1 AND r.rev=$2 AND r.reason=$3 AND r.title=$4 AND r.body=$5 AND a.public_id=$6
					AND r.visibility='public' AND r.policy IS NULL AND btrim(r.frontmatter_yaml,E' \t\r\n')='{}'
					AND (($7::boolean AND r.published_at IS NOT NULL AND r.published_by=a.id AND r.published_at=d.published_at) OR (NOT $7::boolean AND r.published_at IS NULL AND r.published_by IS NULL))`, actual.ID, proof.Version, reason, revisionTitle, expected.body, actorIDs[expected.actor], index == len(actual.Commands)-1)
			}
			count(len(actual.Commands), `SELECT count(*) FROM idempotency_keys k WHERE k.endpoint IN ('graphql:createDocument','graphql:updateDocument','graphql:publishDocument') AND k.receipt->>'Id'=$1 AND k.completed_at IS NOT NULL`, actual.ID)
		}
		// The three new records are declared separately from the original four
		// creates. Preserve the original57 receipts and prove every added effect.
		supplementCases := []struct {
			key, kind, category, draftTitle, title, body string
			initialVersion                               int32
		}{
			{"npc", "codex_entry", "NPC", "Document qualified NPC draft", "Document qualified NPC final", "QUALIFIED NPC CREATED BODY", 0},
			{"genericSummary", "summary", "", "Document bare Summary draft", "Document bare Summary final", "BARE SUMMARY CREATED BODY", 0},
			{"importedEntities", "codex_entry", "Entities", "Document imported Entities draft saved", "Document imported Entities final", "IMPORTED ENTITIES EDITED BODY", 1},
		}
		if len(receipt.Supplement) != len(supplementCases) {
			t.Errorf("supplement identities=%d want3", len(receipt.Supplement))
		}
		supplementKeys := []string{}
		for _, expected := range supplementCases {
			actual, ok := receipt.Supplement[expected.key]
			if !ok {
				t.Errorf("missing supplement %s", expected.key)
				continue
			}
			importedCase := expected.key == "importedEntities"
			if _, err := uuid.Parse(actual.ID); err != nil || actual.Actor != "owner" || actual.InitialVersion != expected.initialVersion || actual.Slug == "" {
				t.Errorf("invalid supplement identity %s", expected.key)
				continue
			}
			if importedCase {
				if actual.ID != documents["importedEntities"]["id"] || actual.Slug != documents["importedEntities"]["slug"] {
					t.Errorf("imported identity changed")
				}
			} else {
				if ids[actual.ID] || slugs[actual.Slug] {
					t.Errorf("duplicate supplement identity %s", expected.key)
				}
				ids[actual.ID], slugs[actual.Slug] = true, true
				allIDs = append(allIDs, actual.ID)
			}
			if len(actual.Commands) < 3 || len(actual.Commands) > 4 || actual.FinalVersion != expected.initialVersion+int32(len(actual.Commands)) {
				t.Errorf("supplement command count/version invalid %s", expected.key)
				continue
			}
			wantNames := []string{"CreateDocument", "UpdateDocument", "PublishDocument"}
			if importedCase {
				wantNames = []string{"UpdateDocument", "PublishDocument", "EditPublishedDocument"}
			}
			if len(actual.Commands) == 4 {
				wantNames = append([]string{wantNames[0], "UpdateDocument"}, wantNames[1:]...)
			}
			if !importedCase && (actual.CreateKey != actual.Commands[0].Key || actual.Replay.ID != actual.ID || actual.Replay.Slug != actual.Slug || actual.Replay.Version != 1) {
				t.Errorf("supplement create replay invalid %s", expected.key)
			}
			if importedCase && (actual.CreateKey != "" || actual.Replay.ID != actual.ID || actual.Replay.Slug != actual.Slug || actual.Replay.Version != actual.FinalVersion) {
				t.Error("imported published edit replay invalid")
			}
			var category any
			if expected.category != "" {
				category = expected.category
			}
			frontmatter := "{}\n"
			baselineRevisions := 0
			if importedCase {
				frontmatter, baselineRevisions = importedRaw, importedRevisionCount
			}
			count(1, `SELECT count(*) FROM documents d JOIN members a ON a.id=d.author_id JOIN members p ON p.id=d.published_by
				WHERE d.public_id=$1 AND d.slug=$2 AND d.kind=$3 AND d.category IS NOT DISTINCT FROM $4::text
				AND a.public_id=$5 AND p.id=a.id AND d.title=$6 AND d.body=$7 AND d.status='published'
				AND d.visibility='public' AND d.policy IS NULL AND d.deleted_at IS NULL AND d.deleted_by IS NULL
				AND d.published_at IS NOT NULL AND d.frontmatter_yaml=$8 AND d.version=$9
				AND NOT EXISTS(SELECT FROM document_readers dr WHERE dr.document_id=d.id)
				AND NOT EXISTS(SELECT FROM document_links l WHERE l.source_id=d.id)`, actual.ID, actual.Slug, expected.kind, category, actorIDs["owner"], expected.title, expected.body, frontmatter, actual.FinalVersion)
			count(baselineRevisions+len(actual.Commands), `SELECT count(*) FROM document_revisions r JOIN documents d ON d.id=r.document_id WHERE d.public_id=$1`, actual.ID)
			previousOrdinal, published := 0, false
			for index, proof := range actual.Commands {
				if proof.Name != wantNames[index] || proof.Version != expected.initialVersion+int32(index+1) || proof.Key == "" || commandKeys[proof.Key] || proof.Ordinal <= previousOrdinal || proof.Ordinal <= receipt.SupplementStartOrdinal || (proof.Name == "CreateDocument" && proof.ExpectedRevision != nil) || (proof.Name != "CreateDocument" && (proof.ExpectedRevision == nil || *proof.ExpectedRevision != expected.initialVersion+int32(index))) {
					t.Errorf("invalid supplement command %s index%d", expected.key, index)
				}
				previousOrdinal, commandKeys[proof.Key] = proof.Ordinal, true
				supplementKeys = append(supplementKeys, proof.Key)
				endpoint := map[string]string{"CreateDocument": "createDocument", "UpdateDocument": "updateDocument", "PublishDocument": "publishDocument", "EditPublishedDocument": "editPublishedDocument"}[proof.Name]
				reason, revisionTitle, revisionBody := "updated", expected.title, expected.body
				if proof.Name == "CreateDocument" {
					reason, revisionTitle = "created", expected.draftTitle
				}
				if importedCase && proof.Name != "EditPublishedDocument" {
					revisionTitle, revisionBody = expected.draftTitle, "IMPORTED ENTITIES ORIGINAL BODY"
				}
				if proof.Name == "PublishDocument" {
					reason, published = "published", true
				}
				count(1, `SELECT count(*) FROM idempotency_keys k JOIN members a ON a.id=k.actor_id WHERE a.public_id=$1 AND k.endpoint=$2 AND k.key=$3 AND k.completed_at IS NOT NULL AND k.receipt->>'Id'=$4 AND k.receipt->>'Slug'=$5 AND (k.receipt->>'Version')::integer=$6`, actorIDs["owner"], "graphql:"+endpoint, proof.Key, actual.ID, actual.Slug, proof.Version)
				count(1, `SELECT count(*) FROM document_revisions r JOIN documents d ON d.id=r.document_id JOIN members a ON a.id=r.created_by
					WHERE d.public_id=$1 AND r.rev=$2 AND r.reason=$3 AND r.title=$4 AND r.body=$5 AND a.public_id=$6
					AND r.visibility='public' AND r.policy IS NULL AND r.frontmatter_yaml=$7
					AND (($8::boolean AND r.published_at IS NOT NULL AND r.published_by=a.id AND r.published_at=d.published_at) OR (NOT $8::boolean AND r.published_at IS NULL AND r.published_by IS NULL))`, actual.ID, baselineRevisions+index+1, reason, revisionTitle, revisionBody, actorIDs["owner"], frontmatter, published)
			}
			count(len(actual.Commands), `SELECT count(*) FROM idempotency_keys k WHERE k.endpoint IN ('graphql:createDocument','graphql:updateDocument','graphql:publishDocument','graphql:editPublishedDocument') AND k.receipt->>'Id'=$1 AND k.completed_at IS NOT NULL`, actual.ID)
		}
		privateKeys := []string{}
		private := receipt.PrivateCollections
		if private.ID != documents["summary"]["id"] || private.Slug != documents["summary"]["slug"] || private.BaselineVersion != 2 || private.FinalVersion != 5 || private.BaselineVisibility != "public" || private.BaselinePolicy != nil || len(private.BaselineReaderIds) != 0 || len(private.Commands) != 3 || private.StartedAfterOrdinal <= receipt.SupplementStartOrdinal {
			t.Error("private collection declared identity/baseline/effect chain invalid")
		}
		count(1, `SELECT count(*) FROM idempotency_keys WHERE key=$1 AND endpoint='graphql:editPublishedDocument' AND receipt->>'Id'=$2 AND (receipt->>'Version')::integer=2 AND completed_at IS NOT NULL`, receipt.SummaryReplayKey, private.ID)
		count(1, `SELECT count(*) FROM document_revisions WHERE document_id=$1 AND rev=1 AND reason='updated' AND title='Document browser Summary metadata' AND body='Summary browser original' AND frontmatter_yaml='{}' AND visibility='public' AND policy IS NULL AND created_by=$2`, summary, actors["player"].rowID)
		for index, command := range private.Commands {
			if index > 2 {
				t.Error("unexpected private collection effect")
				break
			}
			wantVisibility := "restricted"
			wantPolicy := []string{"member:@" + handles["owner"]}
			if index == 1 {
				wantPolicy = []string{"member:@" + handles["other"]}
			}
			if index == 2 {
				wantVisibility, wantPolicy = "public", nil
			}
			if command.Actor != "player" || command.Key == "" || command.ExpectedRevision != int32(index+2) || command.Version != int32(index+3) || command.Visibility != wantVisibility || !reflect.DeepEqual(command.Policy, wantPolicy) || len(command.ReaderIds) != 0 {
				t.Errorf("private collection effect mismatch index%d", index)
			}
			privateKeys = append(privateKeys, command.Key)
			policy, err := json.Marshal(wantPolicy)
			if err != nil {
				t.Fatal(err)
			}
			count(1, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:setDocumentVisibility' AND key=$2 AND completed_at IS NOT NULL AND receipt->>'Id'=$3 AND receipt->>'Slug'=$4 AND (receipt->>'Version')::integer=$5`, actors["player"].rowID, command.Key, private.ID, private.Slug, command.Version)
			count(1, `SELECT count(*) FROM document_revisions WHERE document_id=$1 AND rev=$2 AND reason='audience_changed' AND title='Document browser Summary metadata' AND body='Summary browser original' AND frontmatter_yaml='{}' AND created_by=$3 AND visibility=$4 AND (($5::boolean AND policy IS NULL) OR (NOT $5::boolean AND policy=$6::jsonb)) AND published_at IS NULL AND published_by IS NULL`, summary, index+2, actors["player"].rowID, wantVisibility, index == 2, string(policy))
		}
		count(4, `SELECT count(*) FROM document_revisions WHERE document_id=$1`, summary)
		count(1, `SELECT count(*) FROM documents WHERE id=$1 AND author_id=$2 AND category IS NULL AND status='published' AND visibility='public' AND policy IS NULL AND frontmatter_yaml='{}' AND published_at IS NULL AND published_by IS NULL AND deleted_at IS NULL AND NOT EXISTS(SELECT FROM document_readers WHERE document_id=$1)`, summary, actors["player"].rowID)
		if private.LateResponse.RequestOrdinal <= private.StartedAfterOrdinal || len(private.LateResponse.RequestHash) != 64 || private.LateResponse.ActualStatus != 200 || private.LateResponse.ActualPrivateId != private.ID || private.LateResponse.Replacement || !private.LateResponse.NoRestoration || !private.Logout.ActualUI || !private.Logout.TokenRemoved || !private.Logout.GuestSearchAndChronicleDenied || !private.Withdrawal.AfterWarmOwnerCache || private.Withdrawal.Version != 4 || private.Withdrawal.BeforeRefetchOrdinal <= private.StartedAfterOrdinal {
			t.Error("private collection causal late-response/logout/withdrawal proof missing")
		}
		for _, expected := range []struct {
			family, actor string
			visible       bool
		}{{"Search", "owner", true}, {"Search", "other", false}, {"Search", "guest", false}, {"ChronicleList", "owner", true}, {"ChronicleList", "other", false}, {"ChronicleList", "guest", false}, {"ChronicleDetail", "owner", true}} {
			matched := false
			for _, read := range private.Reads {
				if read.Family == expected.family && read.Actor == expected.actor && read.Visible == expected.visible && read.Ordinal > private.StartedAfterOrdinal && len(read.BodyHash) == 64 {
					matched = true
				}
			}
			if !matched {
				t.Errorf("missing current private collection read %s/%s/%v", expected.family, expected.actor, expected.visible)
			}
		}
		for _, family := range []string{"Search", "ChronicleList"} {
			matched := false
			for _, read := range private.Reads {
				if read.Family == family && read.Actor == "owner" && !read.Visible && read.Ordinal > private.Withdrawal.BeforeRefetchOrdinal {
					matched = true
				}
			}
			if !matched {
				t.Errorf("missing post-withdrawal current owner %s denial", family)
			}
		}
		if len(receipt.FrontendChecks) != 2 {
			t.Error("missing before/after production frontend binding")
		} else {
			first, last := receipt.FrontendChecks[0], receipt.FrontendChecks[1]
			if first.Stage != "before" || last.Stage != "after" || first.Receipt != frontendReceipt || last.Receipt != frontendReceipt || len(first.ReceiptSha256) != 64 || first.ReceiptSha256 != last.ReceiptSha256 || first.SourceManifestSha256 != last.SourceManifestSha256 || first.DistManifestSha256 != last.DistManifestSha256 || first.SourceInputs <= 0 || first.SourceInputs != last.SourceInputs || first.DistFiles <= 0 || first.DistFiles != last.DistFiles {
				t.Error("production frontend identity drift")
			}
		}
		originalKeys := append(append([]string{}, setupReceiptKeys...), receipt.OriginalCommandKeys...)
		if len(originalKeys) != 57 || len(receipt.OriginalCommandKeys) != 36 || receipt.SupplementStartOrdinal <= 0 {
			t.Errorf("original attributable receipt keys=%d browser=%d boundary=%d", len(originalKeys), len(receipt.OriginalCommandKeys), receipt.SupplementStartOrdinal)
		}
		keySet := map[string]bool{}
		for _, key := range append(append(append([]string{}, originalKeys...), supplementKeys...), privateKeys...) {
			if key == "" || keySet[key] {
				t.Errorf("empty/duplicate original/supplement receipt key")
			}
			keySet[key] = true
		}
		count(57, `SELECT count(*) FROM idempotency_keys WHERE key=ANY($1::text[]) AND completed_at IS NOT NULL`, originalKeys)
		count(0, `SELECT count(*) FROM idempotency_keys WHERE NOT(key=ANY($1::text[]))`, append(append(append([]string{}, originalKeys...), supplementKeys...), privateKeys...))
		count(57, `SELECT count(*) FROM idempotency_keys WHERE NOT(key=ANY($1::text[])) AND completed_at IS NOT NULL`, append(append([]string{}, supplementKeys...), privateKeys...))
		count(len(supplementKeys), `SELECT count(*) FROM idempotency_keys WHERE key=ANY($1::text[]) AND completed_at IS NOT NULL`, supplementKeys)
		count(69, `SELECT count(*) FROM idempotency_keys WHERE key=ANY($1::text[]) AND completed_at IS NOT NULL`, append(append([]string{}, originalKeys...), supplementKeys...))
		count(3, `SELECT count(*) FROM idempotency_keys WHERE key=ANY($1::text[]) AND completed_at IS NOT NULL`, privateKeys)
		count(72, `SELECT count(*) FROM idempotency_keys WHERE completed_at IS NOT NULL`)
		count(1, `SELECT count(*) FROM notifications`)
		count(0, `SELECT count(*) FROM idempotency_keys WHERE completed_at IS NULL`)
		if len(allIDs) != 13 {
			t.Errorf("exact Document identity union=%d want13", len(allIDs))
		}
		wantAliases := []struct{ prefix, by string }{{"/codex/npc/", "slug"}, {"/codex/faction/", "slug"}, {"/codex/region/", "slug"}, {"/codex/location/", "slug"}, {"/npcs/", "slug"}, {"/factions/", "slug"}, {"/codex/artifact/", "id"}, {"/codex/event/", "id"}, {"/codex/lore/", "id"}}
		if len(receipt.SupplementAliases) != len(wantAliases) {
			t.Errorf("reader alias proofs=%d want9", len(receipt.SupplementAliases))
		}
		for index, alias := range receipt.SupplementAliases {
			if index >= len(wantAliases) {
				break
			}
			npc, want := receipt.Supplement["npc"], wantAliases[index]
			identity := npc.Slug
			if want.by == "id" {
				identity = npc.ID
			}
			if alias.Href != want.prefix+identity || alias.ID != npc.ID || alias.Slug != npc.Slug || alias.By != want.by || !alias.Reloaded || alias.ReaderOrdinal <= 0 || (want.by == "id" && (alias.LookupOrdinal == nil || *alias.LookupOrdinal <= 0 || *alias.LookupOrdinal >= alias.ReaderOrdinal)) || (want.by == "slug" && alias.LookupOrdinal != nil) {
				t.Errorf("invalid actual alias proof index%d", index)
			}
		}
		count(0, `SELECT count(*) FROM documents WHERE NOT(public_id=ANY($1::uuid[]))`, allIDs)
		remaining := receipt.RemainingRoutes
		if len(receipt.Checks) != 18 || receipt.Checks[17].Name != "Remaining compatibility readers and public editor demonstration preserve identity and leave no product writes" || remaining.StartedAfterOrdinal <= 0 || remaining.AdditionalMutationCount != 0 {
			t.Error("missing complete compatibility stage or unexpected additional mutation")
		}
		npc := receipt.Supplement["npc"]
		wantRoutes := map[string]struct{ destination, id, operation string }{
			"/quests/DOCBROWSER1/redirect":                {"/quests/DOCBROWSER1", questIDs[1], "Quest"},
			"/characters/DOCBROWSERPC/redirect":           {"/characters/DOCBROWSERPC", characterID, "Character"},
			"/players/" + handles["player"] + "/redirect": {"/players/" + handles["player"], actors["player"].publicID, "MemberProfile"},
			"/factions/" + npc.Slug + "/redirect":         {"/codex/" + npc.Slug, npc.ID, "CodexEntry"},
			"/npcs/" + npc.Slug + "/redirect":             {"/codex/" + npc.Slug, npc.ID, "CodexEntry"},
			"/series/" + compatibilityArcID + "/redirect": {"/series/" + compatibilityArcID, compatibilityArcID, "RetainedSeriesArc"},
		}
		for _, suffix := range []string{"", "/redirect"} {
			for _, identity := range []string{npc.ID, npc.Slug} {
				wantRoutes["/guilds/"+identity+suffix] = struct{ destination, id, operation string }{"/codex/" + npc.Slug, npc.ID, "CodexEntry"}
			}
		}
		if len(remaining.Aliases) != len(wantRoutes) {
			t.Errorf("compatibility reader proofs=%d want%d", len(remaining.Aliases), len(wantRoutes))
		}
		for _, alias := range remaining.Aliases {
			want, ok := wantRoutes[alias.Href]
			if !ok || alias.Destination != want.destination || alias.ID != want.id || alias.Operation != want.operation || alias.Actor != "guest" || !alias.Reloaded || alias.ReaderOrdinal <= remaining.StartedAfterOrdinal || alias.ReloadOrdinal <= alias.ReaderOrdinal {
				t.Errorf("invalid exact compatibility proof %s", alias.Href)
			}
			if strings.HasPrefix(alias.Href, "/guilds/") && (alias.LookupOrdinal == nil || *alias.LookupOrdinal <= remaining.StartedAfterOrdinal || *alias.LookupOrdinal >= alias.ReaderOrdinal) {
				t.Errorf("Guild lookup lacks actual identity proof %s", alias.Href)
			}
			delete(wantRoutes, alias.Href)
		}
		if len(wantRoutes) != 0 {
			t.Error("missing declared compatibility identities")
		}
		wantBoundaries := map[string]string{
			"/guilds/route-compatibility-unmapped":          "unmapped",
			"/guilds/route-compatibility-unmapped/redirect": "unmapped",
			"/series/route-compatibility-unmapped/redirect": "unmapped",
		}
		privateID, _ := documents["private"]["id"].(string)
		privateSlug, _ := documents["private"]["slug"].(string)
		for _, href := range []string{"/guilds/" + privateID, "/guilds/" + privateSlug + "/redirect", "/factions/" + privateSlug + "/redirect", "/npcs/" + privateSlug + "/redirect"} {
			wantBoundaries[href] = "FORBIDDEN"
		}
		if len(remaining.Boundaries) != len(wantBoundaries) {
			t.Error("missing private/unmapped compatibility boundaries")
		}
		for _, boundary := range remaining.Boundaries {
			want, ok := wantBoundaries[boundary.Href]
			if !ok || boundary.Result != want || boundary.Href == "/series/route-compatibility-unmapped/redirect" && !boundary.NoGuessedLookup || boundary.Href != "/series/route-compatibility-unmapped/redirect" && boundary.Ordinal <= remaining.StartedAfterOrdinal {
				t.Errorf("invalid compatibility boundary %s", boundary.Href)
			}
			delete(wantBoundaries, boundary.Href)
		}
		if len(wantBoundaries) != 0 {
			t.Error("missing exact compatibility denial or unmapped route")
		}
		if len(remaining.Demos) != 3 {
			t.Error("three real demo widths required")
		}
		for index, demo := range remaining.Demos {
			if index >= 3 {
				break
			}
			wantWidth := []int{390, 900, 1920}[index]
			wantHref := "/editor-demo"
			if wantWidth == 900 {
				wantHref = "/_demo"
			}
			if demo.Width != wantWidth || demo.Href != wantHref || demo.Canonical != "/editor-demo" || !demo.LocalTyping || !demo.KeyboardFocus.Visible || demo.KeyboardFocus.Outline == "none" || !reflect.DeepEqual(demo.Modes, []string{"dark", "light"}) || demo.Screenshot != fmt.Sprintf("public-editor-demo-%d.png", wantWidth) {
				t.Error("missing real demo typing/focus/theme/layout proof")
			}
		}
		if remaining.Preview.Actor != "owner" || remaining.Preview.Ordinal <= remaining.StartedAfterOrdinal || len(remaining.Preview.BodyHash) != 64 || remaining.Preview.Source != "DEMO PREVIEW **actual response**" {
			t.Error("demo Read lacks actual authorized preview response")
		}
		if !receipt.Completed || !receipt.BrowserClosed || !receipt.ViteClosed {
			t.Error("Document browser did not finish and close owned resources")
		}
	}
	if browserErr != nil {
		t.Fatal("actual Document browser:", browserErr)
	}
}

func documentBrowserConsumeHiddenRuleDenial(outcome questBrowserHTTPResult, guideSlug, otherID string, remaining map[string]bool) bool {
	if guideSlug == "" || otherID == "" || (outcome.MemberID != "" && outcome.MemberID != otherID) || !remaining[outcome.MemberID] || outcome.Operation != "RuleDetail" || outcome.Kind != "query" || outcome.Key != "" || outcome.Status != http.StatusOK || !reflect.DeepEqual(outcome.Codes, []string{"FORBIDDEN"}) || outcome.RuleDetailSlugHash != fmt.Sprintf("%x", sha256.Sum256([]byte(guideSlug))) {
		return false
	}
	delete(remaining, outcome.MemberID)
	return true
}

func TestDocumentBrowserHiddenRuleDenial(t *testing.T) {
	const slug, other = "actual-fixture-private-guide", "actual-unrelated-member"
	valid := questBrowserHTTPResult{Operation: "RuleDetail", Kind: "query", Status: http.StatusOK, Codes: []string{"FORBIDDEN"}, RuleDetailSlugHash: fmt.Sprintf("%x", sha256.Sum256([]byte(slug)))}
	for _, sample := range []struct {
		name  string
		alter func(*questBrowserHTTPResult)
	}{
		{"wrong operation", func(v *questBrowserHTTPResult) { v.Operation = "CodexEntry" }},
		{"wrong kind", func(v *questBrowserHTTPResult) { v.Kind = "mutation" }},
		{"wrong actor", func(v *questBrowserHTTPResult) { v.MemberID = "another-member" }},
		{"wrong Guide", func(v *questBrowserHTTPResult) {
			v.RuleDetailSlugHash = fmt.Sprintf("%x", sha256.Sum256([]byte("other-guide")))
		}},
		{"missing identity", func(v *questBrowserHTTPResult) { v.RuleDetailSlugHash = "" }},
		{"wrong status", func(v *questBrowserHTTPResult) { v.Status = http.StatusForbidden }},
		{"no code", func(v *questBrowserHTTPResult) { v.Codes = nil }},
		{"wrong code", func(v *questBrowserHTTPResult) { v.Codes = []string{"NOT_FOUND"} }},
		{"multiple codes", func(v *questBrowserHTTPResult) { v.Codes = []string{"FORBIDDEN", "FORBIDDEN"} }},
		{"command key", func(v *questBrowserHTTPResult) { v.Key = "unexpected-command" }},
	} {
		t.Run(sample.name, func(t *testing.T) {
			outcome := valid
			sample.alter(&outcome)
			remaining := map[string]bool{"": true, other: true}
			if documentBrowserConsumeHiddenRuleDenial(outcome, slug, other, remaining) || len(remaining) != 2 {
				t.Fatal("invalid denial consumed expected coverage")
			}
		})
	}
	t.Run("one actual denial per expected actor", func(t *testing.T) {
		remaining := map[string]bool{"": true, other: true}
		for _, actor := range []string{"", other} {
			outcome := valid
			outcome.MemberID = actor
			if !documentBrowserConsumeHiddenRuleDenial(outcome, slug, other, remaining) || documentBrowserConsumeHiddenRuleDenial(outcome, slug, other, remaining) {
				t.Fatal("expected exact-once denial not enforced")
			}
		}
		if len(remaining) != 0 {
			t.Fatal("expected actor coverage not consumed")
		}
	})
	t.Run("invalid expectations cannot admit denial", func(t *testing.T) {
		for _, expectation := range []struct{ slug, other string }{{"", other}, {slug, ""}} {
			remaining := map[string]bool{"": true, other: true}
			if documentBrowserConsumeHiddenRuleDenial(valid, expectation.slug, expectation.other, remaining) || len(remaining) != 2 {
				t.Fatal("empty expected identity admitted a denial")
			}
		}
		if documentBrowserConsumeHiddenRuleDenial(valid, slug, other, nil) {
			t.Fatal("missing expected actor admitted a denial")
		}
	})
}
