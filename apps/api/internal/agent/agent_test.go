package agent_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
)

func TestSubmitClaimCompleteGet(t *testing.T) {
	t.Setenv("AGENT_INLINE_COMPLETE", "0")
	svc := agent.New("secret", nil)
	mux := http.NewServeMux()
	svc.Routes(mux)

	jobID := "11111111-1111-4111-8111-111111111111"
	body := `{"version":1,"type":"question.requested","job_id":"` + jobID + `","question":"hi"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(body))
	req.Header.Set("X-Ingest-Secret", "secret")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("submit status=%d", rec.Code)
	}

	claim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claim.Header.Set("X-Ingest-Secret", "secret")
	recClaim := httptest.NewRecorder()
	mux.ServeHTTP(recClaim, claim)
	if recClaim.Code != http.StatusOK {
		t.Fatalf("claim status=%d", recClaim.Code)
	}
	var claimed agent.ClaimedQuestion
	if err := json.NewDecoder(recClaim.Body).Decode(&claimed); err != nil {
		t.Fatal(err)
	}
	if claimed.JobID != jobID || claimed.Question != "hi" {
		t.Fatalf("claimed=%+v", claimed)
	}

	completeBody := `{"version":1,"type":"question.completed","job_id":"` + jobID + `","lease_token":"` + claimed.Lease.Token + `","answer":"ok","sources":[]}`
	complete := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+jobID+"/complete", strings.NewReader(completeBody))
	complete.Header.Set("X-Ingest-Secret", "secret")
	recComplete := httptest.NewRecorder()
	mux.ServeHTTP(recComplete, complete)
	if recComplete.Code != http.StatusNoContent {
		t.Fatalf("complete status=%d", recComplete.Code)
	}

	get := httptest.NewRequest(http.MethodGet, "/v1/agent/questions/"+jobID, nil)
	get.Header.Set("X-Ingest-Secret", "secret")
	recGet := httptest.NewRecorder()
	mux.ServeHTTP(recGet, get)
	if recGet.Code != http.StatusOK {
		t.Fatalf("get status=%d want 200", recGet.Code)
	}
	var result agent.QuestionResult
	if err := json.NewDecoder(recGet.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.Type != "question.completed" || result.Answer != "ok" {
		t.Fatalf("result=%+v", result)
	}
}

func TestRoutesRejectMissingOrWrongSecret(t *testing.T) {
	for _, tc := range []struct {
		name, configured, header string
		status                   int
		code                     string
	}{
		{name: "missing", configured: "secret", status: http.StatusUnauthorized, code: "UNAUTHENTICATED"},
		{name: "wrong", configured: "secret", header: "secreT", status: http.StatusUnauthorized, code: "UNAUTHENTICATED"},
		{name: "unconfigured", header: "secret", status: http.StatusForbidden, code: "FORBIDDEN"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			agent.New(tc.configured, nil).Routes(mux)
			claim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
			if tc.header != "" {
				claim.Header.Set("X-Ingest-Secret", tc.header)
			}
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, claim)
			var problem struct {
				Code string `json:"code"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil || rec.Code != tc.status || problem.Code != tc.code {
				t.Fatalf("status=%d body=%s err=%v", rec.Code, rec.Body.String(), err)
			}
		})
	}
}

func TestClaimEmptyReturns204(t *testing.T) {
	svc := agent.New("secret", nil)
	mux := http.NewServeMux()
	svc.Routes(mux)
	claim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claim.Header.Set("X-Ingest-Secret", "secret")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, claim)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status=%d", rec.Code)
	}
}

func TestFailedCompleteReturnsOnGet(t *testing.T) {
	svc := agent.New("secret", nil)
	mux := http.NewServeMux()
	svc.Routes(mux)
	jobID := "22222222-2222-4222-8222-222222222222"
	body := `{"version":1,"type":"question.requested","job_id":"` + jobID + `","question":"x"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(body))
	req.Header.Set("X-Ingest-Secret", "secret")
	mux.ServeHTTP(httptest.NewRecorder(), req)

	claim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claim.Header.Set("X-Ingest-Secret", "secret")
	claimedRec := httptest.NewRecorder()
	mux.ServeHTTP(claimedRec, claim)
	var claimed agent.ClaimedQuestion
	if err := json.Unmarshal(claimedRec.Body.Bytes(), &claimed); err != nil {
		t.Fatal(err)
	}
	failBody := `{"version":1,"type":"question.failed","job_id":"` + jobID + `","lease_token":"` + claimed.Lease.Token + `","message":"I couldn't finish this request. Please try again."}`
	complete := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+jobID+"/complete", strings.NewReader(failBody))
	complete.Header.Set("X-Ingest-Secret", "secret")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, complete)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("complete status=%d", rec.Code)
	}

	get := httptest.NewRequest(http.MethodGet, "/v1/agent/questions/"+jobID, nil)
	get.Header.Set("X-Ingest-Secret", "secret")
	recGet := httptest.NewRecorder()
	mux.ServeHTTP(recGet, get)
	if recGet.Code != http.StatusOK {
		t.Fatalf("get status=%d", recGet.Code)
	}
	var result agent.QuestionResult
	if err := json.NewDecoder(recGet.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.Type != "question.failed" || result.Message == "" {
		t.Fatalf("result=%+v", result)
	}
}
