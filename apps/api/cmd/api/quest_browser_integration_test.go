//go:build integration && frontend_acceptance

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

type questBrowserHTTPActorKey struct{}
type questBrowserHTTPActor struct {
	authority auth.Authority
	resolved  bool
}

type questBrowserHTTPResult struct {
	RuleDetailSlugHash string   `json:"ruleDetailSlugHash,omitempty"`
	Operation          string   `json:"operation"`
	Kind               string   `json:"kind"`
	Key                string   `json:"key,omitempty"`
	MemberID           string   `json:"memberId,omitempty"`
	Status             int      `json:"status"`
	Codes              []string `json:"codes"`
	expectedDenial     bool
}

type questBrowserHTTPObserver struct {
	mu      sync.Mutex
	results []questBrowserHTTPResult
}

type questBrowserHTTPWriter struct {
	http.ResponseWriter
	status   int
	body     bytes.Buffer
	overflow bool
}

func (w *questBrowserHTTPWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}
func (w *questBrowserHTTPWriter) Write(raw []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	remaining := (1 << 20) - w.body.Len()
	if len(raw) > remaining {
		w.overflow = true
		_, _ = w.body.Write(raw[:remaining])
	} else {
		_, _ = w.body.Write(raw)
	}
	return w.ResponseWriter.Write(raw)
}
func (w *questBrowserHTTPWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (o *questBrowserHTTPObserver) wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/graphql" || r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}
		var request struct {
			Query         string `json:"query"`
			OperationName string `json:"operationName"`
			Variables     struct {
				Slug any `json:"slug"`
				Meta struct {
					Key string `json:"idempotencyKey"`
				} `json:"meta"`
			} `json:"variables"`
		}
		originalBody := r.Body
		raw, readErr := io.ReadAll(io.LimitReader(originalBody, (1<<20)+1))
		r.Body = struct {
			io.Reader
			io.Closer
		}{io.MultiReader(bytes.NewReader(raw), originalBody), originalBody}
		result := questBrowserHTTPResult{Codes: []string{}}
		invalidRequest := readErr != nil || len(raw) > 1<<20 || !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") || json.Unmarshal(raw, &request) != nil
		if !invalidRequest {
			query, err := parser.ParseQuery(&ast.Source{Input: request.Query})
			if err != nil {
				invalidRequest = true
			} else if operation := query.Operations.ForName(request.OperationName); operation == nil {
				invalidRequest = true
			} else {
				result.Operation = operation.Name
				result.Kind = string(operation.Operation)
				result.Key = request.Variables.Meta.Key
				if slug, ok := request.Variables.Slug.(string); ok && result.Operation == "RuleDetail" && result.Kind == "query" && slug != "" {
					result.RuleDetailSlugHash = fmt.Sprintf("%x", sha256.Sum256([]byte(slug)))
				}
			}
		}
		actor := &questBrowserHTTPActor{}
		tap := &questBrowserHTTPWriter{ResponseWriter: w}
		next.ServeHTTP(tap, r.WithContext(context.WithValue(r.Context(), questBrowserHTTPActorKey{}, actor)))
		result.Status = tap.status
		if result.Status == 0 {
			result.Status = http.StatusOK
		}
		if actor.resolved {
			result.MemberID = actor.authority.Claims().MemberID
		}
		var response struct {
			Data   json.RawMessage `json:"data"`
			Errors []struct {
				Extensions struct {
					Code string `json:"code"`
				} `json:"extensions"`
			} `json:"errors"`
		}
		if invalidRequest {
			result.Codes = append(result.Codes, "HARNESS_INVALID_GRAPHQL_REQUEST")
		}
		if tap.overflow || !strings.HasPrefix(tap.Header().Get("Content-Type"), "application/json") || json.Unmarshal(tap.body.Bytes(), &response) != nil || len(response.Data) == 0 && len(response.Errors) == 0 {
			result.Codes = append(result.Codes, "HARNESS_INVALID_GRAPHQL_RESPONSE")
		} else {
			for _, failure := range response.Errors {
				result.Codes = append(result.Codes, failure.Extensions.Code)
			}
		}
		ordinary := actor.resolved && !actor.authority.Claims().Has(auth.Admin) && !actor.authority.IsPlatformOwner()
		result.expectedDenial = ordinary && result.Status == http.StatusOK && len(result.Codes) > 0 && (result.Operation == "CurrentAdminAccess" || result.Operation == "CurrentReviewAccess")
		for _, code := range result.Codes {
			result.expectedDenial = result.expectedDenial && code == "FORBIDDEN"
		}
		o.mu.Lock()
		o.results = append(o.results, result)
		o.mu.Unlock()
	})
}
func (o *questBrowserHTTPObserver) snapshot() ([]questBrowserHTTPResult, []questBrowserHTTPResult) {
	o.mu.Lock()
	defer o.mu.Unlock()
	all := append([]questBrowserHTTPResult(nil), o.results...)
	unexpected := []questBrowserHTTPResult{}
	for _, result := range all {
		if result.Status != http.StatusOK || len(result.Codes) > 0 && !result.expectedDenial {
			unexpected = append(unexpected, result)
		}
	}
	return all, unexpected
}

