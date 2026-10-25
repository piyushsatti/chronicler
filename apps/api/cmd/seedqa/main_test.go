package main

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func TestParseJSONLSkipsBlanks(t *testing.T) {
	raw := []byte("\n# note\n" +
		`{"table":"members","conflict":["public_id"],"row":{"public_id":"11111111-1111-4111-8111-111111111111","handle":"admin"}}` + "\n")
	lines, err := parseJSONL(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 1 || lines[0].Table != "members" {
		t.Fatalf("%+v", lines)
	}
}

func TestGenerateQACoversTheWorld(t *testing.T) {
	lines := generateQA()
	if err := writeQA(t.TempDir() + "/qa.jsonl"); err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	codex := map[string]int{}
	slugs := map[string]bool{}
	ids := map[string]bool{}
	var openQuests int
	for i, row := range lines {
		if err := validate(row); err != nil {
			t.Fatalf("row %d %s: %v", i, row.Table, err)
		}
		counts[row.Table]++
		if id, ok := row.Row["public_id"].(string); ok {
			if ids[id] {
				t.Fatalf("duplicate public_id %s", id)
			}
			ids[id] = true
		}
		if row.Table == "documents" {
			slug, _ := row.Row["slug"].(string)
			if slugs[slug] {
				t.Fatalf("duplicate slug %s", slug)
			}
			slugs[slug] = true
			if row.Row["kind"] == "codex_entry" {
				codex[row.Row["category"].(string)]++
			}
		}
		if row.Table == "quests" && row.Row["status"] == "open" {
			openQuests++
		}
	}
	if counts["documents"] < 120 {
		t.Fatalf("documents=%d", counts["documents"])
	}
	if codex["Entities"] < 20 || codex["Locations"] < 20 || codex["Feature"] < 20 || codex["Rules"] < 20 || codex["Lore"] < 20 {
		t.Fatalf("codex=%v", codex)
	}
	for _, table := range []string{"members", "pointcrawl_nodes", "characters", "quests", "quest_participants"} {
		if counts[table] < 8 {
			t.Fatalf("%s=%d", table, counts[table])
		}
	}
	if counts["dm_profiles"] < 5 {
		t.Fatalf("dm_profiles=%d", counts["dm_profiles"])
	}
	if counts["pointcrawl_nodes"] < 20 || openQuests < 12 {
		t.Fatalf("pointcrawl_nodes=%d open quests=%d", counts["pointcrawl_nodes"], openQuests)
	}
}

func TestLatestMigrationVersion(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"0001_init.sql", "0003_later.sql", "notes.txt", "0002_mid.sql"} {
		if err := os.WriteFile(dir+"/"+name, []byte("-- x\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	got, err := latestMigrationVersion(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got != 3 {
		t.Fatalf("version %d", got)
	}
}

func TestInsertSQL(t *testing.T) {
	got := insertSQL("quests", []string{"public_id", "dm_id"}, []string{"public_id"})
	want := "INSERT INTO quests (public_id, dm_id) VALUES ($1, $2) ON CONFLICT (public_id) DO NOTHING"
	if got != want {
		t.Fatalf("got %s", got)
	}
}

func TestGameTimeMapFollowsSeededAnchor(t *testing.T) {
	days := map[string]int{}
	var anchors int
	for _, row := range generateQA() {
		switch row.Table {
		case "time_anchors":
			anchors++
		case "game_time_map":
			days[row.Row["real_date"].(string)] = row.Row["game_day"].(int)
		}
	}
	if anchors != 1 {
		t.Fatalf("time_anchors=%d", anchors)
	}
	// 2026-01-01 anchor, epoch 0, rate 1.5: 1 Oct is 273 days in, so floor(409.5).
	want := map[string]int{
		"2026-10-01T00:00:00Z": 409,
		"2026-10-15T00:00:00Z": 430,
		"2026-10-18T00:00:00Z": 435,
		"2026-10-19T00:00:00Z": 436,
		"2026-10-31T00:00:00Z": 454,
	}
	for date, day := range want {
		if days[date] != day {
			t.Fatalf("%s game_day=%d want %d", date, days[date], day)
		}
	}
	// The map is not pinned to one month: every date from the anchor through the
	// range has a row, and every row agrees with the API's own formula.
	if len(days) != qaMappedDays {
		t.Fatalf("game_time_map rows=%d want %d", len(days), qaMappedDays)
	}
	for d := 0; d < qaMappedDays; d++ {
		midnight := qaAnchor.RealUtc.AddDate(0, 0, d)
		got, ok := days[midnight.Format(time.RFC3339)]
		if !ok {
			t.Fatalf("no game day for %s", midnight.Format(time.DateOnly))
		}
		want, err := spatial.GameDayAt(midnight, qaAnchor)
		if err != nil || got != int(want) {
			t.Fatalf("%s game_day=%d want %d (%v)", midnight.Format(time.DateOnly), got, want, err)
		}
	}
	// November holds seeded quests, so its calendar month must be mapped too.
	if _, ok := days["2026-11-20T00:00:00Z"]; !ok {
		t.Fatal("no game day for a seeded November quest date")
	}
}

func TestPlatformOwnerRef(t *testing.T) {
	ok := []byte(`{"table":"documents","conflict":["slug"],"refs":{"author_id":{"table":"members","platform_owner":true}},"row":{"slug":"x"}}`)
	lines, err := parseJSONL(ok)
	if err != nil || !needsPlatformOwner(lines) {
		t.Fatalf("lines=%+v err=%v", lines, err)
	}
	for _, bad := range []string{
		`{"table":"documents","conflict":["slug"],"refs":{"author_id":{"table":"regions","platform_owner":true}},"row":{}}`,
		`{"table":"documents","conflict":["slug"],"refs":{"author_id":{"table":"members","platform_owner":true,"public_id":"11111111-1111-4111-8111-111111111111"}},"row":{}}`,
		`{"table":"documents","conflict":["slug"],"refs":{"author_id":{"table":"members"}},"row":{}}`,
	} {
		if _, err := parseJSONL([]byte(bad)); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
	t.Setenv(ownerEnv, "")
	if _, err := platformOwnerDiscordID(); err == nil {
		t.Fatal("empty owner accepted")
	}
	t.Setenv(ownerEnv, "not-a-snowflake")
	if _, err := platformOwnerDiscordID(); err == nil || strings.Contains(err.Error(), "not-a-snowflake") {
		t.Fatalf("err=%v", err)
	}
	t.Setenv(ownerEnv, "12345678901234567")
	if id, err := platformOwnerDiscordID(); err != nil || id != "12345678901234567" {
		t.Fatalf("id=%q err=%v", id, err)
	}
}
