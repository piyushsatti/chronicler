package agent

import (
	"context"
	"encoding/json"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPLeasedLifecycle(t *testing.T) {
	now := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)
	store := newMemoryStore(func() time.Time { return now })
	mux := http.NewServeMux()
	New("test", store, false).Routes(mux)
	send := func(path, body string, want int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest("POST", path, strings.NewReader(body))
		r.Header.Set("X-Ingest-Secret", "test")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s: %d want %d: %s", path, w.Code, want, w.Body.String())
		}
		return w
	}
	base := "/v1/agent/questions"
	id := "11111111-1111-4111-8111-111111111111"
	request := `{"version":1,"type":"question.requested","job_id":"` + id + `","question":"hi"}`
	send(base, request, 202)
	send(base, request, 202)
	send(base, strings.Replace(request, `"hi"`, `"different"`, 1), 409)
	for _, body := range []string{"", `{}`, `{"lease_protocol":0}`, `{"lease_protocol":1,"unknown":true}`, `{"lease_protocol":1} {}`} {
		send(base+"/claim", body, 422)
	}
	var claim ClaimedQuestion
	if err := json.Unmarshal(send(base+"/claim", `{"lease_protocol":1}`, 200).Body.Bytes(), &claim); err != nil {
		t.Fatal(err)
	}
	if claim.Lease.Token != "1" || claim.Lease.Attempt != 1 || claim.Lease.RenewAfterSeconds != 10 || claim.Lease.RemainingBudgetSeconds != 100 || claim.Lease.AttemptDeadlineAt != claim.QuestionDeadlineAt {
		t.Fatalf("%+v", claim)
	}
	now = now.Add(31 * time.Second)
	var next ClaimedQuestion
	if err := json.Unmarshal(send(base+"/claim", `{"lease_protocol":1}`, 200).Body.Bytes(), &next); err != nil {
		t.Fatal(err)
	}
	if next.Lease.Token != "2" || next.Lease.Attempt != 2 || next.QuestionDeadlineAt != claim.QuestionDeadlineAt || next.Lease.RemainingBudgetSeconds != 69 {
		t.Fatal(next)
	}
	send(base+"/"+id+"/renew", `{"lease_token":"1"}`, 409)
	send(base+"/"+id+"/retry", `{"lease_token":"1","reason":"transient_error"}`, 409)
	completion := `{"version":1,"type":"question.completed","job_id":"` + id + `","lease_token":"2","answer":"ok"}`
	send(base+"/"+id+"/complete", strings.Replace(completion, `"lease_token":"2"`, `"lease_token":"1"`, 1), 409)
	send(base+"/"+id+"/complete", strings.Replace(completion, id, "22222222-2222-4222-8222-222222222222", 1), 422)
	send(base+"/"+id+"/complete", strings.Replace(completion, `"answer":"ok"`, `"answer":"ok","surprise":1`, 1), 422)
	send(base+"/"+id+"/complete", completion, 204)
	now = now.Add(time.Hour)
	send(base+"/"+id+"/complete", strings.Replace(completion, `"answer":"ok"`, `"sources":[],"answer":"ok"`, 1), 204)
	send(base+"/"+id+"/complete", strings.Replace(completion, `"answer":"ok"`, `"answer":"changed"`, 1), 409)
	send(base+"/"+id+"/renew", `{"lease_token":"2"}`, 409)
}
func TestRequestAndCompletionBounds(t *testing.T) {
	good := QuestionRequested{Version: 1, Type: "question.requested", JobID: "11111111-1111-4111-8111-111111111111", Question: "hi"}
	for _, h := range []string{`{"messages":[],"incomplete":false,"other":true}`, `{"messages":[],"incomplete":null}`, `{"messages":[{"role":"system","content":"x"}],"incomplete":false}`, `{"messages":[{"role":"user","content":" "}],"incomplete":false}`} {
		q := good
		q.History = json.RawMessage(h)
		if e := validateRequest(&q); e == nil {
			t.Fatal(h)
		}
	}
	q := good
	q.Question = strings.Repeat("a", 601)
	if e := validateRequest(&q); e == nil {
		t.Fatal("question bound")
	}
	for _, answer := range []string{" ", strings.Repeat("a", 16001)} {
		c := QuestionCompletion{QuestionResult: QuestionResult{Version: 1, Type: "question.completed", JobID: good.JobID, Answer: answer}, LeaseToken: "1"}
		if e := validateCompletion(&c, good.JobID); e == nil {
			t.Fatal("answer bound")
		}
	}
}

