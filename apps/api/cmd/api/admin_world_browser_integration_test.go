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
	"slices"
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

func TestAdminWorldBrowserPreservationAndGalleryAuthority(t *testing.T) {
	if os.Getenv("ADMIN_WORLD_RUNTIME_RELEASE") != "isolated-world-gallery" || os.Getenv("DATABASE_URL") != "" {
		t.Fatal("explicit isolated-world-gallery release and omitted DATABASE_URL are required")
	}
	script, evidence := os.Getenv("ADMIN_WORLD_BROWSER_SCRIPT"), os.Getenv("ADMIN_WORLD_BROWSER_EVIDENCE")
	if !filepath.IsAbs(script) || !filepath.IsAbs(evidence) {
		t.Fatal("absolute script and fresh evidence directory are required")
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
		t.Fatal("fresh immutable attempt directory required:", err)
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
	for _, input := range []struct{ source, copy string }{
		{script, "browser-input.mjs"},
		{filepath.Join(root, "apps/api/cmd/api/admin_world_browser_integration_test.go"), "native-input.go.txt"},
		{filepath.Join(root, "apps/api/cmd/api/quest_browser_integration_test.go"), "helper-quest.go.txt"},
		{filepath.Join(root, "apps/api/cmd/api/authority_integration_test.go"), "helper-authority.go.txt"},
		{filepath.Join(root, "apps/api/cmd/api/graphql_product_fixture_test.go"), "helper-product-fixture.go.txt"},
	} {
		raw, err := os.ReadFile(input.source)
		if err != nil {
			t.Fatal(err)
		}
		snapshot := filepath.Join(evidence, input.copy)
		if err := os.WriteFile(snapshot, raw, 0o444); err != nil {
			t.Fatal(err)
		}
		for _, file := range []string{input.source, snapshot} {
			owned[file] = raw
			identities[file] = fmt.Sprintf("%x", sha256.Sum256(raw))
		}
	}
	write("owned-inputs-before.json", identities)
	t.Cleanup(func() {
		after := questBrowserRuntimeInputs(t, root)
		write("production-inputs-after.json", after)
		if !reflect.DeepEqual(before, after) {
			t.Error("production inputs changed during World/Gallery acceptance")
		}
		current := map[string]string{}
		for file, original := range owned {
			raw, err := os.ReadFile(file)
			if err != nil {
				t.Error(err)
				continue
			}
			current[file] = fmt.Sprintf("%x", sha256.Sum256(raw))
			if !bytes.Equal(original, raw) {
				t.Errorf("frozen input changed: %s", file)
			}
		}
		write("owned-inputs-after.json", current)
	})
	ctx := context.Background()
	fixture := newProductFixture(t)
	var api *httptest.Server
	var runtime app.API
	var port int
	var command *exec.Cmd
	var cancelChild context.CancelFunc
	var childStarted, childWaited bool
	t.Cleanup(func() {
		reapedInCleanup := childStarted && !childWaited
		var cleanupWaitErr error
		if reapedInCleanup {
			cancelChild()
			cleanupWaitErr = command.Wait()
			childWaited = true
		}
		if api != nil {
			api.Close()
		}
		if runtime.Pool != nil {
			runtime.Pool.Close()
		}
		closed := map[string]bool{}
		addresses := map[string]string{}
		if api != nil {
			addresses["api"] = strings.TrimPrefix(api.URL, "http://")
		}
		if port > 0 {
			addresses["vite"] = fmt.Sprintf("127.0.0.1:%d", port)
		}
		for name, address := range addresses {
			connection, err := net.DialTimeout("tcp", address, time.Second)
			if connection != nil {
				connection.Close()
			}
			closed[name] = errors.Is(err, syscall.ECONNREFUSED)
			if !closed[name] {
				t.Errorf("owned listener %s not closed: %v", name, err)
			}
		}
		if err := fixture.close(); err != nil {
			t.Error(err)
			return
		}
		var remaining int
		if err := fixture.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, fixture.databaseName).Scan(&remaining); err != nil || remaining != 0 {
			t.Errorf("database cleanup remaining=%d: %v", remaining, err)
		}
		if reapedInCleanup {
			write("native-child-ended.json", map[string]any{"at": time.Now().UTC(), "nodePid": command.Process.Pid, "waitReturned": childWaited, "success": cleanupWaitErr == nil, "reapedInCleanup": true})
		}
		write("native-cleanup.json", map[string]any{"at": time.Now().UTC(), "database": fixture.databaseName, "databaseDropped": remaining == 0, "listenersClosed": closed, "childStarted": childStarted, "childWaited": childWaited})
	})
	var initial int
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM documents)`).Scan(&initial); err != nil || initial != 0 {
		t.Fatalf("migrations-only fixture not empty: %d %v", initial, err)
	}
	rows := &authorityDBFixture{pool: fixture.pool}
	members := []map[string]any{}
	addMember := func(name string, roles ...auth.Role) authorityDBMember {
		member := rows.member(t, roles...)
		rows.exec(t, `UPDATE members SET status='active',handle=$2,display_name=$2 WHERE id=$1`, member.rowID, "world-browser-"+name)
		members = append(members, map[string]any{"id": member.publicID, "handle": "world-browser-" + name, "roles": roles, "status": "active"})
		return member
	}
	actors := map[string]authorityDBMember{}
	actors["admin"] = addMember("admin", auth.Admin, auth.Archon, auth.Player)
	for _, name := range []string{"a", "b", "unrelated"} {
		actors[name] = addMember(name, auth.Archon, auth.Player)
	}
	actors["owner"] = addMember("configured-owner", auth.Player)
	actors["verifier"] = addMember("verifier", auth.Verifier)
	actors["player"] = addMember("player", auth.Player)
	targetMembers := []authorityDBMember{actors["admin"], actors["a"], actors["b"]}
	for index := 0; index < 98; index++ {
		targetMembers = append(targetMembers, addMember(fmt.Sprintf("archon-%03d", index), auth.Archon, auth.Player))
	}
	if len(members) != 105 || len(targetMembers) != 101 {
		t.Fatal("fixture population drift")
	}
	regionIDs := map[string]string{}
	regionRows := map[string]int64{}
	for _, name := range []string{"target", "other"} {
		regionIDs[name] = uuid.NewString()
		var row int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,$2,'archon') RETURNING id`, regionIDs[name], "World browser "+name+" Region").Scan(&row); err != nil {
			t.Fatal(err)
		}
		regionRows[name] = row
	}
	initialAssignments := []string{}
	for _, member := range targetMembers {
		rows.exec(t, `INSERT INTO archon_assignments(member_id,region_id,granted_by) VALUES($1,$2,$3)`, member.rowID, regionRows["target"], actors["admin"].rowID)
		initialAssignments = append(initialAssignments, member.publicID)
	}
	rows.exec(t, `INSERT INTO archon_assignments(member_id,region_id) VALUES($1,$2)`, actors["unrelated"].rowID, regionRows["other"])
	mapRows := map[string]int64{}
	maps := map[string]map[string]string{}
	for _, name := range []string{"primary", "secondary"} {
		id, atlas := uuid.NewString(), "WORLD-BROWSER-"+strings.ToUpper(name)
		var row int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO maps(public_id,name,atlas_code,map_kind,family,region_id,created_by) VALUES($1,$2,$3,'pointcrawl','campaign',$4,$5) RETURNING id`, id, "World browser "+name, atlas, regionRows["target"], actors["a"].rowID).Scan(&row); err != nil {
			t.Fatal(err)
		}
		mapRows[name] = row
		maps[name] = map[string]string{"id": id, "atlasCode": atlas}
	}
	nodeRows := map[string]int64{}
	nodes := map[string]string{}
	for index, name := range []string{"gate", "watch", "secondary"} {
		mapName := "primary"
		if name == "secondary" {
			mapName = "secondary"
		}
		id := uuid.NewString()
		var row int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) VALUES($1,$2,$3,$4,1,clock_timestamp()) RETURNING id`, id, mapRows[mapName], "World browser "+name, index*100).Scan(&row); err != nil {
			t.Fatal(err)
		}
		nodeRows[name] = row
		nodes[name] = id
	}
	edgeID := uuid.NewString()
	rows.exec(t, `INSERT INTO pointcrawl_edges(public_id,map_id,node_a,node_b,directed,kind,label) VALUES($1,$2,$3,$4,false,'path','World browser edge')`, edgeID, mapRows["primary"], nodeRows["gate"], nodeRows["watch"])
	documents := map[string]map[string]string{}
	documentRows := map[string]int64{}
	for _, name := range []string{"public", "private"} {
		id, status := uuid.NewString(), "published"
		if name == "private" {
			status = "draft"
		}
		var row int64
		title, body := "World browser "+name+" Location", "World browser "+name+" body"
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) VALUES($1,'codex_entry',$2,$3,'Locations',$4,'public',$5,$6,1) RETURNING id`, id, "world-browser-"+name, title, status, body, actors["a"].rowID).Scan(&row); err != nil {
			t.Fatal(err)
		}
		node, relation := "gate", "location"
		if name == "private" {
			node, relation = "watch", "subject"
		}
		rows.exec(t, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_by,created_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())`, mapRows["primary"], nodeRows[node], row, relation, actors["a"].rowID)
		documentRows[name] = row
		documents[name] = map[string]string{"id": id, "slug": "world-browser-" + name, "title": title, "body": body, "status": status}
	}
	deadline := time.Date(2027, 1, 1, 0, 0, 0, 123456000, time.UTC)
	rows.exec(t, `UPDATE regions SET document_id=$2,charter_deadline=$3 WHERE id=$1`, regionRows["target"], documentRows["public"], deadline)
	calendar := `{"era":{"name":"World fixture era","abbrev":"WF"},"days_per_week":7,"weekdays":["One","Two","Three","Four","Five","Six","Seven"],"periods":[{"name":"Fixture month","type":"month","days":30}],"rate_real_days_per_game_day":1,"moons":[{"name":"Fixture moon","cycle_days":28}],"fixture_extra":{"keep":"retained"}}`
	rows.exec(t, `INSERT INTO game_calendar(id,definition) VALUES(1,$1::jsonb)`, calendar)
	snapshot := func() json.RawMessage {
		t.Helper()
		var raw json.RawMessage
		if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM documents d),'maps',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM maps m),'nodes',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM pointcrawl_nodes n),'edges',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM pointcrawl_edges e),'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY node_id,document_id,relation) FROM pointcrawl_entry_links l),'otherAssignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY member_id) FROM archon_assignments a WHERE region_id=$1),'calendar',(SELECT definition FROM game_calendar WHERE id=1))`, regionRows["other"]).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		return raw
	}
	retainedBefore := snapshot()
	write("native-retained-before.json", retainedBefore)
	actorIDs := map[string]string{}
	for name, actor := range actors {
		actorIDs[name] = actor.publicID
	}
	actorIDs["forged"] = actors["player"].publicID
	inventory := map[string]any{"database": fixture.databaseName, "members": members, "memberCount": len(members), "actors": actorIDs, "regions": regionIDs, "regionName": "World browser target Region", "maps": maps, "nodes": nodes, "edgeId": edgeID, "documents": documents, "initialTargetAssignments": initialAssignments, "deadline": deadline.Format(time.RFC3339Nano), "calendar": json.RawMessage(calendar), "initialRows": map[string]int{"members": 105, "regions": 2, "maps": 2, "nodes": 3, "edges": 1, "documents": 2, "links": 2, "targetAssignments": 101, "otherAssignments": 1}, "workersStarted": false}
	write("native-inventory.json", inventory)
	reserved, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port = reserved.Addr().(*net.TCPAddr).Port
	if err := reserved.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-admin-world-fixture-key", PlatformOwnerMemberID: actors["owner"].publicID, CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	rows.cfg = cfg
	runtime = app.Wire(ctx, cfg)
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("production Wire did not bind fixture")
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
	tokens := map[string]string{}
	for name, actor := range actors {
		roles := []auth.Role{}
		switch name {
		case "admin":
			roles = []auth.Role{auth.Admin, auth.Archon, auth.Player}
		case "owner", "player":
			roles = []auth.Role{auth.Player}
		case "verifier":
			roles = []auth.Role{auth.Verifier}
		default:
			roles = []auth.Role{auth.Archon, auth.Player}
		}
		tokens[name] = rows.token(t, actor.publicID, roles...)
	}
	tokens["forged"] = rows.token(t, actors["player"].publicID, auth.Admin)
	stdin, err := json.Marshal(map[string]any{"tokens": tokens, "inventory": inventory})
	if err != nil {
		t.Fatal(err)
	}
	childCtx, cancel := context.WithTimeout(ctx, 240*time.Second)
	cancelChild = cancel
	defer cancel()
	command = exec.CommandContext(childCtx, node, filepath.Join(evidence, "browser-input.mjs"))
	command.Dir = root
	command.Env = append(os.Environ(), "ADMIN_WORLD_REPO_ROOT="+root, "ADMIN_WORLD_API_ORIGIN="+api.URL, "ADMIN_WORLD_VITE_PORT="+strconv.Itoa(port), "ADMIN_WORLD_BROWSER_EVIDENCE="+evidence)
	command.Stdin = bytes.NewReader(stdin)
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error { return syscall.Kill(-command.Process.Pid, syscall.SIGTERM) }
	command.WaitDelay = 5 * time.Second
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	childStarted = true
	write("native-host.json", map[string]any{"at": time.Now().UTC(), "goPid": os.Getpid(), "nodePid": command.Process.Pid, "apiOrigin": api.URL, "webOrigin": fmt.Sprintf("http://127.0.0.1:%d", port), "credentials": "stdin only"})
	browserErr := command.Wait()
	childWaited = true
	write("native-child-ended.json", map[string]any{"at": time.Now().UTC(), "nodePid": command.Process.Pid, "waitReturned": true, "success": browserErr == nil})
	var browserReceipt struct {
		Completed, BrowserClosed, ViteClosed bool
		FailedAssignmentKey                  string
	}
	raw, readErr := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if readErr == nil {
		readErr = json.Unmarshal(raw, &browserReceipt)
	}
	if readErr != nil {
		t.Errorf("browser receipt: %v", readErr)
	}
	observed, _ := observer.snapshot()
	invalid := 0
	denied := map[string]int{}
	expectedDenied := map[string]int{actors["unrelated"].publicID: 2, actors["a"].publicID: 1, actors["player"].publicID: 2, actors["verifier"].publicID: 1, actors["admin"].publicID: 1}
	for _, result := range observed {
		if result.Status == 200 && len(result.Codes) == 0 || result.expectedDenial {
			continue
		}
		if result.Status == 200 && result.Operation == "AssignArchon" && result.MemberID == actors["admin"].publicID && result.Key == browserReceipt.FailedAssignmentKey && reflect.DeepEqual(result.Codes, []string{"INVALID"}) {
			invalid++
			continue
		}
		if result.Status == 200 && result.Operation == "ArchonAssignments" && reflect.DeepEqual(result.Codes, []string{"FORBIDDEN"}) {
			if _, ok := expectedDenied[result.MemberID]; ok {
				denied[result.MemberID]++
				continue
			}
		}
		t.Errorf("unexpected native HTTP outcome: %+v", result)
	}
	write("http-observer.json", observed)
	write("native-denials.json", map[string]any{"actual": denied, "expected": expectedDenied, "invalidAssignment": invalid})
	retainedAfter := snapshot()
	write("native-retained-after.json", retainedAfter)
	if !bytes.Equal(retainedBefore, retainedAfter) {
		t.Error("retained Map/Document/Calendar/other-assignment bytes changed")
	}
	if browserErr != nil {
		t.Fatal("World/Gallery browser:", browserErr)
	}
	if !browserReceipt.Completed || !browserReceipt.BrowserClosed || !browserReceipt.ViteClosed {
		t.Fatal("browser journey/resources incomplete")
	}
	if invalid != 1 || !reflect.DeepEqual(denied, expectedDenied) {
		t.Fatalf("negative HTTP outcomes drift: invalid=%d denied=%v", invalid, denied)
	}
	var storedName, storedDocument string
	var storedDeadline time.Time
	if err := fixture.pool.QueryRow(ctx, `SELECT r.name,d.public_id::text,r.charter_deadline FROM regions r JOIN documents d ON d.id=r.document_id WHERE r.id=$1`, regionRows["target"]).Scan(&storedName, &storedDocument, &storedDeadline); err != nil {
		t.Fatal(err)
	}
	if storedName != "World browser partial region" || storedDocument != documents["public"]["id"] || !storedDeadline.Equal(deadline) {
		t.Fatalf("Region preservation failed: name=%s document=%s deadline=%s", storedName, storedDocument, storedDeadline)
	}
	expectedIDs := append(slices.Clone(initialAssignments), actors["unrelated"].publicID)
	slices.Sort(expectedIDs)
	var actualIDs []string
	if err := fixture.pool.QueryRow(ctx, `SELECT array_agg(m.public_id::text ORDER BY m.public_id::text) FROM archon_assignments a JOIN members m ON m.id=a.member_id WHERE a.region_id=$1`, regionRows["target"]).Scan(&actualIDs); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(actualIDs, expectedIDs) || len(actualIDs) != 102 {
		t.Fatal("complete persisted102-assignment identity set differs")
	}
	requireCount := func(want int, query string, args ...any) {
		t.Helper()
		var count int
		if err := fixture.pool.QueryRow(ctx, query, args...).Scan(&count); err != nil || count != want {
			t.Fatalf("count=%d want=%d: %v", count, want, err)
		}
	}
	requireCount(0, `SELECT count(*) FROM archon_assignments WHERE member_id=$1`, actors["player"].rowID)
	requireCount(0, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:assignArchon' AND key=$2`, actors["admin"].rowID, browserReceipt.FailedAssignmentKey)
	requireCount(3, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:updateRegion' AND completed_at IS NOT NULL`, actors["admin"].rowID)
	requireCount(2, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:assignArchon' AND completed_at IS NOT NULL`, actors["admin"].rowID)
	requireCount(1, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND endpoint='graphql:revokeArchon' AND completed_at IS NOT NULL`, actors["admin"].rowID)
	requireCount(1, `SELECT count(*) FROM members WHERE id=$1 AND roles=ARRAY['player']::text[]`, actors["admin"].rowID)
	requireCount(0, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1`, actors["owner"].rowID)
	requireCount(0, `SELECT count(*) FROM background_jobs`)
	requireCount(0, `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='auth_override_audit'`)
	write("native-readback.json", map[string]any{"regionName": storedName, "documentId": storedDocument, "deadline": storedDeadline, "targetAssignments": actualIDs, "failedAssignmentReceiptAbsent": true, "noLaterRevoke": true, "ordinaryAdminRevoked": true, "configuredOwnerWrites": 0, "providers": false})
}
