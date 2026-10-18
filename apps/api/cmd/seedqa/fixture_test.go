package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
)

func TestCheckedInQAMatchesGenerator(t *testing.T) {
	path := t.TempDir() + "/qa.jsonl"
	if err := writeQA(path); err != nil {
		t.Fatal(err)
	}
	generated, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	checkedIn, err := os.ReadFile("../../db/seed/qa.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(generated, checkedIn) {
		t.Fatal("qa.jsonl differs from generator; run go run ./cmd/seedqa -write")
	}
	rows, err := parseJSONL(checkedIn)
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, row := range rows {
		counts[row.Table]++
	}
	if len(rows) != 623+5 || len(counts) != 44 || counts["background_jobs"] != 7 {
		t.Fatalf("specifications=%d tables=%d jobs=%d", len(rows), len(counts), counts["background_jobs"])
	}
}

func TestQAColumnsMatchInitialDDL(t *testing.T) {
	var schema struct {
		FinalTables map[string]struct {
			Columns map[string]struct {
				Generated bool `json:"generated"`
			} `json:"columns"`
		} `json:"final_tables"`
	}
	raw, err := os.ReadFile("../api/testdata/product/physical-schema-inventory.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	ddl := map[string]map[string]bool{}
	entries, err := os.ReadDir("../../db/migrations")
	if err != nil {
		t.Fatal(err)
	}
	createTable := regexp.MustCompile(`(?s)CREATE TABLE (\w+) \((.*?)\n\);`)
	column := regexp.MustCompile(`(?m)^    ([a-z][a-z0-9_]*) [A-Z]`)
	alterColumn := regexp.MustCompile(`(?m)^ALTER TABLE (\w+) (?:(ADD|DROP) COLUMN (\w+)|(RENAME) COLUMN (\w+) TO (\w+))`)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		raw, err := os.ReadFile("../../db/migrations/" + entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		up := strings.SplitN(string(raw), "-- +goose Down", 2)[0]
		for _, table := range createTable.FindAllStringSubmatch(up, -1) {
			columns := map[string]bool{}
			for _, col := range column.FindAllStringSubmatch(table[2], -1) {
				columns[col[1]] = true
			}
			ddl[table[1]] = columns
		}
		for _, change := range alterColumn.FindAllStringSubmatch(up, -1) {
			if ddl[change[1]] == nil {
				t.Fatalf("column change references unknown table %s", change[1])
			}
			if change[4] == "RENAME" {
				delete(ddl[change[1]], change[5])
				ddl[change[1]][change[6]] = true
			} else if change[2] == "ADD" {
				ddl[change[1]][change[3]] = true
			} else {
				delete(ddl[change[1]], change[3])
			}
		}
	}
	if len(ddl) != len(schema.FinalTables) {
		t.Fatalf("migration tables=%d current inventory=%d", len(ddl), len(schema.FinalTables))
	}
	for name, table := range schema.FinalTables {
		want := map[string]bool{}
		for col := range table.Columns {
			want[col] = true
		}
		if !reflect.DeepEqual(ddl[name], want) {
			t.Errorf("migration columns for %s=%v want=%v", name, ddl[name], want)
		}
	}

	columns := 0
	for _, table := range schema.FinalTables {
		columns += len(table.Columns)
	}
	if len(schema.FinalTables) != 69 || columns != 564 {
		t.Fatalf("current schema inventory has %d tables and %d columns", len(schema.FinalTables), columns)
	}
	if _, present := schema.FinalTables["agent_questions"].Columns["state"]; present {
		t.Fatal("question lifecycle unexpectedly returned to the projection")
	}
	for _, row := range generateQA() {
		table, present := schema.FinalTables[row.Table]
		if !present {
			t.Errorf("%s absent from current schema", row.Table)
			continue
		}
		for col := range row.Row {
			if spec, present := table.Columns[col]; !present {
				t.Errorf("%s.%s absent from current schema", row.Table, col)
			} else if spec.Generated {
				t.Errorf("%s.%s is generated and cannot be inserted", row.Table, col)
			}
		}
		for col, reference := range row.Refs {
			if spec, present := table.Columns[col]; !present {
				t.Errorf("reference %s.%s absent from current schema", row.Table, col)
			} else if spec.Generated {
				t.Errorf("reference %s.%s is generated and cannot be inserted", row.Table, col)
			}
			if _, present := schema.FinalTables[reference.Table].Columns["public_id"]; !present {
				t.Errorf("reference %s has no public UUID", reference.Table)
			}
		}
		for _, col := range row.Conflict {
			if _, present := table.Columns[col]; !present {
				t.Errorf("conflict %s.%s absent from current schema", row.Table, col)
			}
		}
	}
}

func qaQuestion(t *testing.T) (line, line) {
	t.Helper()
	var job, question line
	for _, row := range generateQA() {
		if row.Table == "background_jobs" && row.Row["kind"] == "agent_question" {
			job = row
		}
		if row.Table == "agent_questions" {
			question = row
		}
	}
	if job.Table == "" || question.Table == "" {
		t.Fatal("missing QA question/job")
	}
	return job, question
}

func qaJSON(t *testing.T, value any) []byte {
	t.Helper()
	b, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func qaRequest(handler http.Handler, method, path string, body []byte) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, bytes.NewReader(body))
	r.Header.Set("X-Ingest-Secret", "qa-test-secret")
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func assertQAResult(t *testing.T, w *httptest.ResponseRecorder, expected any) {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("poll status=%d body=%s", w.Code, w.Body)
	}
	var got, want any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(qaJSON(t, expected), &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("poll=%s want=%s", w.Body, qaJSON(t, expected))
	}
}