func TestMaximumEscapedClaimResponseFitsConsumerBound(t *testing.T) {
	// Control bytes and HTML-sensitive ASCII expand to six JSON bytes apiece.
	// Twelve strictly validated messages bound the additional object metadata.
	for _, ch := range []string{"\x00", "<", ">", "&"} {
		messages := make([]map[string]string, 12)
		remaining := 8192
		for i := range messages {
			n := remaining / (12 - i)
			messages[i] = map[string]string{"role": "assistant", "content": "a" + strings.Repeat(ch, n-1)}
			remaining -= n
		}
		history, _ := json.Marshal(map[string]any{"messages": messages, "incomplete": false})
		q := QuestionRequested{Version: 1, Type: "question.requested", JobID: "11111111-1111-4111-8111-111111111111", Question: "a" + strings.Repeat(ch, 599), History: history}
		if e := validateRequest(&q); e != nil {
			t.Fatal(e)
		}
		now := time.Now()
		j := jobs.Job{Kind: "agent_question", State: jobs.Queued, QuestionDeadlineAt: now.Add(jobs.QuestionBudget)}
		if claimed, err := j.Claim(now); err != nil || !claimed {
			t.Fatalf("claim failed: claimed=%v err=%v", claimed, err)
		}
		j.Token = math.MaxInt64
		j.Attempts = jobs.MaxAttempts
		raw, e := json.Marshal(ClaimedQuestion{q, j.Lease(now), j.QuestionDeadlineAt})
		if e != nil || len(raw) > 65536 {
			t.Fatalf("escaped claim bytes=%d err=%v", len(raw), e)
		}
	}
}

func TestHTTPCompletionAcceptsPostgresLargeIntegerMetadata(t *testing.T) {
	for _, field := range []string{"diagnostics", "sources"} {
		t.Run(field, func(t *testing.T) {
			store := newMemoryStore(time.Now)
			mux := http.NewServeMux()
			New("test", store, false).Routes(mux)
			id := "11111111-1111-4111-8111-111111111111"
			if e := store.Create(context.Background(), QuestionRequested{Version: 1, Type: "question.requested", JobID: id, Question: "large integer"}); e != nil {
				t.Fatal(e)
			}
			claim, ok, e := store.Claim(context.Background())
			if e != nil || !ok {
				t.Fatal(ok, e)
			}
			value := `{"nested":{"n":1` + strings.Repeat("0", 309) + `}}`
			if field == "sources" {
				value = "[" + value + "]"
			}
			body := `{"version":1,"type":"question.completed","job_id":"` + id + `","lease_token":"` + claim.Lease.Token + `","answer":"ok","` + field + `":` + value + `}`
			r := httptest.NewRequest("POST", "/v1/agent/questions/"+id+"/complete", strings.NewReader(body))
			r.Header.Set("X-Ingest-Secret", "test")
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			if w.Code != 204 {
				t.Fatalf("%s: status=%d bytes=%d body=%s", field, w.Code, len(body), w.Body.String())
			}
		})
	}
}

func TestJSONBNumericStorageAdmission(t *testing.T) {
	for _, tc := range []struct {
		number string
		valid  bool
	}{
		{"1" + strings.Repeat("0", 309), true}, {"1e309", true},
		{"9007199254740993", true}, {"9007199254740993.0", true},
		{"1e131071", true}, {"1e131072", false},
		{"1e-16383", true}, {"1e-16384", false},
		{"0e1000000", true}, {"0e1073741823", true}, {"0e1073741824", false}, {"0e999999999999999999999", false},
		{"-0.0", true}, {"0e-16383", true}, {"0e-16384", false},
		{"1." + strings.Repeat("0", 16383), true}, {"1." + strings.Repeat("0", 16384), false},
		{"1e999999999999999999999999", false}, {"1e-999999999999999999999999", false},
	} {
		t.Run(tc.number[:min(len(tc.number), 40)], func(t *testing.T) {
			if got := validJSONBNumber(json.Number(tc.number)); got != tc.valid {
				t.Fatalf("admission=%v want%v", got, tc.valid)
			}
		})
	}
	for _, field := range []string{"diagnostics", "sources"} {
		payload := `{"nested":{"n":1e131072}}`
		if field == "sources" {
			payload = "[" + payload + "]"
		}
		c := QuestionCompletion{QuestionResult: QuestionResult{Version: 1, Type: "question.completed", JobID: "11111111-1111-4111-8111-111111111111", Answer: "ok"}, LeaseToken: "1"}
		if field == "sources" {
			c.Sources = json.RawMessage(payload)
		} else {
			c.Diagnostics = json.RawMessage(payload)
		}
		if e := validateCompletion(&c, c.JobID); e == nil {
			t.Fatal("nested out-of-range number accepted", field)
		}
	}
}
