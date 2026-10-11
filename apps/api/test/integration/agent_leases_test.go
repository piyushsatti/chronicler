//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func TestAgentLeaseAtomicSubmitFailureAndDeadline(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := agent.NewPostgresStore(pool.Pool)
	queue := jobs.NewPostgresStore(pool.Pool)
	id := uuid.NewString()
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM agent_questions WHERE job_id=(SELECT id FROM background_jobs WHERE public_id=$1)`, id)
		pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE public_id=$1`, id)
	})
	q := agent.QuestionRequested{Version: 1, Type: "question.requested", JobID: id, Question: "test"}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- s.Create(ctx, q) }()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	var count int
	if e := pool.QueryRow(ctx, `SELECT count(*) FROM background_jobs b JOIN agent_questions a ON a.job_id=b.id WHERE b.public_id=$1`, id).Scan(&count); e != nil || count != 1 {
		t.Fatal(count, e)
	}
	changed := q
	changed.Question = "changed"
	if e := s.Create(ctx, changed); !errors.Is(e, jobs.ErrLease) {
		t.Fatal(e)
	}
	c, ok, e := s.Claim(ctx)
	if e != nil || !ok || c.JobID != id {
		t.Fatal(c, ok, e)
	}
	if c.Lease.AttemptDeadlineAt != c.QuestionDeadlineAt {
		t.Fatal(c)
	}
	failure := agent.QuestionCompletion{QuestionResult: agent.QuestionResult{Version: 1, Type: "question.failed", JobID: id, Message: "Please try again."}, LeaseToken: c.Lease.Token}
	if e := s.Complete(ctx, failure); e != nil {
		t.Fatal(e)
	}
	var state string
	var result []byte
	if e := pool.QueryRow(ctx, `SELECT b.state,a.result FROM background_jobs b JOIN agent_questions a ON a.job_id=b.id WHERE b.public_id=$1`, id).Scan(&state, &result); e != nil {
		t.Fatal(e)
	}
	var out agent.QuestionResult
	if e := json.Unmarshal(result, &out); e != nil || state != "dead" || out.Type != "question.failed" {
		t.Fatal(state, out, e)
	}
	if e := s.Complete(ctx, failure); e != nil {
		t.Fatal("exact failed replay", e)
	}
	// A separate queued question must expire even if no Python worker claims it.
	deadlineID := uuid.NewString()
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM agent_questions WHERE job_id=(SELECT id FROM background_jobs WHERE public_id=$1)`, deadlineID)
		pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE public_id=$1`, deadlineID)
	})
	q.JobID = deadlineID
	if e := s.Create(ctx, q); e != nil {
		t.Fatal(e)
	}
	if _, e := pool.Exec(ctx, `UPDATE background_jobs SET question_deadline_at=clock_timestamp()-interval '1 second' WHERE public_id=$1`, deadlineID); e != nil {
		t.Fatal(e)
	}
	n, e := queue.SweepQuestions(ctx, 32)
	if e != nil || n < 1 {
		t.Fatal(n, e)
	}
	status, raw, found, e := s.Get(ctx, deadlineID)
	if e != nil || !found || status != "failed" {
		t.Fatal(status, found, e)
	}
	json.Unmarshal(raw, &out)
	if out.Type != "question.failed" || out.Message == "" {
		t.Fatal(out)
	}
	if _, ok, e := s.Claim(ctx); e != nil || ok {
		t.Fatal("expired work claimed", ok, e)
	}
}

