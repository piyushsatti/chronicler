package agent_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
)

const (
	botSecret    = "bot-secret"
	workerSecret = "worker-secret"
)

func TestSubmitClaimCompleteGet(t *testing.T) {
	svc := agent.New(botSecret, workerSecret, nil, false)
	mux := http.NewServeMux()
	svc.Routes(mux)

	jobID := "11111111-1111-4111-8111-111111111111"
	body := `{"version":1,"type":"question.requested","job_id":"` + jobID + `","question":"hi"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(body))
	req.Header.Set("X-Ingest-Secret", botSecret)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("submit status=%d", rec.Code)
	}

	claim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claim.Header.Set("X-Ingest-Secret", workerSecret)
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
	complete.Header.Set("X-Ingest-Secret", workerSecret)
	recComplete := httptest.NewRecorder()
	mux.ServeHTTP(recComplete, complete)
	if recComplete.Code != http.StatusNoContent {
		t.Fatalf("complete status=%d", recComplete.Code)
	}

	get := httptest.NewRequest(http.MethodGet, "/v1/agent/questions/"+jobID, nil)
	get.Header.Set("X-Ingest-Secret", botSecret)
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

func TestRoutesSeparateBotAndWorkerSecrets(t *testing.T) {
	svc := agent.New(botSecret, workerSecret, nil, false)
	mux := http.NewServeMux()
	svc.Routes(mux)

	jobID := "33333333-3333-4333-8333-333333333333"
	submitBody := `{"version":1,"type":"question.requested","job_id":"` + jobID + `","question":"hi"}`

	submitWrong := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(submitBody))
	submitWrong.Header.Set("X-Ingest-Secret", workerSecret)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, submitWrong)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("submit with worker secret: status=%d", rec.Code)
	}

	submitOK := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(submitBody))
	submitOK.Header.Set("X-Ingest-Secret", botSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, submitOK)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("submit with bot secret: status=%d", rec.Code)
	}

	getWrong := httptest.NewRequest(http.MethodGet, "/v1/agent/questions/"+jobID, nil)
	getWrong.Header.Set("X-Ingest-Secret", workerSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, getWrong)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("get with worker secret: status=%d", rec.Code)
	}

	getOK := httptest.NewRequest(http.MethodGet, "/v1/agent/questions/"+jobID, nil)
	getOK.Header.Set("X-Ingest-Secret", botSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, getOK)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("get with bot secret: status=%d", rec.Code)
	}

	claimWrong := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claimWrong.Header.Set("X-Ingest-Secret", botSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, claimWrong)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("claim with bot secret: status=%d", rec.Code)
	}

	claimOK := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claimOK.Header.Set("X-Ingest-Secret", workerSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, claimOK)
	if rec.Code != http.StatusOK {
		t.Fatalf("claim with worker secret: status=%d", rec.Code)
	}
	var claimed agent.ClaimedQuestion
	if err := json.NewDecoder(rec.Body).Decode(&claimed); err != nil {
		t.Fatal(err)
	}

	renewBody := `{"lease_token":"` + claimed.Lease.Token + `"}`
	renewWrong := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+claimed.JobID+"/renew", strings.NewReader(renewBody))
	renewWrong.Header.Set("X-Ingest-Secret", botSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, renewWrong)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("renew with bot secret: status=%d", rec.Code)
	}
	renewOK := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+claimed.JobID+"/renew", strings.NewReader(renewBody))
	renewOK.Header.Set("X-Ingest-Secret", workerSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, renewOK)
	if rec.Code != http.StatusOK {
		t.Fatalf("renew with worker secret: status=%d body=%s", rec.Code, rec.Body.String())
	}

	completeBody := `{"version":1,"type":"question.completed","job_id":"` + claimed.JobID + `","lease_token":"` + claimed.Lease.Token + `","answer":"ok","sources":[]}`
	completeWrong := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+claimed.JobID+"/complete", strings.NewReader(completeBody))
	completeWrong.Header.Set("X-Ingest-Secret", botSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, completeWrong)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("complete with bot secret: status=%d", rec.Code)
	}
	completeOK := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+claimed.JobID+"/complete", strings.NewReader(completeBody))
	completeOK.Header.Set("X-Ingest-Secret", workerSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, completeOK)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("complete with worker secret: status=%d body=%s", rec.Code, rec.Body.String())
	}

	retryID := "66666666-6666-4666-8666-666666666666"
	retrySubmit := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(
		`{"version":1,"type":"question.requested","job_id":"`+retryID+`","question":"retry"}`))
	retrySubmit.Header.Set("X-Ingest-Secret", botSecret)
	mux.ServeHTTP(httptest.NewRecorder(), retrySubmit)
	retryClaim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	retryClaim.Header.Set("X-Ingest-Secret", workerSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, retryClaim)
	if err := json.NewDecoder(rec.Body).Decode(&claimed); err != nil {
		t.Fatal(err)
	}
	retryBody := `{"lease_token":"` + claimed.Lease.Token + `","reason":"transient_error"}`
	retryWrong := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+claimed.JobID+"/retry", strings.NewReader(retryBody))
	retryWrong.Header.Set("X-Ingest-Secret", botSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, retryWrong)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("retry with bot secret: status=%d", rec.Code)
	}
	retryOK := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+claimed.JobID+"/retry", strings.NewReader(retryBody))
	retryOK.Header.Set("X-Ingest-Secret", workerSecret)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, retryOK)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("retry with worker secret: status=%d body=%s", rec.Code, rec.Body.String())
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
			agent.New("bot", tc.configured, nil, false).Routes(mux)
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
	svc := agent.New(botSecret, workerSecret, nil, false)
	mux := http.NewServeMux()
	svc.Routes(mux)
	claim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claim.Header.Set("X-Ingest-Secret", workerSecret)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, claim)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status=%d", rec.Code)
	}
}

func TestFailedCompleteReturnsOnGet(t *testing.T) {
	svc := agent.New(botSecret, workerSecret, nil, false)
	mux := http.NewServeMux()
	svc.Routes(mux)
	jobID := "22222222-2222-4222-8222-222222222222"
	body := `{"version":1,"type":"question.requested","job_id":"` + jobID + `","question":"x"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(body))
	req.Header.Set("X-Ingest-Secret", botSecret)
	mux.ServeHTTP(httptest.NewRecorder(), req)

	claim := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/claim", strings.NewReader(`{"lease_protocol":1}`))
	claim.Header.Set("X-Ingest-Secret", workerSecret)
	claimedRec := httptest.NewRecorder()
	mux.ServeHTTP(claimedRec, claim)
	var claimed agent.ClaimedQuestion
	if err := json.Unmarshal(claimedRec.Body.Bytes(), &claimed); err != nil {
		t.Fatal(err)
	}
	failBody := `{"version":1,"type":"question.failed","job_id":"` + jobID + `","lease_token":"` + claimed.Lease.Token + `","message":"I couldn't finish this request. Please try again."}`
	complete := httptest.NewRequest(http.MethodPost, "/v1/agent/questions/"+jobID+"/complete", strings.NewReader(failBody))
	complete.Header.Set("X-Ingest-Secret", workerSecret)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, complete)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("complete status=%d", rec.Code)
	}

	get := httptest.NewRequest(http.MethodGet, "/v1/agent/questions/"+jobID, nil)
	get.Header.Set("X-Ingest-Secret", botSecret)
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
