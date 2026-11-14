//go:build integration && frontend_acceptance

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
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
)

// TestMapBrowserCurrentSession uses only a new migration-only database and real
// Wire/HTTP/Chromium. The explicit release prevents accidental runtime starts.
func TestMapBrowserCurrentSession(t *testing.T) {
	if os.Getenv("MAP_SESSION_RUNTIME_RELEASE") != "isolated-map-session" {
		t.Fatal("explicit isolated Map runtime release is required")
	}
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("omit DATABASE_URL; this fixture owns a disposable database")
	}
	script, evidence := os.Getenv("MAP_SESSION_BROWSER_SCRIPT"), os.Getenv("MAP_SESSION_BROWSER_EVIDENCE")
	if !filepath.IsAbs(script) || !filepath.IsAbs(evidence) {
		t.Fatal("absolute MAP_SESSION_BROWSER_SCRIPT and MAP_SESSION_BROWSER_EVIDENCE are required")
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
			t.Fatalf("fresh attempt directory required: %s (%v)", name, err)
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
	before := questBrowserRuntimeInputs(t, root)
	write("production-inputs-before.json", before)
	owned := map[string][]byte{}
	identities := map[string]string{}
	for _, source := range []string{
		script,
		filepath.Join(root, "apps/api/cmd/api/map_session_browser_integration_test.go"),
		filepath.Join(root, "apps/api/cmd/api/quest_browser_integration_test.go"),
		filepath.Join(root, "apps/api/cmd/api/authority_integration_test.go"),
		filepath.Join(root, "apps/api/cmd/api/graphql_product_fixture_test.go"),
	} {
		raw, err := os.ReadFile(source)
		if err != nil {
			t.Fatal(err)
		}
		owned[source] = raw
		copyPath := filepath.Join(evidence, "attempt-input-"+filepath.Base(source))
		owned[copyPath] = raw
		identities[copyPath] = fmt.Sprintf("%x", sha256.Sum256(raw))
		identities[source] = fmt.Sprintf("%x", sha256.Sum256(raw))
		if err := os.WriteFile(filepath.Join(evidence, "attempt-input-"+filepath.Base(source)), raw, 0o444); err != nil {
			t.Fatal(err)
		}
	}
	write("owned-inputs.json", identities)
	t.Cleanup(func() {
		after := questBrowserRuntimeInputs(t, root)
		write("production-inputs-after.json", after)
		if !reflect.DeepEqual(before, after) {
			t.Error("production source changed during Map acceptance")
		}
		for source, raw := range owned {
			current, err := os.ReadFile(source)
			if err != nil || !bytes.Equal(raw, current) {
				t.Errorf("owned source changed: %s (%v)", source, err)
			}
		}
	})
	fixture := newProductFixture(t)
	ctx := context.Background()
	var api *httptest.Server
	var runtime app.API
	var listeners []string
	t.Cleanup(func() {
		if api != nil {
			api.Close()
		}
		if runtime.Pool != nil {
			runtime.Pool.Close()
		}
		if err := fixture.close(); err != nil {
			t.Error(err)
			return
		}
		var remaining int
		if err := fixture.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, fixture.databaseName).Scan(&remaining); err != nil {
			t.Error(err)
			return
		}
		closed := true
		for _, address := range listeners {
			connection, err := net.DialTimeout("tcp", address, time.Second)
			if err == nil {
				_ = connection.Close()
				closed = false
				t.Errorf("owned listener remains: %s", address)
			}
		}
		write("native-cleanup.json", map[string]any{"database": fixture.databaseName, "databaseDropped": remaining == 0, "listenersClosed": closed, "at": time.Now().UTC()})
		if remaining != 0 {
			t.Error("disposable database still exists")
		}
	})
	var initial int
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM maps)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM regions)`).Scan(&initial); err != nil || initial != 0 {
		t.Fatalf("migration-only initial rows=%d (%v)", initial, err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	listeners = append(listeners, fmt.Sprintf("127.0.0.1:%d", port))
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-map-session-fixture-key", CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	rows := &authorityDBFixture{pool: fixture.pool, cfg: cfg}
	actors := map[string]authorityDBMember{
		"a":         rows.member(t, auth.Archon, auth.Player),
		"b":         rows.member(t, auth.Archon, auth.Player),
		"unrelated": rows.member(t, auth.Archon, auth.Player),
		"admin":     rows.member(t, auth.Admin, auth.Archon, auth.Player),
	}
	tokens, actorIDs := map[string]string{}, map[string]string{}
	for name, actor := range actors {
		rows.exec(t, `UPDATE members SET status='active',handle=$2,display_name=$2 WHERE id=$1`, actor.rowID, "map-session-"+name)
		actorIDs[name] = actor.publicID
		tokens[name] = rows.token(t, actor.publicID) // Empty token roles; persisted authority is mandatory.
	}
	regionIDs, regionRows := map[string]string{}, map[string]int64{}
	for _, name := range []string{"target", "other"} {
		regionIDs[name] = uuid.NewString()
		var row int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,$2,'archon') RETURNING id`, regionIDs[name], "Map session "+name+" Region").Scan(&row); err != nil {
			t.Fatal(err)
		}
		regionRows[name] = row
	}
	for name, actor := range actors {
		region := regionRows["target"]
		if name == "unrelated" {
			region = regionRows["other"]
		}
		rows.exec(t, `INSERT INTO archon_assignments(member_id,region_id) VALUES($1,$2)`, actor.rowID, region)
	}
	maps := map[string]map[string]any{}
	mapRows, nodeRows := map[string]int64{}, map[string]int64{}
	for _, name := range []string{"primary", "secondary"} {
		id, atlas := uuid.NewString(), "MAP-SESSION-"+strings.ToUpper(name)
		var row int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO maps(public_id,name,atlas_code,map_kind,family,region_id,created_by) VALUES($1,$2,$3,'pointcrawl','campaign',$4,$5) RETURNING id`, id, "Map session "+name, atlas, regionRows["target"], actors["a"].rowID).Scan(&row); err != nil {
			t.Fatal(err)
		}
		mapRows[name] = row
		maps[name] = map[string]any{"id": id, "atlasCode": atlas, "name": "Map session " + name}
	}
	nodes := map[string]map[string]string{}
	for _, name := range []string{"gate", "watch", "secondary"} {
		mapName := "primary"
		if name == "secondary" {
			mapName = "secondary"
		}
		id := uuid.NewString()
		var row int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) VALUES($1,$2,$3,$4,1,clock_timestamp()) RETURNING id`, id, mapRows[mapName], "Map session "+name, len(nodes)*100).Scan(&row); err != nil {
			t.Fatal(err)
		}
		nodeRows[name] = row
		nodes[name] = map[string]string{"id": id, "name": "Map session " + name}
	}
	edgeID := uuid.NewString()
	rows.exec(t, `INSERT INTO pointcrawl_edges(public_id,map_id,node_a,node_b,directed,kind,label) VALUES($1,$2,$3,$4,false,'path','Map session original edge')`, edgeID, mapRows["primary"], nodeRows["gate"], nodeRows["watch"])
	documents := map[string]map[string]string{}
	for _, name := range []string{"public", "private"} {
		id, status := uuid.NewString(), "published"
		if name == "private" {
			status = "draft"
		}
		var row int64
		title, body := "Map session "+name+" Location", "Map session "+name+" body"
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) VALUES($1,'codex_entry',$2,$3,'Locations',$4,'public',$5,$6,1) RETURNING id`, id, "map-session-"+name, title, status, body, actors["a"].rowID).Scan(&row); err != nil {
			t.Fatal(err)
		}
		node, relation := "gate", "location"
		if name == "private" {
			node, relation = "watch", "subject"
		}
		rows.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) VALUES($1,$2,$3,$4,clock_timestamp(),$5)`, mapRows["primary"], nodeRows[node], row, relation, actors["a"].rowID)
		documents[name] = map[string]string{"id": id, "slug": "map-session-" + name, "title": title, "body": body, "status": status}
	}
	// Regions compose existing canonical Documents, as the retained QA world does.
	// The second reference must remain null for callers denied its draft Document.
	for region, document := range map[string]string{"target": "public", "other": "private"} {
		rows.exec(t, `UPDATE regions SET document_id=(SELECT id FROM documents WHERE public_id=$2) WHERE public_id=$1`, regionIDs[region], documents[document]["id"])
	}
	inventory := map[string]any{"database": fixture.databaseName, "actors": actorIDs, "regions": regionIDs, "maps": maps, "nodes": nodes, "edgeId": edgeID, "documents": documents, "initialRows": map[string]int{"members": 4, "regions": 2, "assignments": 4, "maps": 2, "nodes": 3, "edges": 1, "documents": 2, "links": 2, "regionDocumentReferences": 2}, "maximumNewRows": map[string]int{"maps": 2, "nodes": 2, "edges": 1}}
	write("native-inventory.json", inventory)
	runtime = wireForTest(ctx, cfg)
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("real Wire did not bind the fixture")
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
	listeners = append(listeners, strings.TrimPrefix(api.URL, "http://"))
	stdin, err := json.Marshal(map[string]any{"tokens": tokens, "inventory": inventory})
	if err != nil {
		t.Fatal(err)
	}
	commandCtx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()
	command := exec.CommandContext(commandCtx, node, filepath.Join(evidence, "attempt-input-"+filepath.Base(script)))
	command.Dir = root
	command.Env = append(os.Environ(), "MAP_SESSION_API_ORIGIN="+api.URL, "MAP_SESSION_VITE_PORT="+strconv.Itoa(port))
	command.Stdin, command.Stdout, command.Stderr = bytes.NewReader(stdin), os.Stdout, os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error { return syscall.Kill(-command.Process.Pid, syscall.SIGTERM) }
	command.WaitDelay = 5 * time.Second
	browserErr := command.Run()
	api.Close()
	observed, _ := observer.snapshot()
	outcomes := []map[string]any{}
	denials, invalid := 0, 0
	privateDenials := map[string]int{}
	expectedPrivateDenials := map[string]int{actors["b"].publicID: 2, actors["unrelated"].publicID: 1, "": 1}
	for _, result := range observed {
		outcomes = append(outcomes, map[string]any{"operation": result.Operation, "kind": result.Kind, "memberId": result.MemberID, "status": result.Status, "codes": result.Codes})
		if result.Status == http.StatusOK && len(result.Codes) == 0 {
			continue
		}
		if result.expectedDenial {
			continue
		}
		if result.Status == http.StatusOK && result.Kind == "query" && result.Operation == "MapSessionDeniedPrivateDocument" && reflect.DeepEqual(result.Codes, []string{"FORBIDDEN"}) {
			if _, permitted := expectedPrivateDenials[result.MemberID]; permitted {
				privateDenials[result.MemberID]++
				continue
			}
		}
		if result.Status == 200 && reflect.DeepEqual(result.Codes, []string{"FORBIDDEN"}) && result.Operation == "MapSaveNode" && result.MemberID == actors["b"].publicID {
			denials++
			continue
		}
		if result.Status == 200 && reflect.DeepEqual(result.Codes, []string{"INVALID"}) && result.Operation == "MapSaveEdge" && result.MemberID == actors["a"].publicID {
			invalid++
			continue
		}
		t.Errorf("unexpected actual HTTP outcome: operation=%s kind=%s actor=%s status=%d codes=%v", result.Operation, result.Kind, result.MemberID, result.Status, result.Codes)
	}
	write("http-observer.json", outcomes)
	write("native-private-denials.json", map[string]any{"operation": "MapSessionDeniedPrivateDocument", "code": "FORBIDDEN", "actual": privateDenials, "expected": expectedPrivateDenials})
	if !reflect.DeepEqual(privateDenials, expectedPrivateDenials) {
		t.Errorf("actual private Document probe actors/counts=%v want=%v", privateDenials, expectedPrivateDenials)
	}
	if denials != 2 || invalid != 1 {
		t.Errorf("actual expected denials=%d want2 invalid=%d want1", denials, invalid)
	}
	var persisted json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('maps',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM maps m),'nodes',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM pointcrawl_nodes n),'edges',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM pointcrawl_edges e),'documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM documents d),'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY node_id,document_id,relation) FROM pointcrawl_entry_links l),'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY member_id,region_id) FROM archon_assignments a),'members',(SELECT jsonb_agg(jsonb_build_object('id',public_id,'roles',roles) ORDER BY id) FROM members),'receipts',(SELECT jsonb_agg(jsonb_build_object('endpoint',endpoint,'completed',completed_at IS NOT NULL,'receipt',receipt) ORDER BY endpoint) FROM idempotency_keys))`).Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	write("native-persisted-readback.json", persisted)
	requireCount := func(want int, query string, args ...any) {
		t.Helper()
		var count int
		if err := fixture.pool.QueryRow(ctx, query, args...).Scan(&count); err != nil || count != want {
			t.Errorf("persisted count=%d want=%d (%v): %s", count, want, err, query)
		}
	}
	for table, want := range map[string]int{"members": 4, "regions": 2, "archon_assignments": 4, "maps": 4, "pointcrawl_nodes": 5, "pointcrawl_edges": 2, "documents": 2, "pointcrawl_entry_links": 2, "quests": 0, "characters": 0, "background_jobs": 0} {
		requireCount(want, "SELECT count(*) FROM "+table)
	}
	for _, name := range []string{"Map session A persisted", "Map session B persisted"} {
		requireCount(1, `SELECT count(*) FROM pointcrawl_nodes WHERE name=$1 AND map_id=$2`, name, mapRows["primary"])
	}
	requireCount(1, `SELECT count(*) FROM maps WHERE atlas_code='MAP-SESSION-CREATED' AND region_id=$1 AND created_by=$2`, regionRows["target"], actors["a"].rowID)
	requireCount(1, `SELECT count(*) FROM maps WHERE atlas_code='Map supplement global.opaque_2026' AND name='Map supplement Global' AND family='campaign' AND region_id IS NULL AND created_by=$1`, actors["admin"].rowID)
	requireCount(1, `SELECT count(*) FROM pointcrawl_edges WHERE public_id=$1 AND label='Map session A edge' AND node_a<>node_b`, edgeID)
	requireCount(1, `SELECT count(*) FROM pointcrawl_edges e JOIN pointcrawl_nodes b ON b.id=e.node_b WHERE e.map_id=$1 AND e.node_a=$2 AND b.name='Map session A persisted' AND e.directed AND e.kind='road' AND e.label='Map supplement directed edited' AND e.document_id IS NULL`, mapRows["primary"], nodeRows["gate"])
	requireCount(1, `SELECT count(*) FROM pointcrawl_nodes WHERE id=$1 AND name='Map supplement Gate edited' AND x=112.5 AND y=-7.25 AND submap_id IS NULL`, nodeRows["gate"])
	requireCount(1, `SELECT count(*) FROM members WHERE public_id=$1 AND roles @> ARRAY['archon','player']::text[] AND cardinality(roles)=2`, actors["b"].publicID)
	requireCount(1, `SELECT count(*) FROM pointcrawl_entry_links WHERE node_id=$1 AND document_id=(SELECT id FROM documents WHERE public_id=$2) AND relation='location'`, nodeRows["gate"], documents["public"]["id"])
	requireCount(1, `SELECT count(*) FROM pointcrawl_entry_links WHERE node_id=$1 AND relation='subject'`, nodeRows["watch"])
	requireCount(0, `SELECT count(*) FROM pointcrawl_entry_links WHERE node_id=$1 AND relation='location'`, nodeRows["watch"])
	for name, document := range documents {
		requireCount(1, `SELECT count(*) FROM documents WHERE public_id=$1 AND title=$2 AND body=$3 AND status=$4 AND version=1 AND deleted_at IS NULL`, document["id"], document["title"], document["body"], document["status"])
		region := "target"
		if name == "private" {
			region = "other"
		}
		requireCount(1, `SELECT count(*) FROM regions r JOIN documents d ON d.id=r.document_id WHERE r.public_id=$1 AND d.public_id=$2`, regionIDs[region], document["id"])
	}
	requireCount(0, `SELECT count(*) FROM pointcrawl_nodes WHERE name LIKE '%denied%'`)
	if browserErr != nil {
		t.Fatal("real Map session browser:", browserErr)
	}
	var receipt struct{ Completed, BrowserClosed, ViteClosed bool }
	raw, err := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &receipt); err != nil {
		t.Fatal(err)
	}
	if !receipt.Completed || !receipt.BrowserClosed || !receipt.ViteClosed {
		t.Fatal("browser did not complete and close owned resources")
	}
}