func TestAgentLeaseProjectionFailureRollsBackTerminalState(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := agent.NewPostgresStore(pool.Pool)
	id := uuid.NewString()
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM agent_questions WHERE job_id=(SELECT id FROM background_jobs WHERE public_id=$1)`, id)
		pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE public_id=$1`, id)
	})
	if e := s.Create(ctx, agent.QuestionRequested{Version: 1, Type: "question.requested", JobID: id, Question: "test"}); e != nil {
		t.Fatal(e)
	}
	c, ok, e := s.Claim(ctx)
	if e != nil || !ok || c.JobID != id {
		t.Fatal(c, ok, e)
	}
	// Deliberately corrupt only this disposable fixture projection. The backing
	// state must not commit if its result projection updates zero rows.
	if _, e := pool.Exec(ctx, `DELETE FROM agent_questions WHERE job_id=(SELECT id FROM background_jobs WHERE public_id=$1)`, id); e != nil {
		t.Fatal(e)
	}
	var internal string
	pool.QueryRow(ctx, `SELECT id::text FROM background_jobs WHERE public_id=$1`, id).Scan(&internal)
	queue := jobs.NewPostgresStore(pool.Pool)
	e = queue.Complete(ctx, jobs.Receipt{ID: internal, Token: c.Lease.Token}, "succeed", jobs.Succeeded, []byte(`{"version":1,"type":"question.completed","answer":"ok"}`), 0, "")
	if e == nil {
		t.Fatal("missing projection accepted")
	}
	var state string
	var payload []byte
	if e := pool.QueryRow(ctx, `SELECT state,completion_payload FROM background_jobs WHERE public_id=$1`, id).Scan(&state, &payload); e != nil {
		t.Fatal(e)
	}
	if state != "running" || len(payload) != 0 {
		t.Fatal("partial terminal commit", state, string(payload))
	}
}

func TestAgentLeaseNumericResultReplayMatchesJSONB(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := agent.NewPostgresStore(pool.Pool)
	id := uuid.NewString()
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM agent_questions WHERE job_id=(SELECT id FROM background_jobs WHERE public_id=$1)`, id)
		pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE public_id=$1`, id)
	})
	if e := s.Create(ctx, agent.QuestionRequested{Version: 1, Type: "question.requested", JobID: id, Question: "numeric replay"}); e != nil {
		t.Fatal(e)
	}
	claim, ok, e := s.Claim(ctx)
	if e != nil || !ok || claim.JobID != id {
		t.Fatal(claim, ok, e)
	}
	mux := http.NewServeMux()
	agent.New("test", s).Routes(mux)
	send := func(body string, want int) {
		t.Helper()
		r := httptest.NewRequest("POST", "/v1/agent/questions/"+id+"/complete", strings.NewReader(body))
		r.Header.Set("X-Ingest-Secret", "test")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("complete %d want%d: %s", w.Code, want, w.Body.String())
		}
	}
	body := `{"version":1,"type":"question.completed","job_id":"` + id + `","lease_token":"` + claim.Lease.Token + `","answer":"ok","sources":[{"n":1e-5,"large":9007199254740993.0}],"diagnostics":{"n":1e3,"zero":-0.0}}`
	send(body, 204)
	var beforeJob, beforeResult, afterJob, afterResult time.Time
	read := func(job, result *time.Time) {
		t.Helper()
		if e := pool.QueryRow(ctx, `SELECT b.updated_at,a.updated_at FROM background_jobs b JOIN agent_questions a ON a.job_id=b.id WHERE b.public_id=$1`, id).Scan(job, result); e != nil {
			t.Fatal(e)
		}
	}
	read(&beforeJob, &beforeResult)
	send(body, 204) // Same frozen request after JSONB changed numeric spellings.
	equivalent := strings.NewReplacer("1e-5", "0.00001", "1e3", "1000", "-0.0", "0", "9007199254740993.0", "9007199254740993").Replace(body)
	send(equivalent, 204)
	send(strings.Replace(body, "9007199254740993.0", "9007199254740992.0", 1), 409)
	send(strings.Replace(body, `"answer":"ok"`, `"answer":"changed"`, 1), 409)
	read(&afterJob, &afterResult)
	if beforeJob != afterJob || beforeResult != afterResult {
		t.Fatal("replay/conflict rewrote immutable terminal timestamps")
	}
}