func TestQuestBrowserHTTPObserverTransport(t *testing.T) {
	// This proves only the fixture observer's transport lifetime, not product behavior.
	body := []byte(`{"errors":[{"extensions":{"code":"FORBIDDEN"}}],"data":null}`)
	t.Run("preserves status headers and exact bytes", func(t *testing.T) {
		observer := &questBrowserHTTPObserver{}
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/v1/graphql", strings.NewReader(`{"query":"query ObserverForwarding { observed }"}`))
		request.Header.Set("Content-Type", "application/json")
		observer.wrap(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(body)
		})).ServeHTTP(response, request)
		all, unexpected := observer.snapshot()
		if response.Code != 200 || response.Header().Get("Content-Type") != "application/json" || !bytes.Equal(response.Body.Bytes(), body) || len(all) != 1 || len(unexpected) != 1 || !reflect.DeepEqual(all[0].Codes, []string{"FORBIDDEN"}) {
			t.Fatalf("forwarding/strict-code observation failed: status=%d all=%+v unexpected=%+v", response.Code, all, unexpected)
		}
	})
	t.Run("RuleDetail query identity is hashed without changing transport", func(t *testing.T) {
		const slug = "actual-fixture-private-guide"
		for _, sample := range []struct {
			name, query string
			slug        any
			wantHash    bool
		}{
			{"query", "query RuleDetail($slug:String!){document(slug:$slug){id}}", slug, true},
			{"other operation", "query OtherRule($slug:String!){document(slug:$slug){id}}", slug, false},
			{"mutation", "mutation RuleDetail($slug:String!){document(slug:$slug){id}}", slug, false},
			{"missing slug", "query RuleDetail{document(slug:\"fixed\"){id}}", nil, false},
			{"empty slug", "query RuleDetail($slug:String!){document(slug:$slug){id}}", "", false},
			{"non-string slug", "query RuleDetail($slug:String!){document(slug:$slug){id}}", 42, false},
			{"unrelated variable remains ignored", "query OtherRule{observed}", map[string]any{"opaque": true}, false},
		} {
			t.Run(sample.name, func(t *testing.T) {
				observer := &questBrowserHTTPObserver{}
				variables := map[string]any{}
				if sample.slug != nil {
					variables["slug"] = sample.slug
				}
				payload, err := json.Marshal(map[string]any{"query": sample.query, "variables": variables})
				if err != nil {
					t.Fatal(err)
				}
				request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewReader(payload))
				request.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				observer.wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					forwarded, err := io.ReadAll(r.Body)
					if err != nil || !bytes.Equal(forwarded, payload) {
						t.Fatalf("request bytes changed: %v", err)
					}
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusOK)
					_, _ = w.Write(body)
				})).ServeHTTP(response, request)
				all, unexpected := observer.snapshot()
				if len(all) != 1 || len(unexpected) != 1 || response.Code != 200 || response.Header().Get("Content-Type") != "application/json" || !bytes.Equal(response.Body.Bytes(), body) || !reflect.DeepEqual(all[0].Codes, []string{"FORBIDDEN"}) {
					t.Fatalf("transport or failure admission changed: %+v", all)
				}
				want := ""
				if sample.wantHash {
					want = fmt.Sprintf("%x", sha256.Sum256([]byte(slug)))
				}
				if all[0].RuleDetailSlugHash != want {
					t.Fatalf("identity hash=%q want%q", all[0].RuleDetailSlugHash, want)
				}
				raw, err := json.Marshal(all[0])
				if err != nil || bytes.Contains(raw, []byte(slug)) {
					t.Fatalf("raw slug entered observer metadata: %v", err)
				}
			})
		}
	})
	t.Run("retains code after client cancellation", func(t *testing.T) {
		observer := &questBrowserHTTPObserver{}
		started, release := make(chan struct{}), make(chan struct{})
		server := httptest.NewServer(observer.wrap(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			close(started)
			<-release
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(body)
		})))
		defer server.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/v1/graphql", strings.NewReader(`{"query":"query ObserverCancellation { observed }"}`))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		done := make(chan error, 1)
		go func() {
			response, err := http.DefaultClient.Do(request)
			if response != nil {
				_ = response.Body.Close()
			}
			done <- err
		}()
		select {
		case <-started:
		case <-ctx.Done():
			close(release)
			t.Fatal("request did not reach observer")
		}
		cancel()
		if err := <-done; err == nil {
			close(release)
			t.Fatal("HTTP client did not cancel")
		}
		close(release)
		server.Close()
		all, unexpected := observer.snapshot()
		if len(all) != 1 || len(unexpected) != 1 || all[0].Operation != "ObserverCancellation" || all[0].Status != 200 || !reflect.DeepEqual(all[0].Codes, []string{"FORBIDDEN"}) {
			t.Fatalf("cancelled-client observation=%+v unexpected=%+v", all, unexpected)
		}
	})
	t.Run("malformed JSON remains an observation failure", func(t *testing.T) {
		observer := &questBrowserHTTPObserver{}
		request := httptest.NewRequest(http.MethodPost, "/v1/graphql", strings.NewReader(`{"query":"query ObserverMalformed { observed }"}`))
		request.Header.Set("Content-Type", "application/json")
		observer.wrap(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte("{"))
		})).ServeHTTP(httptest.NewRecorder(), request)
		all, unexpected := observer.snapshot()
		if len(all) != 1 || len(unexpected) != 1 || !reflect.DeepEqual(all[0].Codes, []string{"HARNESS_INVALID_GRAPHQL_RESPONSE"}) {
			t.Fatalf("malformed-response observation=%+v unexpected=%+v", all, unexpected)
		}
	})
}

