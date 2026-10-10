package main

import (
	"os"
	"testing"
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
	for _, table := range []string{"members", "hexes", "pois", "characters", "quests", "quest_participants"} {
		if counts[table] < 8 {
			t.Fatalf("%s=%d", table, counts[table])
		}
	}
	if counts["dm_profiles"] < 5 {
		t.Fatalf("dm_profiles=%d", counts["dm_profiles"])
	}
	if counts["hexes"] < 64 || openQuests < 12 {
		t.Fatalf("hexes=%d open quests=%d", counts["hexes"], openQuests)
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