func TestAgentLeaseOperatorCancellationWithoutWorkerReceipt(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := agent.NewPostgresStore(pool.Pool)
	queue := jobs.NewPostgresStore(pool.Pool)
	for _, mode := range []string{"queued_token_zero", "released_retry", "running_completion_race"} {
		t.Run(mode, func(t *testing.T) {
			id := uuid.NewString()
			t.Cleanup(func() {
				pool.Exec(context.Background(), `DELETE FROM agent_questions WHERE job_id=(SELECT id FROM background_jobs WHERE public_id=$1)`, id)
				pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE public_id=$1`, id)
			})
			if e := s.Create(ctx, agent.QuestionRequested{Version: 1, Type: "question.requested", JobID: id, Question: "cancel"}); e != nil {
				t.Fatal(e)
			}
			var claim agent.ClaimedQuestion
			if mode != "queued_token_zero" {
				var ok bool
				var e error
				claim, ok, e = s.Claim(ctx)
				if e != nil || !ok || claim.JobID != id {
					t.Fatal(claim, ok, e)
				}
			}
			completion := agent.QuestionCompletion{QuestionResult: agent.QuestionResult{Version: 1, Type: "question.completed", JobID: id, Answer: "ok"}, LeaseToken: claim.Lease.Token}
			if mode == "released_retry" {
				if e := s.Retry(ctx, id, claim.Lease.Token, "transient_error"); e != nil {
					t.Fatal(e)
				}
			}
			if mode == "running_completion_race" {
				start := make(chan struct{})
				result := make(chan error, 2)
				go func() { <-start; result <- queue.CancelByID(ctx, id) }()
				go func() { <-start; result <- s.Complete(ctx, completion) }()
				close(start)
				a, b := <-result, <-result
				if !((a == nil && errors.Is(b, jobs.ErrLease)) || (b == nil && errors.Is(a, jobs.ErrLease))) {
					t.Fatal(a, b)
				}
			} else {
				if e := queue.CancelByID(ctx, id); e != nil {
					t.Fatal(e)
				}
			}
			var state string
			var token int64
			var raw []byte
			if e := pool.QueryRow(ctx, `SELECT b.state,b.lease_token,a.result FROM background_jobs b JOIN agent_questions a ON a.job_id=b.id WHERE b.public_id=$1`, id).Scan(&state, &token, &raw); e != nil {
				t.Fatal(e)
			}
			var out agent.QuestionResult
			if e := json.Unmarshal(raw, &out); e != nil {
				t.Fatal(e)
			}
			if state == "cancelled" {
				if out.Type != "question.failed" || out.Message == "" {
					t.Fatal(out)
				}
			} else if mode != "running_completion_race" || state != "succeeded" || out.Type != "question.completed" {
				t.Fatal(state, out)
			}
			if mode == "queued_token_zero" && token != 0 {
				t.Fatal("operator cancellation fabricated lease", token)
			}
			if mode == "released_retry" {
				if e := s.Complete(ctx, completion); !errors.Is(e, jobs.ErrLease) {
					t.Fatal("released worker overwrote cancellation", e)
				}
			}
			if e := queue.CancelByID(ctx, id); !errors.Is(e, jobs.ErrLease) {
				t.Fatal("terminal row was mutable", e)
			}
		})
	}
}

func TestAgentLeaseJSONBNumericStorageAdmission(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	s := agent.NewPostgresStore(pool.Pool)
	mux := http.NewServeMux()
	agent.New("test", s).Routes(mux)
	for _, tc := range []struct {
		name, number, field string
		valid               bool
	}{
		{"python_large_integer_diagnostics", "1" + strings.Repeat("0", 309), "diagnostics", true},
		{"python_large_integer_sources", "1" + strings.Repeat("0", 309), "sources", true},
		{"maximum_integer_digits", "1e131071", "sources", true},
		{"integer_overflow", "1e131072", "sources", false},
		{"maximum_scale", "1e-16383", "sources", true},
		{"scale_overflow", "1e-16384", "sources", false},
		{"zero_large_exponent", "0e1000000", "sources", true},
		{"zero_maximum_exponent", "0e1073741823", "sources", true},
		{"zero_exponent_overflow", "0e1073741824", "sources", false},
		{"zero_huge_exponent", "0e999999999999999999999", "sources", false},
		{"negative_zero", "-0.0", "sources", true},
		{"zero_maximum_scale", "0e-16383", "sources", true},
		{"zero_scale_overflow", "0e-16384", "sources", false},
		{"trailing_zero_maximum_scale", "1." + strings.Repeat("0", 16383), "sources", true},
		{"trailing_zero_scale_overflow", "1." + strings.Repeat("0", 16384), "sources", false},
		{"large_positive_exponent", "1e999999999999999999999999", "sources", false},
		{"large_negative_exponent", "1e-999999999999999999999999", "sources", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// This scalar uses only a synthetic literal; it proves the storage boundary
			// independently of the application validator without expanding it client-side.
			var kind string
			nativeErr := pool.QueryRow(ctx, `SELECT jsonb_typeof($1::jsonb)`, tc.number).Scan(&kind)
			if (nativeErr == nil) != tc.valid {
				t.Fatalf("PostgreSQL boundary differs: valid=%v error=%v", tc.valid, nativeErr)
			}
			id := uuid.NewString()
			t.Cleanup(func() {
				pool.Exec(context.Background(), `DELETE FROM agent_questions WHERE job_id=(SELECT id FROM background_jobs WHERE public_id=$1)`, id)
				pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE public_id=$1`, id)
			})
			if e := s.Create(ctx, agent.QuestionRequested{Version: 1, Type: "question.requested", JobID: id, Question: "numeric storage admission"}); e != nil {
				t.Fatal(e)
			}
			claim, ok, e := s.Claim(ctx)
			if e != nil || !ok || claim.JobID != id {
				t.Fatal(claim, ok, e)
			}
			metadata := `{"nested":{"n":` + tc.number + `}}`
			if tc.field == "sources" {
				metadata = "[" + metadata + "]"
			}
			body := `{"version":1,"type":"question.completed","job_id":"` + id + `","lease_token":"` + claim.Lease.Token + `","answer":"ok","` + tc.field + `":` + metadata + `}`
			send := func(want int) {
				t.Helper()
				r := httptest.NewRequest("POST", "/v1/agent/questions/"+id+"/complete", strings.NewReader(body))
				r.Header.Set("X-Ingest-Secret", "test")
				w := httptest.NewRecorder()
				mux.ServeHTTP(w, r)
				if w.Code != want {
					t.Fatalf("status=%d want%d body=%s", w.Code, want, w.Body.String())
				}
			}
			if !tc.valid {
				send(422)
				var state string
				if e := pool.QueryRow(ctx, `SELECT state FROM background_jobs WHERE public_id=$1`, id).Scan(&state); e != nil || state != "running" {
					t.Fatal("invalid completion changed state", state, e)
				}
				return
			}
			send(204)
			var beforeJob, beforeResult, afterJob, afterResult time.Time
			read := func(a, b *time.Time) {
				t.Helper()
				if e := pool.QueryRow(ctx, `SELECT b.updated_at,a.updated_at FROM background_jobs b JOIN agent_questions a ON a.job_id=b.id WHERE b.public_id=$1`, id).Scan(a, b); e != nil {
					t.Fatal(e)
				}
			}
			read(&beforeJob, &beforeResult)
			send(204)
			read(&afterJob, &afterResult)
			if beforeJob != afterJob || beforeResult != afterResult {
				t.Fatal("numeric replay wrote terminal rows")
			}
			var equal bool
			path := []string{"diagnostics", "nested", "n"}
			if tc.field == "sources" {
				path = []string{"sources", "0", "nested", "n"}
			}
			if e := pool.QueryRow(ctx, `SELECT completion_payload #> $2::text[] = $3::jsonb FROM background_jobs WHERE public_id=$1`, id, path, tc.number).Scan(&equal); e != nil || !equal {
				t.Fatal("numeric value changed", equal, e)
			}
		})
	}
}