func TestQAQuestionUsesCurrentAdapters(t *testing.T) {
	t.Setenv("AGENT_INLINE_COMPLETE", "")
	job, question := qaQuestion(t)
	id := job.Row["public_id"].(string)
	if id != "00000018-0000-4000-8000-000000000007" || question.Refs["job_id"].PublicID != id {
		t.Fatal("question must use seventh dedicated job")
	}
	for _, row := range generateQA() {
		if row.Table == "background_jobs" && row.Row["kind"] == "quest_discord_delivery" {
			keys := []string{"qa-discord-done", "qa-repair", "qa-dead", "qa-cancelled", "qa-future", "qa-later"}
			for i, key := range keys {
				if row.Row["job_key"] == key && row.Row["public_id"] != fmt.Sprintf("00000018-0000-4000-8000-%012x", i+1) {
					t.Fatalf("delivery ID changed: %s", key)
				}
			}
		}
	}
	if job.Row["job_key"] != "agent:"+id {
		t.Fatal("seeded job key differs from current question submission")
	}
	if job.Row["lane"] != "agent" || job.Row["state"] != "succeeded" || job.Row["completion_operation"] != "succeed" || job.Row["attempts"] != 1 || job.Row["lease_token"] != 1 {
		t.Fatalf("invalid terminal job: %+v", job.Row)
	}
	if !reflect.DeepEqual(job.Row["completion_payload"], question.Row["result"]) {
		t.Fatal("terminal receipt differs from question projection")
	}
	created, _ := time.Parse(time.RFC3339, job.Row["created_at"].(string))
	updated, _ := time.Parse(time.RFC3339, job.Row["updated_at"].(string))
	deadline, _ := time.Parse(time.RFC3339, job.Row["question_deadline_at"].(string))
	if !created.Before(updated) || !updated.Before(deadline) {
		t.Fatal("completion must precede question deadline")
	}
	mux := http.NewServeMux()
	agent.New("qa-test-secret", nil).Routes(mux)
	base := "/v1/agent/questions"
	if w := qaRequest(mux, "POST", base, qaJSON(t, job.Row["payload"])); w.Code != 202 {
		t.Fatalf("submit status=%d body=%s", w.Code, w.Body)
	}
	w := qaRequest(mux, "POST", base+"/claim", []byte(`{"lease_protocol":1}`))
	var claimed agent.ClaimedQuestion
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &claimed) != nil || claimed.JobID != id {
		t.Fatalf("claim status=%d body=%s", w.Code, w.Body)
	}
	var expected agent.QuestionRequested
	if err := json.Unmarshal(qaJSON(t, job.Row["payload"]), &expected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(claimed.QuestionRequested, expected) {
		t.Fatalf("claim request=%+v want=%+v", claimed.QuestionRequested, expected)
	}
	var completion map[string]any
	if err := json.Unmarshal(qaJSON(t, question.Row["result"]), &completion); err != nil {
		t.Fatal(err)
	}
	completion["lease_token"] = claimed.Lease.Token
	if w := qaRequest(mux, "POST", fmt.Sprintf("%s/%s/complete", base, id), qaJSON(t, completion)); w.Code != 204 {
		t.Fatalf("complete status=%d body=%s", w.Code, w.Body)
	}
	assertQAResult(t, qaRequest(mux, "GET", base+"/"+id, nil), question.Row["result"])
}
