package agent_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
)

func TestSubmitReturns202WithoutInlineComplete(t *testing.T) {
	t.Setenv("AGENT_INLINE_COMPLETE", "0")
	svc := agent.New("secret", nil)
	mux := http.NewServeMux()
	svc.Routes(mux)
	body := `{"version":1,"type":"question.requested","job_id":"11111111-1111-4111-8111-111111111111","question":"hi","history":[]}`
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/questions", strings.NewReader(body))
	req.Header.Set("X-Ingest-Secret", "secret")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status=%d", rec.Code)
	}
	get := httptest.NewRequest(http.MethodGet, "/v1/agent/questions/11111111-1111-4111-8111-111111111111", nil)
	get.Header.Set("X-Ingest-Secret", "secret")
	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, get)
	if rec2.Code != http.StatusAccepted {
		t.Fatalf("get status=%d want 202 pending", rec2.Code)
	}
}
