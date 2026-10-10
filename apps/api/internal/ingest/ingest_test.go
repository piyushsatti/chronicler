package ingest

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDiscordEventRequiresSecret(t *testing.T) {
	store := &MemoryStore{}
	h := New("secret", store)
	mux := http.NewServeMux()
	h.Routes(mux)

	req := httptest.NewRequest(http.MethodPost, "/v1/ingest/discord-event", strings.NewReader(`{
		"event_id":"e1","kind":"message","discord_user_id":"u1","channel_id":"c1",
		"occurred_at":"2026-10-09T12:00:00Z","amount":1
	}`))
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", rr.Code)
	}

	req.Header.Set("X-Ingest-Secret", "secret")
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rr.Code, rr.Body.String())
	}
	if len(store.Events) != 1 || store.Events[0].Kind != "message" {
		t.Fatalf("events = %+v", store.Events)
	}
	_ = time.Now()
}
