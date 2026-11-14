//go:build integration && frontend_acceptance

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

// This opt-in acceptance lane uses the installed Node/browser environment and
// a migrations-only ProductFixture. Ordinary integration tests never invoke it.
func TestChronicleBrowserCompleteCollection(t *testing.T) {
	script := os.Getenv("CHRONICLE_BROWSER_SCRIPT")
	evidence := os.Getenv("CHRONICLE_BROWSER_EVIDENCE")
	if !filepath.IsAbs(script) || !filepath.IsAbs(evidence) {
		t.Fatal("explicit absolute CHRONICLE_BROWSER_SCRIPT and CHRONICLE_BROWSER_EVIDENCE are required")
	}
	if _, err := os.Stat(script); err != nil {
		t.Fatal(err)
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal("the supported installed Node environment is required:", err)
	}
	if err := os.MkdirAll(evidence, 0o755); err != nil {
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

	fixture := newProductFixture(t)
	ctx := context.Background()
	var originalRows int
	if err := fixture.pool.QueryRow(ctx, `SELECT count(*) FROM documents`).Scan(&originalRows); err != nil || originalRows != 0 {
		t.Fatalf("acceptance requires an empty migrations-only fixture: rows=%d err=%v", originalRows, err)
	}
	reserved, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := reserved.Addr().(*net.TCPAddr).Port
	if err := reserved.Close(); err != nil {
		t.Fatal(err)
	}
	origin := fmt.Sprintf("http://127.0.0.1:%d", port)
	cfg := config.Config{DatabaseURL: fixture.databaseURL, RequireDatabase: true, JWTSecret: "synthetic-chronicle-fixture-key", CORSOrigins: []string{origin}}
	runtime := wireForTest(ctx, cfg)
	if runtime.Pool != nil {
		t.Cleanup(runtime.Pool.Close)
	}
	if runtime.Pool == nil || runtime.Authority == nil {
		t.Fatal("production Wire did not bind the isolated PostgreSQL fixture")
	}
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)
	api := httptest.NewServer(apiHandler(mux, cfg, runtime.Authority))
	t.Cleanup(func() {
		api.Close()
		runtime.Pool.Close()
		if err := fixture.close(); err != nil {
			t.Errorf("drop acceptance fixture: %v", err)
			return
		}
		var databases int
		if err := fixture.server.admin.QueryRow(ctx, `SELECT count(*) FROM pg_database WHERE datname=$1`, fixture.databaseName).Scan(&databases); err != nil || databases != 0 {
			t.Errorf("fixture database still present: count=%d err=%v", databases, err)
		}
		writeEvidence("native-cleanup.json", map[string]any{"at": time.Now().UTC(), "database": fixture.databaseName, "databaseDropped": databases == 0, "apiClosed": true})
	})
	rows := &authorityDBFixture{pool: fixture.pool}
	common := rows.member(t, auth.DM)
	late := rows.member(t, auth.DM)
	rows.exec(t, `UPDATE members SET handle='chronicle-common-author' WHERE id=$1`, common.rowID)
	rows.exec(t, `UPDATE members SET handle='chronicle-late-author' WHERE id=$1`, late.rowID)
	rows.profile(t, common, "approved")
	rows.profile(t, late, "approved")
	verifier := rows.member(t, auth.Verifier)
	rows.exec(t, `UPDATE members SET handle='chronicle-fixture-verifier' WHERE id=$1`, verifier.rowID)
	rows.exec(t, `INSERT INTO game_calendar(id,definition) VALUES(1,'{"era":{"name":"Fixture era","abbrev":"FX"},"periods":[{"name":"First","type":"month","days":30}]}')`)
	rows.exec(t, `INSERT INTO game_time_map(real_date,game_day) VALUES(CURRENT_DATE,1)`)
	briefID, arcID, regionID, questID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	var brief, arc, region, quest int64
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,slug,title,author_id,status,visibility,body) VALUES($1,'quest_brief','chronicle-fixture-brief','Chronicle fixture quest',$2,'published','public','Public fixture brief') RETURNING id`, briefID, late.rowID).Scan(&brief); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO quest_arcs(public_id,name,created_by) VALUES($1,'Chronicle boundary arc',$2) RETURNING id`, arcID, late.rowID).Scan(&arc); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Chronicle boundary region','server') RETURNING id`, regionID).Scan(&region); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,arc_id,scheduled_at,document_id,created_by) VALUES($1,'chronicle-fixture-quest',ARRAY['standard'],'closed',$2,$3,CURRENT_DATE,$4,$2) RETURNING id`, questID, late.rowID, arc, brief).Scan(&quest); err != nil {
		t.Fatal(err)
	}
	rows.exec(t, `INSERT INTO quest_regions(quest_id,region_id) VALUES($1,$2)`, quest, region)
	ids := make([]string, 0, 101)
	summaryInventory := make([]map[string]any, 0, 101)
	for index := 0; index < 101; index++ {
		id := fmt.Sprintf("6d000000-0000-4000-8000-%012d", index+1)
		ids = append(ids, id)
		author, title := common.rowID, fmt.Sprintf("Chronicle fixture entry %03d", index+1)
		if index == 100 {
			author, title = late.rowID, "Page101 chronicle target"
		}
		var row int64
		if err := fixture.pool.QueryRow(ctx, `INSERT INTO documents(public_id,kind,category,slug,title,author_id,status,visibility,policy,body,updated_at) VALUES($1,'summary','dm',$2,$3,$4,'published','public',NULL,'Public summary fixture',$5) RETURNING id`, id, fmt.Sprintf("chronicle-fixture-summary-%03d", index+1), title, author, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC).Add(-time.Duration(index)*time.Minute)).Scan(&row); err != nil {
			t.Fatal(err)
		}
		if index == 100 {
			rows.exec(t, `INSERT INTO document_links(source_id,quest_target_id,relation) VALUES($1,$2,'summarizes')`, row, quest)
		}
		authorID := common.publicID
		if index == 100 {
			authorID = late.publicID
		}
		summaryInventory = append(summaryInventory, map[string]any{"id": id, "slug": fmt.Sprintf("chronicle-fixture-summary-%03d", index+1), "title": title, "authorID": authorID})
	}
	// Ordinary canonical families retain their real kind/category/author contract.
	// Rules have a current Verifier; the approved DM has exactly one live table.
	type readerFixture struct {
		ID       string   `json:"id"`
		Kind     string   `json:"kind"`
		Category string   `json:"category"`
		Slug     string   `json:"slug"`
		Title    string   `json:"title"`
		Body     string   `json:"body"`
		AuthorID string   `json:"authorId"`
		Roles    []string `json:"authorRoles"`
	}
	readers := []readerFixture{
		{uuid.NewString(), "rule", "ruling", "canonical-boundary-ruling", "Canonical boundary ruling", "Canonical ruling body marker", verifier.publicID, []string{"verifier"}},
		{uuid.NewString(), "rule", "guide", "canonical-boundary-guide", "Canonical boundary guide", "Canonical guide body marker", verifier.publicID, []string{"verifier"}},
		{uuid.NewString(), "codex_entry", "Lore", "canonical-boundary-codex", "Canonical boundary codex", "Canonical codex body marker", late.publicID, []string{"dm"}},
		{uuid.NewString(), "community", "notice", "canonical-boundary-community", "Canonical boundary community", "Canonical community body marker", late.publicID, []string{"dm"}},
		{uuid.NewString(), "community", "dm_table", "canonical-boundary-table", "Canonical boundary table", "Canonical table body marker", late.publicID, []string{"dm"}},
	}
	for _, reader := range readers {
		author := late.rowID
		if reader.Kind == "rule" {
			author = verifier.rowID
		}
		frontmatter := "{}"
		if reader.Category == "dm_table" {
			frontmatter = "blurb: Canonical table public blurb\ntags:\n  - fixture\n"
		}
		rows.exec(t, `INSERT INTO documents(public_id,kind,category,slug,title,author_id,status,visibility,policy,body,frontmatter_yaml) VALUES($1,$2,$3,$4,$5,$6,'published','public',NULL,$7,$8)`, reader.ID, reader.Kind, reader.Category, reader.Slug, reader.Title, author, reader.Body, frontmatter)
	}
	var tables int
	if err := fixture.pool.QueryRow(ctx, `SELECT count(*) FROM documents WHERE kind='community' AND category='dm_table' AND author_id=$1 AND deleted_at IS NULL`, late.rowID).Scan(&tables); err != nil || tables != 1 {
		t.Fatalf("fixture must occupy exactly one D5 table slot: count=%d err=%v", tables, err)
	}
	writeEvidence("native-inventory.json", map[string]any{"database": fixture.databaseName, "existingDocumentRows": originalRows, "summaryCount": len(ids), "summaryIDs": ids, "summaries": summaryInventory, "kind": "summary", "category": "dm", "status": "published", "visibility": "public", "policy": nil, "authors": []string{common.publicID, late.publicID, verifier.publicID}, "canonicalReaders": readers, "tableSlots": tables, "briefID": briefID, "briefSlug": "chronicle-fixture-brief", "briefAuthorID": late.publicID, "questID": questID, "questShortCode": "chronicle-fixture-quest", "arcID": arcID, "regionID": regionID, "fixtureTables": []string{"members", "dm_profiles", "documents", "quest_arcs", "quests", "regions", "quest_regions", "document_links", "game_calendar", "game_time_map"}})
	commandCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	command := exec.CommandContext(commandCtx, node, script)
	command.Env = append(os.Environ(), "CHRONICLE_API_ORIGIN="+api.URL, "CHRONICLE_VITE_PORT="+strconv.Itoa(port))
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error { return syscall.Kill(-command.Process.Pid, syscall.SIGTERM) }
	command.WaitDelay = 5 * time.Second
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	if err := command.Run(); err != nil {
		t.Fatal("native Chronicle browser acceptance:", err)
	}
}
