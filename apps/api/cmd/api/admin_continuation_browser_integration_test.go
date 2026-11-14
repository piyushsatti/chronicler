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
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

func TestAdminContinuationBrowserCurrentJourneys(t *testing.T) {
	if os.Getenv("ADMIN_CONTINUATION_RUNTIME_RELEASE") != "isolated-admin-continuation" || os.Getenv("DATABASE_URL") != "" {
		t.Fatal("explicit isolated-admin-continuation release and omitted DATABASE_URL are required")
	}
	script, evidence := os.Getenv("ADMIN_CONTINUATION_BROWSER_SCRIPT"), os.Getenv("ADMIN_CONTINUATION_BROWSER_EVIDENCE")
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
		{filepath.Join(root, "apps/api/cmd/api/admin_continuation_browser_integration_test.go"), "native-input.go.txt"},
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
			t.Error("production inputs changed during Admin continuation acceptance")
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
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM characters)`).Scan(&initial); err != nil || initial != 0 {
		t.Fatalf("migrations-only fixture not empty: %d %v", initial, err)
	}
	rows := &authorityDBFixture{pool: fixture.pool}
	actors := map[string]authorityDBMember{}
	actorRoles := map[string][]auth.Role{}
	memberByActor := map[string]map[string]any{}
	members := []map[string]any{}
	addMember := func(actor, handle string, roles ...auth.Role) {
		m := rows.member(t, roles...)
		rows.exec(t, `UPDATE members SET status='active',handle=$2,display_name=$3 WHERE id=$1`, m.rowID, handle, "Continuation "+actor)
		actors[actor], actorRoles[actor] = m, roles
		value := map[string]any{"id": m.publicID, "handle": handle, "displayName": "Continuation " + actor, "roles": roles, "status": "active"}
		memberByActor[actor] = value
		members = append(members, value)
	}
	addMember("admin", "continuation-admin", auth.Admin, auth.Player)
	addMember("verifier", "continuation-verifier", auth.Verifier, auth.Player)
	addMember("player", "continuation-player", auth.Player)
	for i := 0; i < 51; i++ {
		actor := fmt.Sprintf("owner-%03d", i)
		handle := "continuation-" + actor
		if i >= 49 {
			handle = fmt.Sprintf("continuation-bulk-%03d", i)
		}
		addMember(actor, handle, auth.Player, auth.DM)
	}
	regionRows := []map[string]any{}
	regionIDs := []string{}
	for i := 0; i < 101; i++ {
		id, name := uuid.NewString(), fmt.Sprintf("Continuation Region %03d", i)
		var at time.Time
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,$2,'uncharted') RETURNING created_at`, id, name).Scan(&at); err != nil {
			t.Fatal(err)
		}
		regionIDs = append(regionIDs, id)
		regionRows = append(regionRows, map[string]any{"id": id, "name": name, "createdAt": at.UTC().Format(time.RFC3339Nano)})
	}
	documentID := uuid.NewString()
	var documentRow int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) VALUES($1,'codex_entry','continuation-location','Continuation Location','Locations','published','public','Continuation authored Location body',$2,1) RETURNING id`, documentID, actors["admin"].rowID).Scan(&documentRow); err != nil {
		t.Fatal(err)
	}
	deadline := time.Date(2027, 1, 1, 0, 0, 0, 123456000, time.UTC)
	rows.exec(t, `UPDATE regions SET document_id=$2,charter_deadline=$3 WHERE public_id=$1`, regionIDs[0], documentRow, deadline)
	catalog, backstories := []map[string]any{}, []map[string]any{}
	catalogIDs, backstoryIDs := []string{}, []string{}
	kinds := []string{"species", "class", "background"}
	for i := 0; i < 51; i++ {
		catalogID, storyID := uuid.NewString(), uuid.NewString()
		name, kind := fmt.Sprintf("Continuation Option %03d", i), kinds[i%3]
		region := regionIDs[i%2]
		rows.exec(t, `INSERT INTO creation_catalog(public_id,kind,code,name,description,introduced_by_region_id) VALUES($1,$2,$3,$4,'Continuation initial catalog description',(SELECT id FROM regions WHERE public_id=$5))`, catalogID, kind, fmt.Sprintf("continuation-%03d", i), name, region)
		storyName := fmt.Sprintf("Continuation Backstory %03d", i)
		rows.exec(t, `INSERT INTO backstories(public_id,name,lore,cohort,source_region_id) VALUES($1,$2,'Continuation initial Backstory lore','player',(SELECT id FROM regions WHERE public_id=$3))`, storyID, storyName, region)
		catalogIDs = append(catalogIDs, catalogID)
		backstoryIDs = append(backstoryIDs, storyID)
		catalog = append(catalog, map[string]any{"id": catalogID, "name": name, "kind": kind, "regionId": region})
		backstories = append(backstories, map[string]any{"id": storyID, "name": storyName, "regionId": region, "cohort": "player"})
	}
	calendar := `{"era":{"name":"Continuation fixture era","abbrev":"CF"},"days_per_week":7,"weekdays":["One","Two","Three","Four","Five","Six","Seven"],"periods":[{"name":"Fixture month","type":"month","days":30}],"rate_real_days_per_game_day":1,"moons":[{"name":"Fixture moon","cycle_days":28}],"fixture_extra":{"keep":"retained"}}`
	rows.exec(t, `INSERT INTO game_calendar(id,definition) VALUES(1,$1::jsonb)`, calendar)
	reserved, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port = reserved.Addr().(*net.TCPAddr).Port
	if err := reserved.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-admin-continuation-key", CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	rows.cfg = cfg
	runtime = wireForTest(ctx, cfg)
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("production Wire did not bind fixture")
	}
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)
	observer := &questBrowserHTTPObserver{}
	var checkpointMu sync.Mutex
	transitionCheckpoints := []map[string]any{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if actor, ok := r.Context().Value(questBrowserHTTPActorKey{}).(*questBrowserHTTPActor); ok {
			actor.authority, actor.resolved = auth.AuthorityFromContext(r.Context())
		}
		var input struct {
			Query         string `json:"query"`
			OperationName string `json:"operationName"`
			Variables     struct {
				ID   string `json:"id"`
				To   string `json:"to"`
				Meta struct {
					Key string `json:"idempotencyKey"`
				} `json:"meta"`
			} `json:"variables"`
		}
		transition := false
		if r.URL.Path == "/v1/graphql" && r.Method == http.MethodPost {
			original := r.Body
			raw, err := io.ReadAll(io.LimitReader(original, (1<<20)+1))
			r.Body = struct {
				io.Reader
				io.Closer
			}{io.MultiReader(bytes.NewReader(raw), original), original}
			if err == nil && len(raw) <= 1<<20 && json.Unmarshal(raw, &input) == nil {
				if document, err := parser.ParseQuery(&ast.Source{Input: input.Query}); err == nil {
					operation := document.Operations.ForName(input.OperationName)
					transition = operation != nil && operation.Operation == ast.Mutation && operation.Name == "TransitionRegion"
				}
			}
		}
		mux.ServeHTTP(w, r)
		if transition {
			var kind, document, name string
			var at, created time.Time
			var assignments int
			err := fixture.pool.QueryRow(ctx, `SELECT r.kind,d.public_id::text,r.name,r.charter_deadline,r.created_at,(SELECT count(*) FROM archon_assignments a WHERE a.region_id=r.id) FROM regions r JOIN documents d ON d.id=r.document_id WHERE r.public_id=$1`, input.Variables.ID).Scan(&kind, &document, &name, &at, &created, &assignments)
			value := map[string]any{"id": input.Variables.ID, "requestedKind": input.Variables.To, "key": input.Variables.Meta.Key, "kind": kind, "documentId": document, "name": name, "deadline": at.UTC().Format(time.RFC3339Nano), "createdAt": created.UTC().Format(time.RFC3339Nano), "assignments": assignments}
			if err != nil {
				value["error"] = err.Error()
			}
			checkpointMu.Lock()
			transitionCheckpoints = append(transitionCheckpoints, value)
			checkpointMu.Unlock()
		}
	})
	api = httptest.NewServer(observer.wrap(apiHandler(inner, cfg, runtime.Authority)))
	tokens, actorIDs := map[string]string{}, map[string]string{}
	for actor, m := range actors {
		tokens[actor] = rows.token(t, m.publicID, actorRoles[actor]...)
		actorIDs[actor] = m.publicID
	}
	client := &http.Client{Timeout: 15 * time.Second}
	bootstrap := []map[string]any{}
	call := func(actor, operation, query, field string, variables map[string]any, mutation bool) map[string]any {
		t.Helper()
		key := ""
		if mutation {
			key = uuid.NewString()
			variables["meta"] = map[string]string{"idempotencyKey": key}
		}
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
		response, err := client.Do(request)
		if err != nil {
			t.Fatalf("%s HTTP: %v", operation, err)
		}
		raw, readErr := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
		closeErr := response.Body.Close()
		if readErr != nil || closeErr != nil || len(raw) > 1<<20 || response.StatusCode != 200 {
			t.Fatalf("%s response status=%d read=%v close=%v", operation, response.StatusCode, readErr, closeErr)
		}
		var wire struct {
			Data   map[string]json.RawMessage `json:"data"`
			Errors []struct {
				Extensions struct {
					Code string `json:"code"`
				} `json:"extensions"`
			} `json:"errors"`
		}
		if err := json.Unmarshal(raw, &wire); err != nil || len(wire.Errors) != 0 || len(wire.Data[field]) == 0 {
			t.Fatalf("%s invalid GraphQL acknowledgement/errors=%d decode=%v", operation, len(wire.Errors), err)
		}
		var value map[string]any
		if err := json.Unmarshal(wire.Data[field], &value); err != nil || value == nil {
			t.Fatalf("%s missing result: %v", operation, err)
		}
		if mutation {
			bootstrap = append(bootstrap, map[string]any{"actor": actor, "memberId": actors[actor].publicID, "operation": operation, "key": key, "result": value})
		}
		return value
	}
	const createPc = `mutation ContinuationCreateCharacter($input:CreateCharacterInput!,$meta:CommandMeta!){createCharacter(input:$input,meta:$meta){id ownerId shortCode name regionId backstoryId status updatedAt verificationSubmittedAt}}`
	const submitPc = `mutation ContinuationSubmitCharacter($id:ID!,$at:DateTime!,$meta:CommandMeta!){submitForVerification(characterId:$id,expectedUpdatedAt:$at,meta:$meta){id updatedAt verificationSubmittedAt}}`
	const createDm = `mutation ContinuationCreateDm($input:UpdateDmProfileInput!,$meta:CommandMeta!){updateMyDmProfile(input:$input,meta:$meta){memberId status reviewRevision}}`
	const submitDm = `mutation ContinuationSubmitDm($revision:Int!,$meta:CommandMeta!){submitDmProfileForVerification(expectedRevision:$revision,meta:$meta){memberId status reviewRevision}}`
	characters := []map[string]any{}
	catalogChoiceIndices := [2][3]int{{0, 4, 2}, {3, 1, 5}}
	for i := 0; i < 51; i++ {
		actor := fmt.Sprintf("owner-%03d", i)
		picks := make([]string, 0, 3)
		for slot, index := range catalogChoiceIndices[i%2] {
			if catalog[index]["kind"] != kinds[slot] || catalog[index]["regionId"] != regionIDs[i%2] {
				t.Fatalf("Character%d catalog selection must contain each kind in its current Region", i)
			}
			picks = append(picks, catalogIDs[index])
		}
		var validKinds int
		if err := fixture.pool.QueryRow(ctx, `SELECT count(DISTINCT catalog.kind) FROM creation_catalog catalog JOIN regions region ON region.id=catalog.introduced_by_region_id WHERE catalog.public_id=ANY($1::uuid[]) AND region.public_id=$2 AND catalog.available AND NOT catalog.retired AND catalog.kind=ANY($3::text[])`, picks, regionIDs[i%2], kinds).Scan(&validKinds); err != nil || validKinds != 3 {
			t.Fatalf("Character%d catalog reference precondition: kinds=%d err=%v", i, validKinds, err)
		}
		created := call(actor, "ContinuationCreateCharacter", createPc, "createCharacter", map[string]any{"input": map[string]any{"name": fmt.Sprintf("Continuation PC %03d", i), "regionId": regionIDs[i%2], "backstoryId": backstoryIDs[i], "catalogPickIds": picks, "description": "Continuation Character description", "backgroundText": "Continuation Character background", "ddbUrl": fmt.Sprintf("https://www.dndbeyond.com/characters/%d", 900000+i)}}, true)
		id, ok := created["id"].(string)
		if !ok || uuid.Validate(id) != nil || created["ownerId"] != actors[actor].publicID || created["status"] != "pending_approval" {
			t.Fatal("canonical Character creation identity/status mismatch")
		}
		submitted := call(actor, "ContinuationSubmitCharacter", submitPc, "submitForVerification", map[string]any{"id": id, "at": created["updatedAt"]}, true)
		at, ok := submitted["verificationSubmittedAt"].(string)
		if !ok {
			t.Fatal("submission token absent")
		}
		if _, err := time.Parse(time.RFC3339Nano, at); err != nil {
			t.Fatal(err)
		}
		characters = append(characters, map[string]any{"id": id, "actor": actor, "ownerId": actors[actor].publicID, "shortCode": created["shortCode"], "name": created["name"], "regionId": regionIDs[i%2], "backstoryId": backstoryIDs[i], "catalogPickIds": picks, "verificationSubmittedAt": at})
		drafted := call(actor, "ContinuationCreateDm", createDm, "updateMyDmProfile", map[string]any{"input": map[string]any{"tagline": "Continuation initial DM profile", "philosophy": "Continuation fixture philosophy", "acceptingPlayers": false}}, true)
		if drafted["status"] != "draft" || drafted["reviewRevision"] != float64(1) {
			t.Fatal("DM draft revision mismatch")
		}
		pending := call(actor, "ContinuationSubmitDm", submitDm, "submitDmProfileForVerification", map[string]any{"revision": 1}, true)
		if pending["status"] != "pending" || pending["reviewRevision"] != float64(2) {
			t.Fatal("DM pending revision mismatch")
		}
	}
	if len(bootstrap) != 204 {
		t.Fatal("canonical bootstrap command count drift")
	}
	write("native-bootstrap.json", bootstrap)
	var pcQueue, dmQueue []map[string]any
	queue := func(query, field string) []map[string]any {
		value := call("verifier", field, query, field, map[string]any{}, false)
		if value["total"] != float64(51) {
			t.Fatalf("%s total mismatch", field)
		}
		items, ok := value["items"].([]any)
		if !ok {
			items, ok = value["entries"].([]any)
		}
		if !ok || len(items) != 51 {
			t.Fatal("native queue inventory incomplete")
		}
		result := []map[string]any{}
		for _, item := range items {
			row, ok := item.(map[string]any)
			if !ok {
				t.Fatal("queue row malformed")
			}
			result = append(result, row)
		}
		return result
	}
	pcQueue = queue(`query ContinuationPcInventory{pendingCharacterVerifications(limit:100,offset:0){total items{id name shortCode ownerHandle verificationSubmittedAt}}}`, "pendingCharacterVerifications")
	dmQueue = queue(`query ContinuationDmInventory{pendingDmProfileVerifications(limit:100,offset:0){total entries{memberId handle displayName dmProfileReviewRevision}}}`, "pendingDmProfileVerifications")
	snapshot := func() json.RawMessage {
		var raw json.RawMessage
		if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM documents d),'regions',(SELECT jsonb_agg(to_jsonb(r)-'kind' ORDER BY id) FROM regions r),'calendar',(SELECT definition FROM game_calendar WHERE id=1),'characterStatic',(SELECT jsonb_agg(to_jsonb(c)-'status'-'updated_at'-'verification_submitted_at' ORDER BY id) FROM characters c),'picks',(SELECT jsonb_agg(to_jsonb(p) ORDER BY character_id,catalog_id) FROM character_catalog_picks p),'catalogIdentity',(SELECT jsonb_agg(jsonb_build_array(public_id,kind,code) ORDER BY id) FROM creation_catalog),'members',(SELECT jsonb_agg(to_jsonb(m)-'roles'-'updated_at' ORDER BY id) FROM members m))`).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		return raw
	}
	retainedBefore := snapshot()
	write("native-retained-before.json", retainedBefore)
	inventory := map[string]any{"database": fixture.databaseName, "memberCount": 54, "members": members, "memberByActor": memberByActor, "actors": actorIDs, "bulkActors": []string{"owner-049", "owner-050"}, "characters": characters, "pcQueue": pcQueue, "dmQueue": dmQueue, "regionRows": regionRows, "regions": map[string]string{"target": regionIDs[0], "alternate": regionIDs[1], "last": regionIDs[100]}, "documents": map[string]any{"public": map[string]string{"id": documentID, "slug": "continuation-location", "title": "Continuation Location", "body": "Continuation authored Location body"}}, "deadline": deadline.Format(time.RFC3339Nano), "catalog": catalog, "backstories": backstories, "calendar": json.RawMessage(calendar), "bootstrapCommands": 204, "workersStarted": false}
	write("native-inventory.json", inventory)
	stdin, err := json.Marshal(map[string]any{"tokens": tokens, "inventory": inventory})
	if err != nil {
		t.Fatal(err)
	}
	childCtx, cancel := context.WithTimeout(ctx, 240*time.Second)
	cancelChild = cancel
	defer cancel()
	command = exec.CommandContext(childCtx, node, filepath.Join(evidence, "browser-input.mjs"))
	command.Dir = root
	command.Env = append(os.Environ(), "ADMIN_CONTINUATION_REPO_ROOT="+root, "ADMIN_CONTINUATION_API_ORIGIN="+api.URL, "ADMIN_CONTINUATION_VITE_PORT="+strconv.Itoa(port), "ADMIN_CONTINUATION_BROWSER_EVIDENCE="+evidence)
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
	var receipt struct {
		Completed, BrowserClosed, ViteClosed                           bool
		PcTarget, DmTarget, StalePcKey, StaleDmKey, BulkKey, RevokeKey string
	}
	raw, readErr := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if readErr == nil {
		readErr = json.Unmarshal(raw, &receipt)
	}
	if readErr != nil {
		t.Errorf("browser receipt: %v", readErr)
	}
	observed, _ := observer.snapshot()
	write("http-observer.json", observed)
	checkpointMu.Lock()
	checkpoints := slices.Clone(transitionCheckpoints)
	checkpointMu.Unlock()
	write("native-transition-checkpoints.json", checkpoints)
	retainedAfter := snapshot()
	write("native-retained-after.json", retainedAfter)
	if !bytes.Equal(retainedBefore, retainedAfter) {
		t.Error("preserved reference/Region/member/Character facts changed")
	}
	if browserErr != nil {
		t.Fatal("Admin continuation browser:", browserErr)
	}
	if !receipt.Completed || !receipt.BrowserClosed || !receipt.ViteClosed {
		t.Fatal("browser journey/resources incomplete")
	}
	if len(checkpoints) != 2 {
		t.Fatalf("actual post-command SQL checkpoints=%d, want2", len(checkpoints))
	}
	for i, kind := range []string{"archon", "server"} {
		value := checkpoints[i]
		if value["error"] != nil || value["id"] != regionIDs[0] || value["kind"] != kind || value["requestedKind"] != kind || value["documentId"] != documentID || value["name"] != regionRows[0]["name"] || value["deadline"] != deadline.Format(time.RFC3339Nano) || value["createdAt"] != regionRows[0]["createdAt"] || value["assignments"] != 0 || value["key"] == "" {
			t.Fatalf("post-transition SQL checkpoint drift: %+v", value)
		}
	}
	expectedDenied := map[string]int{}
	for _, actor := range []string{"player", "owner-000"} {
		for _, op := range []string{"AdminOperations", "PendingCharacterVerifications", "PendingDmProfiles"} {
			expectedDenied[actors[actor].publicID+":"+op] = 1
		}
	}
	for _, op := range []string{"AdminOperations", "PendingCharacterVerifications", "PendingDmProfiles"} {
		expectedDenied[actors["verifier"].publicID+":"+op] = 1
	}
	denied := map[string]int{}
	stalePc, staleDm := 0, 0
	bootstrapKeys := map[string]string{}
	for _, entry := range bootstrap {
		bootstrapKeys[entry["key"].(string)] = entry["memberId"].(string)
	}
	observedBootstrap := map[string]bool{}
	for _, result := range observed {
		if actor, ok := bootstrapKeys[result.Key]; ok {
			if result.MemberID != actor || result.Status != 200 || len(result.Codes) != 0 || result.Kind != "mutation" {
				t.Errorf("canonical bootstrap outcome drift: %+v", result)
			}
			observedBootstrap[result.Key] = true
		}
		if result.Status == 200 && len(result.Codes) == 0 || result.expectedDenial {
			continue
		}
		if result.Status == 200 && result.MemberID == actors["verifier"].publicID && reflect.DeepEqual(result.Codes, []string{"CONFLICT"}) {
			if result.Operation == "DecideVerification" && result.Key == receipt.StalePcKey {
				stalePc++
				continue
			}
			if result.Operation == "DecideDmProfileVerification" && result.Key == receipt.StaleDmKey {
				staleDm++
				continue
			}
		}
		if result.Status == 200 && reflect.DeepEqual(result.Codes, []string{"FORBIDDEN"}) {
			key := result.MemberID + ":" + result.Operation
			if _, ok := expectedDenied[key]; ok {
				denied[key]++
				continue
			}
		}
		t.Errorf("unexpected native HTTP outcome: %+v", result)
	}
	write("native-denials.json", map[string]any{"actual": denied, "expected": expectedDenied, "stalePc": stalePc, "staleDm": staleDm, "bootstrapObserved": len(observedBootstrap)})
	if !reflect.DeepEqual(denied, expectedDenied) || stalePc != 1 || staleDm != 1 || len(observedBootstrap) != 204 {
		t.Fatal("exact native role/stale/bootstrap outcomes drift")
	}
	for _, id := range []string{receipt.PcTarget, receipt.DmTarget} {
		if uuid.Validate(id) != nil {
			t.Fatal("missing current decision identity")
		}
	}
	requireCount := func(want int, query string, args ...any) {
		t.Helper()
		var count int
		if err := fixture.pool.QueryRow(ctx, query, args...).Scan(&count); err != nil || count != want {
			t.Fatalf("native count=%d want=%d: %v", count, want, err)
		}
	}
	requireCount(54, `SELECT count(*) FROM members`)
	requireCount(51, `SELECT count(*) FROM members WHERE 'dm'=ANY(roles)`)
	requireCount(1, `SELECT count(*) FROM members WHERE public_id=$1 AND roles=ARRAY['admin','player']::text[]`, actors["admin"].publicID)
	requireCount(1, `SELECT count(*) FROM members WHERE public_id=$1 AND roles=ARRAY['player']::text[]`, actors["verifier"].publicID)
	for _, actor := range []string{"owner-049", "owner-050"} {
		var roles []string
		if err := fixture.pool.QueryRow(ctx, `SELECT roles FROM members WHERE public_id=$1`, actors[actor].publicID).Scan(&roles); err != nil {
			t.Fatal(err)
		}
		slices.Sort(roles)
		if !slices.Equal(roles, []string{"archon", "dm", "player"}) {
			t.Fatal("batch target roles drift")
		}
	}
	requireCount(3, `SELECT count(*) FROM role_changes`)
	requireCount(2, `SELECT count(*) FROM role_changes WHERE changed_by=$1 AND member_id IN ($2,$3) AND cardinality(old_roles)=2 AND old_roles@>ARRAY['player','dm']::text[] AND new_roles=ARRAY['archon','dm','player']::text[]`, actors["admin"].rowID, actors["owner-049"].rowID, actors["owner-050"].rowID)
	requireCount(1, `SELECT count(DISTINCT occurred_at) FROM role_changes WHERE member_id IN ($1,$2)`, actors["owner-049"].rowID, actors["owner-050"].rowID)
	requireCount(51, `SELECT count(*) FROM characters`)
	requireCount(50, `SELECT count(*) FROM characters WHERE status='pending_approval'`)
	requireCount(1, `SELECT count(*) FROM characters WHERE public_id=$1 AND status='active'`, receipt.PcTarget)
	requireCount(153, `SELECT count(*) FROM character_catalog_picks`)
	for _, pc := range characters {
		var actual []string
		if err := fixture.pool.QueryRow(ctx, `SELECT array_agg(catalog.public_id::text ORDER BY catalog.public_id::text) FROM character_catalog_picks pick JOIN characters character ON character.id=pick.character_id JOIN creation_catalog catalog ON catalog.id=pick.catalog_id WHERE character.public_id=$1`, pc["id"]).Scan(&actual); err != nil {
			t.Fatal(err)
		}
		expected := slices.Clone(pc["catalogPickIds"].([]string))
		slices.Sort(expected)
		if !slices.Equal(actual, expected) {
			t.Fatalf("Character%s persisted picks differ from its actual matching-Region command input", pc["id"])
		}
	}
	requireCount(2, `SELECT count(*) FROM verifications WHERE subject_type='character' AND subject_id=(SELECT id FROM characters WHERE public_id=$1) AND decided_by=$2 AND review_revision IS NULL`, receipt.PcTarget, actors["verifier"].rowID)
	requireCount(1, `SELECT count(*) FROM verifications WHERE subject_type='character' AND subject_id=(SELECT id FROM characters WHERE public_id=$1) AND verdict='rejected' AND note='Continuation PC change request'`, receipt.PcTarget)
	requireCount(1, `SELECT count(*) FROM verifications WHERE subject_type='character' AND subject_id=(SELECT id FROM characters WHERE public_id=$1) AND verdict='approved'`, receipt.PcTarget)
	requireCount(2, `SELECT count(*) FROM notifications`)
	requireCount(2, `SELECT count(*) FROM notifications n JOIN characters c ON c.id=n.subject_id WHERE c.public_id=$1 AND n.subject_type='character' AND n.kind='CHARACTER_VERIFICATION_DECIDED' AND n.member_id=c.owner_id AND EXISTS(SELECT 1 FROM verifications v WHERE v.subject_id=c.id AND v.subject_type='character' AND v.public_id::text=n.body::jsonb->'event'->'facts'->>'verificationId')`, receipt.PcTarget)
	requireCount(51, `SELECT count(*) FROM dm_profiles`)
	requireCount(50, `SELECT count(*) FROM dm_profiles WHERE status='pending' AND review_revision=2 AND tagline='Continuation initial DM profile' AND philosophy='Continuation fixture philosophy' AND table_info IS NULL AND NOT accepting_players`)
	requireCount(1, `SELECT count(*) FROM dm_profiles WHERE member_id=(SELECT id FROM members WHERE public_id=$1) AND status='approved' AND review_revision=6 AND tagline='Continuation revised DM profile' AND philosophy='Continuation fixture philosophy' AND table_info IS NULL AND NOT accepting_players`, receipt.DmTarget)
	requireCount(2, `SELECT count(*) FROM verifications WHERE subject_type='dm_profile' AND subject_id=(SELECT id FROM members WHERE public_id=$1) AND decided_by=$2 AND ((verdict='rejected' AND review_revision=2 AND note='Continuation DM change request') OR (verdict='approved' AND review_revision=5))`, receipt.DmTarget, actors["verifier"].rowID)
	requireCount(4, `SELECT count(*) FROM verifications`)
	requireCount(51, `SELECT count(*) FROM creation_catalog`)
	requireCount(1, `SELECT count(*) FROM creation_catalog WHERE public_id=$1 AND description='Continuation page-two catalog description' AND NOT available AND retired AND introduced_by_region_id=(SELECT id FROM regions WHERE public_id=$2)`, catalogIDs[50], regionIDs[100])
	requireCount(50, `SELECT count(*) FROM creation_catalog WHERE description='Continuation initial catalog description' AND available AND NOT retired`)
	requireCount(51, `SELECT count(*) FROM backstories WHERE cohort='player'`)
	requireCount(1, `SELECT count(*) FROM backstories WHERE public_id=$1 AND lore='Continuation page-two Backstory lore' AND retired AND source_region_id=(SELECT id FROM regions WHERE public_id=$2)`, backstoryIDs[50], regionIDs[100])
	requireCount(50, `SELECT count(*) FROM backstories WHERE lore='Continuation initial Backstory lore' AND NOT retired`)
	requireCount(101, `SELECT count(*) FROM regions`)
	requireCount(100, `SELECT count(*) FROM regions WHERE kind='uncharted'`)
	requireCount(1, `SELECT count(*) FROM regions WHERE public_id=$1 AND kind='server' AND document_id=$2 AND charter_deadline=$3`, regionIDs[0], documentRow, deadline)
	requireCount(0, `SELECT count(*) FROM archon_assignments`)
	requireCount(0, `SELECT count(*) FROM maps`)
	requireCount(0, `SELECT count(*) FROM documents WHERE kind='rule' AND category='table'`)
	requireCount(0, `SELECT count(*) FROM background_jobs`)
	requireCount(0, `SELECT count(*) FROM character_ddb_mirrors`)
	requireCount(0, `SELECT count(*) FROM quests`)
	requireCount(0, `SELECT count(*) FROM idempotency_keys WHERE key=ANY($1::text[])`, []string{receipt.StalePcKey, receipt.StaleDmKey})
	requireCount(217, `SELECT count(*) FROM idempotency_keys WHERE completed_at IS NOT NULL`)
	for endpoint, want := range map[string]int{"createCharacter": 51, "submitForVerification": 52, "updateMyDmProfile": 52, "submitDmProfileForVerification": 52, "decideVerification": 2, "decideDmProfileVerification": 2, "upsertCreationCatalogEntry": 1, "updateBackstory": 1, "setMemberRolesBatch": 1, "setMemberRoles": 1, "transitionRegion": 2} {
		requireCount(want, `SELECT count(*) FROM idempotency_keys WHERE endpoint=$1 AND completed_at IS NOT NULL`, "graphql:"+endpoint)
	}
	requireCount(1, `SELECT count(*) FROM idempotency_keys WHERE key=$1 AND endpoint='graphql:setMemberRolesBatch' AND actor_id=$2 AND completed_at IS NOT NULL`, receipt.BulkKey, actors["admin"].rowID)
	requireCount(1, `SELECT count(*) FROM idempotency_keys WHERE key=$1 AND endpoint='graphql:setMemberRoles' AND actor_id=$2 AND completed_at IS NOT NULL`, receipt.RevokeKey, actors["admin"].rowID)
	requireCount(0, `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='auth_override_audit'`)
	write("native-readback.json", map[string]any{"at": time.Now().UTC(), "characters": 51, "dmProfiles": 51, "regions": 101, "catalog": 51, "backstories": 51, "bootstrapCommands": 204, "completedReceipts": 217, "pcTarget": receipt.PcTarget, "dmTarget": receipt.DmTarget, "staleReceiptsAbsent": true, "bulkOneUOWReplay": true, "verifierCurrentRoleRevoked": true, "lifecycleBothForwards": true, "referenceBytesPreserved": true, "providers": false})
}