func questBrowserRuntimeInputs(t *testing.T, root string) map[string]string {
	t.Helper()
	inputs := map[string]string{}
	jsonImport := regexp.MustCompile(`(?:from\s+|import\s*)['"]([^'"]+\.json)['"]`)
	add := func(path string) {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256(raw)
		relative, err := filepath.Rel(root, path)
		if err != nil {
			t.Fatal(err)
		}
		inputs[filepath.ToSlash(relative)] = hex.EncodeToString(hash[:])
	}
	for _, directory := range []string{"apps/api/internal", "apps/api/cmd/api", "apps/api/db", "apps/web/src", "packages"} {
		err := filepath.WalkDir(filepath.Join(root, directory), func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				if entry.Name() == "node_modules" || entry.Name() == "dist" || entry.Name() == "tests" || entry.Name() == "test" {
					return filepath.SkipDir
				}
				return nil
			}
			name := entry.Name()
			if strings.HasSuffix(name, "_test.go") || strings.Contains(name, ".test.") || strings.Contains(name, ".spec.") {
				return nil
			}
			switch filepath.Ext(name) {
			case ".go", ".sql", ".ts", ".tsx", ".js", ".jsx", ".css", ".graphql", ".json", ".svg":
				add(path)
			}
			if strings.HasPrefix(path, filepath.Join(root, "apps/web/src")+string(filepath.Separator)) && (strings.HasSuffix(name, ".ts") || strings.HasSuffix(name, ".tsx")) {
				raw, err := os.ReadFile(path)
				if err != nil {
					return err
				}
				for _, match := range jsonImport.FindAllSubmatch(raw, -1) {
					if strings.HasPrefix(string(match[1]), ".") {
						add(filepath.Join(filepath.Dir(path), string(match[1])))
					}
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range []string{"apps/api/go.mod", "apps/api/go.sum", "apps/web/package.json", "apps/web/vite.config.ts", "apps/web/index.html", "package.json", "bun.lock"} {
		add(filepath.Join(root, path))
	}
	return inputs
}

func TestQuestBrowserRetainedJourneys(t *testing.T) {
	runQuestBrowserJourneys(t, true)
}

func TestQuestBrowserLifecycleCurrentJourneys(t *testing.T) {
	runQuestBrowserJourneys(t, false)
}

func runQuestBrowserJourneys(t *testing.T, withComposition bool) {
	t.Helper()
	script, evidence := os.Getenv("QUEST_BROWSER_SCRIPT"), os.Getenv("QUEST_BROWSER_EVIDENCE")
	if !filepath.IsAbs(script) || !filepath.IsAbs(evidence) {
		t.Fatal("absolute QUEST_BROWSER_SCRIPT and QUEST_BROWSER_EVIDENCE are required")
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(script); err != nil {
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
	owned, err := os.ReadFile(script)
	if err != nil {
		t.Fatal(err)
	}
	write("production-inputs-before.json", inputs)
	write("owned-script-input.json", map[string]any{"path": script, "sha256": fmt.Sprintf("%x", sha256.Sum256(owned))})
	fixtureSource, err := os.ReadFile(filepath.Join(root, "apps/api/cmd/api/quest_browser_integration_test.go"))
	if err != nil {
		t.Fatal(err)
	}
	write("owned-native-input.json", map[string]any{"path": "apps/api/cmd/api/quest_browser_integration_test.go", "sha256": fmt.Sprintf("%x", sha256.Sum256(fixtureSource))})
	ownedSources := map[string][]byte{script: owned, filepath.Join(root, "apps/api/cmd/api/quest_browser_integration_test.go"): fixtureSource}
	for _, source := range []struct {
		name string
		raw  []byte
	}{{"browser-input.mjs", owned}, {"native-input.go.txt", fixtureSource}} {
		copyPath := filepath.Join(evidence, source.name)
		if err := os.WriteFile(copyPath, source.raw, 0o444); err != nil {
			t.Fatal(err)
		}
		ownedSources[copyPath] = source.raw
	}
	ownedIdentities := map[string]string{}
	for source, raw := range ownedSources {
		ownedIdentities[source] = fmt.Sprintf("%x", sha256.Sum256(raw))
	}
	write("owned-inputs-before.json", ownedIdentities)
	t.Cleanup(func() {
		after := map[string]string{}
		for source, before := range ownedSources {
			current, err := os.ReadFile(source)
			if err != nil {
				t.Error(err)
				continue
			}
			after[source] = fmt.Sprintf("%x", sha256.Sum256(current))
			if !bytes.Equal(before, current) {
				t.Errorf("owned browser original/copy changed: %s", source)
			}
		}
		write("owned-inputs-after.json", after)
	})
	fixture := newProductFixture(t)
	ctx := context.Background()
	var existingRows int
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM quests)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM characters)`).Scan(&existingRows); err != nil || existingRows != 0 {
		t.Fatalf("migrations-only fixture rows=%d error=%v", existingRows, err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-quest-browser-fixture-key", CORSOrigins: []string{fmt.Sprintf("http://127.0.0.1:%d", port)}}
	runtime := wireForTest(ctx, cfg)
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("actual Wire did not bind fixture")
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
	api := httptest.NewServer(observer.wrap(apiHandler(inner, cfg, runtime.Authority)))
	t.Cleanup(func() {
		api.Close()
		runtime.Pool.Close()
		if err := fixture.close(); err != nil {
			t.Error(err)
			return
		}
		var remaining int
		if err := fixture.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, fixture.databaseName).Scan(&remaining); err != nil || remaining != 0 {
			t.Errorf("fixture cleanup count=%d error=%v", remaining, err)
		}
		write("native-cleanup.json", map[string]any{"apiClosed": true, "databaseDropped": remaining == 0, "database": fixture.databaseName, "at": time.Now().UTC()})
	})
	rows := &authorityDBFixture{pool: fixture.pool, cfg: cfg}
	dm := rows.member(t, auth.DM, auth.Archon)
	rows.profile(t, dm, "approved")
	a, b := rows.member(t, auth.Player), rows.member(t, auth.Player)
	outsider := rows.member(t, auth.DM)
	rows.profile(t, outsider, "approved")
	actors := map[string]authorityDBMember{"dm": dm, "a": a, "b": b, "outsider": outsider}
	tokens := map[string]string{}
	for name, member := range actors {
		rows.exec(t, `UPDATE members SET handle=$2,display_name=$2,status='active' WHERE id=$1`, member.rowID, "quest-fixture-"+name)
		// Deliberately empty token roles: the real middleware must resolve persisted authority.
		tokens[name] = rows.token(t, member.publicID)
	}
	tokens["falseClaims"], err = login.Mint(cfg.JWTSecret, login.Claims{MemberID: b.publicID, Roles: []auth.Role{auth.Admin, auth.DM}, Exp: time.Now().Add(time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	tokens["expired"], err = login.Mint(cfg.JWTSecret, login.Claims{MemberID: a.publicID, Roles: []auth.Role{auth.Player}, Exp: time.Now().Add(-time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	regionID, arcID := uuid.NewString(), uuid.NewString()
	var region int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Quest fixture region','archon') RETURNING id`, regionID).Scan(&region); err != nil {
		t.Fatal(err)
	}
	rows.exec(t, `INSERT INTO archon_assignments(member_id,region_id) VALUES($1,$2)`, dm.rowID, region)
	rows.exec(t, `INSERT INTO quest_arcs(public_id,name,created_by) VALUES($1,'Quest fixture arc',$2)`, arcID, dm.rowID)
	characters := map[string]string{}
	for _, c := range []struct {
		name, status string
		owner        authorityDBMember
	}{{"Hero A", "active", a}, {"Hero B", "active", b}, {"Pending A", "pending_approval", a}, {"Retired A", "retired", a}} {
		id := uuid.NewString()
		characters[c.name] = id
		rows.exec(t, `INSERT INTO characters(public_id,short_code,name,owner_id,status,region_id) VALUES($1,$2,$3,$4,$5,$6)`, id, "C"+strings.ReplaceAll(id, "-", "")[:8], c.name, c.owner.rowID, c.status, region)
	}
	maps := []map[string]string{}
	for _, name := range []string{"North", "South"} {
		mapID, nodeID := uuid.NewString(), uuid.NewString()
		atlas := "quest-fixture-" + strings.ToLower(name)
		var mapRow int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO maps(public_id,name,atlas_code,map_kind,family,region_id,created_by) VALUES($1,$2,$3,'pointcrawl','campaign',$4,$5) RETURNING id`, mapID, "Quest fixture "+name, atlas, region, dm.rowID).Scan(&mapRow); err != nil {
			t.Fatal(err)
		}
		rows.exec(t, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) VALUES($1,$2,$3,1,1,clock_timestamp())`, nodeID, mapRow, name+" node")
		maps = append(maps, map[string]string{"id": mapID, "atlasCode": atlas, "nodeId": nodeID, "nodeName": name + " node"})
	}
	calendar := `{"era":{"name":"Fixture era","abbrev":"FX"},"days_per_week":7,"weekdays":["One","Two","Three","Four","Five","Six","Seven"],"periods":[{"name":"River","type":"month","days":30}],"rate_real_days_per_game_day":1,"moons":[{"name":"Fixture moon","cycle_days":28}]}`
	rows.exec(t, `INSERT INTO game_calendar(id,definition) VALUES(1,$1::jsonb)`, calendar)
	rows.exec(t, `INSERT INTO game_time_map(real_date,game_day) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,1)`)
	var anchorDate string
	if err := fixture.pool.QueryRow(ctx, `SELECT real_date::text FROM game_time_map`).Scan(&anchorDate); err != nil {
		t.Fatal(err)
	}
	anchor, err := time.Parse("2006-01-02", anchorDate)
	if err != nil {
		t.Fatal(err)
	}
	calendarDates := []string{}
	for offset := -48; offset <= 2; offset++ {
		date := anchor.AddDate(0, 0, offset).Format("2006-01-02")
		if offset != 0 {
			rows.exec(t, `INSERT INTO game_time_map(real_date,game_day) VALUES($1::date,1)`, date)
		}
		calendarDates = append(calendarDates, date)
	}
	quests := map[string]map[string]string{}
	scheduled := time.Now().UTC().AddDate(0, 0, 2).Truncate(time.Minute).Add(37*time.Second + 123456*time.Microsecond)
	for _, name := range []string{"application", "zero", "cancel"} {
		id, docID := uuid.NewString(), uuid.NewString()
		code := "quest-fixture-" + name
		var doc, quest int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,slug,title,body,status,visibility,author_id,version) VALUES($1,'quest_brief',$2,$3,'Fixture supplemental brief','published','public',$4,1) RETURNING id`, docID, code, "Quest fixture "+name, dm.rowID).Scan(&doc); err != nil {
			t.Fatal(err)
		}
		signup := "last_game_played"
		if name == "application" {
			signup = "dm_pick"
		}
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO quests(public_id,short_code,dm_id,created_by,kinds,status,scheduled_at,slots_max,signup_type,document_id) VALUES($1,$2,$3,$3,ARRAY['standard'],'open',$4,1,$5,$6) RETURNING id`, id, code, dm.rowID, scheduled, signup, doc).Scan(&quest); err != nil {
			t.Fatal(err)
		}
		rows.exec(t, `INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)`, quest, region)
		quests[name] = map[string]string{"id": id, "shortCode": code, "briefId": docID}
	}
	composition := []map[string]string{}
	for i := 0; i < 47; i++ {
		id, docID := uuid.NewString(), uuid.NewString()
		code, title := fmt.Sprintf("quest-composition-%03d", i), fmt.Sprintf("Quest composition %03d", i)
		at, slots := scheduled, 1
		if i == 0 {
			at, slots = scheduled.Add(-time.Second), 2
		}
		var doc, quest int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,slug,title,body,status,visibility,author_id,version) VALUES($1,'quest_brief',$2,$3,'Quest composition preserved brief','published','public',$4,1) RETURNING id`, docID, code, title, dm.rowID).Scan(&doc); err != nil {
			t.Fatal(err)
		}
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO quests(public_id,short_code,dm_id,created_by,kinds,status,scheduled_at,slots_max,signup_type,document_id) VALUES($1,$2,$3,$3,ARRAY['standard'],'open',$4,$5,'open',$6) RETURNING id`, id, code, dm.rowID, at, slots, doc).Scan(&quest); err != nil {
			t.Fatal(err)
		}
		rows.exec(t, `INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)`, quest, region)
		composition = append(composition, map[string]string{"id": id, "shortCode": code, "briefId": docID, "title": title, "scheduledAt": at.Format(time.RFC3339Nano)})
	}
	inventory := map[string]any{"database": fixture.databaseName, "actors": map[string]string{"dm": dm.publicID, "a": a.publicID, "b": b.publicID, "outsider": outsider.publicID}, "characters": characters, "regionId": regionID, "arcId": arcID, "maps": maps, "quests": quests, "scheduledAt": scheduled.Format(time.RFC3339Nano), "allowedChoices": map[string][]string{"a": {characters["Hero A"]}, "b": {characters["Hero B"]}}, "initialRows": map[string]int{"quests": 50, "characters": 4}, "composition": composition, "calendarDates": calendarDates, "calendar": json.RawMessage(calendar)}
	write("native-inventory.json", inventory)
	stdin, err := json.Marshal(map[string]any{"tokens": tokens, "inventory": inventory})
	if err != nil {
		t.Fatal(err)
	}
	commandCtx, cancel := context.WithTimeout(ctx, 240*time.Second)
	defer cancel()
	command := exec.CommandContext(commandCtx, node, filepath.Join(evidence, "browser-input.mjs"))
	command.Env = append(os.Environ(), "QUEST_API_ORIGIN="+api.URL, "QUEST_VITE_PORT="+strconv.Itoa(port), "QUEST_REPO_ROOT="+root)
	command.Stdin = bytes.NewReader(stdin)
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error { return syscall.Kill(-command.Process.Pid, syscall.SIGTERM) }
	command.WaitDelay = 5 * time.Second
	browserErr := command.Run()
	api.Close()
	httpResults, unexpectedHTTP := observer.snapshot()
	write("http-observer.json", map[string]any{"results": httpResults, "unexpected": unexpectedHTTP})
	after := questBrowserRuntimeInputs(t, root)
	write("production-inputs-after.json", after)
	if !reflect.DeepEqual(inputs, after) {
		t.Fatal("production source changed during browser acceptance")
	}
	var state json.RawMessage
	if err := fixture.pool.QueryRow(ctx, `SELECT jsonb_build_object('quests',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM quests q),'documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM documents d),'roster',(SELECT jsonb_agg(to_jsonb(p) ORDER BY quest_id,character_id) FROM quest_participants p),'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY source_id,relation) FROM document_links l),'points',(SELECT jsonb_agg(to_jsonb(p)) FROM quest_pointcrawl_nodes p),'ledger',(SELECT jsonb_agg(to_jsonb(l)) FROM character_progression_ledger l),'characters',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM characters c),'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM background_jobs j),'receipts',(SELECT jsonb_agg(to_jsonb(i) ORDER BY endpoint,key) FROM idempotency_keys i))`).Scan(&state); err != nil {
		t.Fatal(err)
	}
	write("native-persisted-readback.json", state)
	var capacityViolations, cacheViolations, duplicateAwards int
	if err := fixture.pool.QueryRow(ctx, `SELECT
	 (SELECT count(*) FROM quests q WHERE q.filled_count<0 OR q.filled_count>q.slots_max OR (q.status IN ('open','full') AND q.filled_count<>(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND p.status='signed_up'))),
	 (SELECT count(*) FROM characters c WHERE c.player_xp<>COALESCE((SELECT sum(l.delta) FROM character_progression_ledger l WHERE l.character_id=c.id AND l.kind='pcxp'),0)),
	 (SELECT count(*) FROM (SELECT quest_id,character_id FROM character_progression_ledger WHERE reason='quest_reward' GROUP BY quest_id,character_id HAVING count(*)>1) repeated)`).Scan(&capacityViolations, &cacheViolations, &duplicateAwards); err != nil {
		t.Fatal(err)
	}
	write("native-invariants.json", map[string]int{"capacityViolations": capacityViolations, "cacheViolations": cacheViolations, "duplicateQuestAwards": duplicateAwards})
	if capacityViolations != 0 || cacheViolations != 0 || duplicateAwards != 0 {
		t.Errorf("committed invariant violations: capacity=%d cache=%d duplicateAwards=%d", capacityViolations, cacheViolations, duplicateAwards)
	}
	if len(unexpectedHTTP) > 0 {
		t.Errorf("unexpected actual HTTP GraphQL outcomes: %+v", unexpectedHTTP)
	}
	if browserErr != nil {
		t.Fatal("real Quest browser acceptance:", browserErr)
	}
	var browserReceipt struct {
		Completed, BrowserClosed, ViteClosed bool
		Created                              map[string]struct{ ID string }
		Operations                           []struct{ Actor, Kind, Key, Name, Phase string }
		SettingsCommands                     []struct{ Key, Timezone, MemberID string }
		CompositionCommands                  []struct{ Actor, Name, Key, Phase string }
		Checks                               []struct{ Name string }
	}
	raw, err := os.ReadFile(filepath.Join(evidence, "browser-receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &browserReceipt); err != nil {
		t.Fatal(err)
	}
	if !browserReceipt.Completed || !browserReceipt.BrowserClosed || !browserReceipt.ViteClosed {
		t.Fatal("browser did not complete and close all resources")
	}
	if !withComposition {
		expectedJourneys := []string{
			"Canonical middleware ignores forged token roles and reloads persisted authority",
			"Quest editor create, reload and metadata/body update",
			"Saved timezone redisplay and explicit gap/overlap resolution",
			"Arc assignment clear and real pointcrawl cross-map persistence",
			"Explicit own-PC choices, waitlist withdrawal and FIFO promotion",
			"DM manual selection, final attendance and positive closure",
			"Explicit zero-award closure and cancellation",
			"Authoritative PC/DM summaries through the shared editor",
			"Current owner controls, persisted roles and expired-token UI",
		}
		actualJourneys := make([]string, len(browserReceipt.Checks))
		for i, check := range browserReceipt.Checks {
			actualJourneys[i] = check.Name
		}
		if !reflect.DeepEqual(actualJourneys, expectedJourneys) {
			t.Fatal("expected the exact nine lifecycle journeys in order")
		}
		if len(browserReceipt.CompositionCommands) != 0 {
			t.Fatal("lifecycle scope must not run composition commands")
		}
		if _, exists := browserReceipt.Created["compositionArc"]; exists {
			t.Fatal("lifecycle scope must not create a composition Arc")
		}
		write("lifecycle-journey-contract.json", map[string]any{"test": t.Name(), "journeys": actualJourneys, "compositionCommands": len(browserReceipt.CompositionCommands)})
	}
	primary, pcSummary, dmSummary := browserReceipt.Created["quest"].ID, browserReceipt.Created["pcSummary"].ID, browserReceipt.Created["dmSummary"].ID
	for _, id := range []string{primary, pcSummary, dmSummary} {
		if _, err := uuid.Parse(id); err != nil {
			t.Fatal("missing actual browser-created identity", id)
		}
	}
	requireCount := func(want int, query string, args ...any) {
		t.Helper()
		var count int
		if err := fixture.pool.QueryRow(ctx, query, args...).Scan(&count); err != nil || count != want {
			t.Fatalf("persisted invariant count=%d want=%d error=%v query=%s", count, want, err, query)
		}
	}
	requireCount(51, `SELECT count(*) FROM quests`)
	requireCount(53, `SELECT count(*) FROM documents`)
	requireCount(51, `SELECT count(*) FROM quest_regions`)
	requireCount(51, `SELECT count(*) FROM game_time_map WHERE game_day=1`)
	requireCount(51, `SELECT count(*) FROM game_time_map`)
	requireCount(1, `SELECT count(*) FROM game_calendar WHERE id=1 AND definition=$1::jsonb`, calendar)
	for _, date := range calendarDates {
		requireCount(1, `SELECT count(*) FROM game_time_map WHERE real_date=$1::date AND game_day=1`, date)
	}
	if withComposition {
		requireCount(2, `SELECT count(*) FROM quest_arcs`)
	} else {
		requireCount(1, `SELECT count(*) FROM quest_arcs`)
	}
	for _, added := range composition {
		requireCount(1, `SELECT count(*) FROM quests q JOIN documents d ON d.id=q.document_id JOIN quest_regions r ON r.quest_id=q.id JOIN regions region ON region.id=r.region_id WHERE q.public_id=$1::uuid AND q.dm_id=$2 AND q.created_by=$2 AND q.status='open' AND q.filled_count=0 AND q.scheduled_at=$3::timestamptz AND region.public_id=$4::uuid AND d.public_id=$5::uuid AND d.author_id=$2 AND d.kind='quest_brief' AND d.status='published' AND d.visibility='public' AND d.body='Quest composition preserved brief' AND d.version=1 AND d.title=$6`, added["id"], dm.rowID, added["scheduledAt"], regionID, added["briefId"], added["title"])
		requireCount(0, `SELECT count(*) FROM character_progression_ledger l JOIN quests q ON q.id=l.quest_id WHERE q.public_id=$1::uuid`, added["id"])
	}
	if withComposition {
		for _, owner := range []struct {
			member    int64
			character string
		}{{a.rowID, characters["Hero A"]}, {b.rowID, characters["Hero B"]}} {
			requireCount(1, `SELECT count(*) FROM quest_participants p JOIN quests q ON q.id=p.quest_id JOIN characters c ON c.id=p.character_id WHERE q.public_id=$1::uuid AND p.member_id=$2 AND c.public_id=$3::uuid AND p.status='withdrawn' AND NOT p.manual`, composition[0]["id"], owner.member, owner.character)
		}
		requireCount(2, `SELECT count(*) FROM quest_participants p JOIN quests q ON q.id=p.quest_id WHERE q.public_id=$1::uuid`, composition[0]["id"])
		arcCreated := browserReceipt.Created["compositionArc"].ID
		if _, err := uuid.Parse(arcCreated); err != nil {
			t.Fatal("missing actual UI-created Arc UUID", arcCreated)
		}
		requireCount(1, `SELECT count(*) FROM quest_arcs WHERE public_id=$1::uuid AND created_by=$2 AND name='Quest composition renamed series'`, arcCreated, dm.rowID)
		requireCount(1, `SELECT count(*) FROM background_jobs j JOIN quests q ON q.public_id::text=j.payload->>'public_id' WHERE q.public_id=$1::uuid AND j.kind='quest_discord_delivery' AND j.state='queued' AND j.attempts=0 AND q.discord_desired_revision=4 AND q.discord_applied_revision=0 AND j.payload->>'desired_revision'=q.discord_desired_revision::text`, composition[0]["id"])
		expectedComposition := []struct{ Actor, Name string }{{"a", "SignupForQuest"}, {"a", "HomeWithdrawFromQuest"}, {"b", "SignupForQuest"}, {"b", "WithdrawFromQuest"}, {"dm", "RetainedUpsertArc"}, {"dm", "RetainedUpsertArc"}}
		if len(browserReceipt.CompositionCommands) != len(expectedComposition) {
			t.Fatal("expected six composition commands")
		}
		compositionPhases := map[string]bool{
			"Home CTA, explicit PC signup and Home withdrawal persist":        true,
			"Board 50+1 filters and CTA signup/withdraw persist":              true,
			"Series create/rename canonical UUID and unrelated DM admission":  true,
			"Calendar projections, filters, 50+1 pages and reverse URL state": true,
		}
		observedComposition := []struct{ Actor, Name, Key, Phase string }{}
		for _, operation := range browserReceipt.Operations {
			if operation.Kind == "mutation" && compositionPhases[operation.Phase] {
				observedComposition = append(observedComposition, struct{ Actor, Name, Key, Phase string }{operation.Actor, operation.Name, operation.Key, operation.Phase})
			}
		}
		if !reflect.DeepEqual(observedComposition, browserReceipt.CompositionCommands) {
			t.Fatal("all observed composition mutations must be the six acknowledged commands in order")
		}
		compositionKeys := map[string]bool{}
		for i, command := range browserReceipt.CompositionCommands {
			if command.Actor != expectedComposition[i].Actor || command.Name != expectedComposition[i].Name || compositionKeys[command.Key] {
				t.Fatal("unexpected composition command identity/repeated key")
			}
			if _, err := uuid.Parse(command.Key); err != nil {
				t.Fatal("composition command needs actual stable UUID key")
			}
			compositionKeys[command.Key] = true
			endpoint := "signupForQuest"
			if command.Name == "HomeWithdrawFromQuest" || command.Name == "WithdrawFromQuest" {
				endpoint = "withdrawFromQuest"
			}
			if command.Name == "RetainedUpsertArc" {
				endpoint = "upsertQuestArc"
			}
			requireCount(1, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND key=$2 AND endpoint=$3 AND completed_at IS NOT NULL AND receipt IS NOT NULL`, actors[command.Actor].rowID, command.Key, "graphql:"+endpoint)
		}
	} else {
		for _, added := range composition {
			requireCount(0, `SELECT count(*) FROM quest_participants p JOIN quests q ON q.id=p.quest_id WHERE q.public_id=$1::uuid`, added["id"])
			requireCount(0, `SELECT count(*) FROM background_jobs WHERE payload->>'public_id'=$1`, added["id"])
		}
	}
	requireCount(1, `SELECT count(*) FROM quests WHERE public_id=$1::uuid AND status='closed' AND filled_count=0 AND scheduled_at=$2::timestamptz`, quests["application"]["id"], scheduled)
	requireCount(1, `SELECT count(*) FROM quest_participants p JOIN quests q ON q.id=p.quest_id JOIN characters c ON c.id=p.character_id WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid AND p.status='played' AND p.manual`, quests["application"]["id"], characters["Hero A"])
	requireCount(1, `SELECT count(*) FROM quest_participants p JOIN quests q ON q.id=p.quest_id JOIN characters c ON c.id=p.character_id WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid AND p.status='no_show' AND c.player_xp=0`, quests["application"]["id"], characters["Hero B"])
	requireCount(1, `SELECT count(*) FROM character_progression_ledger l JOIN quests q ON q.id=l.quest_id JOIN characters c ON c.id=l.character_id WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid AND l.recorded_by=$3 AND l.kind='pcxp' AND l.reason='quest_reward' AND l.delta=3`, quests["application"]["id"], characters["Hero A"], dm.rowID)
	requireCount(2, `SELECT count(*) FROM idempotency_keys WHERE receipt->>'rewardCoverage'='COMPLETE' AND completed_at IS NOT NULL`)
	requireCount(1, `SELECT count(*) FROM quests q JOIN documents d ON d.id=q.document_id JOIN quest_regions r ON r.quest_id=q.id JOIN regions region ON region.id=r.region_id JOIN quest_arcs arc ON arc.id=q.arc_id WHERE q.public_id=$1::uuid AND q.dm_id=$2 AND q.created_by=$2 AND q.filled_count=0 AND q.slots_max=1 AND arc.public_id=$3::uuid AND region.public_id=$4::uuid AND d.author_id=$2 AND d.kind='quest_brief' AND d.status='published' AND d.body='Quest browser edited brief' AND d.version>=3 AND d.frontmatter_yaml LIKE '%Quest browser edited additional info%' AND q.scheduled_at=$5::timestamptz`, primary, dm.rowID, arcID, regionID, scheduled.Truncate(time.Minute))
	requireCount(1, `SELECT count(*) FROM quest_participants p JOIN quests q ON q.id=p.quest_id JOIN characters c ON c.id=p.character_id WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid AND p.member_id=$3 AND p.status='waitlisted'`, primary, characters["Hero B"], b.rowID)
	requireCount(1, `SELECT count(*) FROM quest_participants p JOIN quests q ON q.id=p.quest_id JOIN characters c ON c.id=p.character_id WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid AND p.member_id=$3 AND p.status='withdrawn'`, primary, characters["Hero A"], a.rowID)
	requireCount(3, `SELECT count(*) FROM quest_pointcrawl_nodes p JOIN quests q ON q.id=p.quest_id WHERE q.public_id=$1::uuid`, primary)
	for _, link := range []struct{ node, role string }{{maps[0]["nodeId"], "expected"}, {maps[0]["nodeId"], "visited"}, {maps[1]["nodeId"], "expected"}} {
		requireCount(1, `SELECT count(*) FROM quest_pointcrawl_nodes p JOIN quests q ON q.id=p.quest_id JOIN pointcrawl_nodes n ON n.id=p.node_id WHERE q.public_id=$1::uuid AND n.public_id=$2::uuid AND p.role=$3`, primary, link.node, link.role)
	}
	for _, doc := range []struct {
		id               string
		author           int64
		body, visibility string
	}{{pcSummary, a.rowID, "Quest browser PC edited public summary", "public"}, {dmSummary, dm.rowID, "Quest browser DM private marker", "dm_only"}} {
		requireCount(1, `SELECT count(*) FROM documents WHERE public_id=$1::uuid AND author_id=$2 AND body=$3 AND visibility=$4 AND status='published' AND kind='summary'`, doc.id, doc.author, doc.body, doc.visibility)
	}
	requireCount(1, `SELECT count(*) FROM document_links l JOIN documents d ON d.id=l.source_id JOIN characters c ON c.id=l.character_target_id WHERE d.public_id=$1::uuid AND c.public_id=$2::uuid AND l.relation='subject'`, pcSummary, characters["Hero A"])
	requireCount(0, `SELECT count(*) FROM document_links l JOIN documents d ON d.id=l.source_id WHERE d.public_id=$1::uuid AND l.character_target_id IS NOT NULL AND l.relation='subject'`, dmSummary)
	for _, link := range []struct{ doc, quest string }{{pcSummary, quests["application"]["id"]}, {dmSummary, quests["application"]["id"]}, {dmSummary, quests["zero"]["id"]}} {
		requireCount(1, `SELECT count(*) FROM document_links l JOIN documents d ON d.id=l.source_id JOIN quests q ON q.id=l.quest_target_id WHERE d.public_id=$1::uuid AND q.public_id=$2::uuid AND l.relation='summarizes'`, link.doc, link.quest)
	}
	requireCount(1, `SELECT count(*) FROM background_jobs j JOIN quests q ON q.public_id::text=j.payload->>'public_id' WHERE q.public_id=$1::uuid AND j.kind='quest_discord_delivery' AND j.state='queued' AND j.attempts=0 AND j.payload->>'desired_revision'=q.discord_desired_revision::text AND q.discord_applied_revision=0`, primary)
	for _, operation := range browserReceipt.Operations {
		if operation.Kind != "mutation" {
			continue
		}
		if _, err := uuid.Parse(operation.Key); err != nil {
			t.Fatal("mutation omitted stable UUID key")
		}
		actor, ok := actors[operation.Actor]
		if !ok {
			t.Fatal("unexpected mutation actor")
		}
		requireCount(1, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND key=$2 AND completed_at IS NOT NULL AND receipt IS NOT NULL AND fingerprint ~ '^[0-9a-f]{64}$'`, actor.rowID, operation.Key)
	}
	requireCount(1, `SELECT count(*) FROM member_settings WHERE member_id=$1 AND timezone='UTC'`, dm.rowID)
	if len(browserReceipt.SettingsCommands) != 2 {
		t.Fatalf("expected two actual saved-timezone commands, got%d", len(browserReceipt.SettingsCommands))
	}
	for i, command := range browserReceipt.SettingsCommands {
		if command.MemberID != dm.publicID || command.Timezone != []string{"America/New_York", "UTC"}[i] {
			t.Fatal("unexpected settings actor or timezone")
		}
		if _, err := uuid.Parse(command.Key); err != nil {
			t.Fatal("settings mutation omitted stable UUID key")
		}
		requireCount(1, `SELECT count(*) FROM idempotency_keys WHERE actor_id=$1 AND key=$2 AND completed_at IS NOT NULL AND receipt IS NOT NULL`, dm.rowID, command.Key)
	}
	var awarded int
	if err := fixture.pool.QueryRow(ctx, `SELECT c.player_xp FROM characters c WHERE public_id=$1`, characters["Hero A"]).Scan(&awarded); err != nil || awarded != 3 {
		t.Fatalf("HeroA PCXP=%d error=%v", awarded, err)
	}
	var rewardRows, closed, cancelled int
	if err := fixture.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM character_progression_ledger WHERE reason='quest_reward' AND delta=3),(SELECT count(*) FROM quests WHERE status='closed'),(SELECT count(*) FROM quests WHERE status='cancelled')`).Scan(&rewardRows, &closed, &cancelled); err != nil || rewardRows != 1 || closed != 2 || cancelled != 1 {
		t.Fatalf("reward=%d closed=%d cancelled=%d error=%v", rewardRows, closed, cancelled, err)
	}
}
