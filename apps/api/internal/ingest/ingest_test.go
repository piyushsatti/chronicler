package ingest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
}

func TestDiscordEventRejectsUnknownKind(t *testing.T) {
	store := &MemoryStore{}
	h := New("secret", store)
	mux := http.NewServeMux()
	h.Routes(mux)

	req := httptest.NewRequest(http.MethodPost, "/v1/ingest/discord-event", strings.NewReader(`{
		"event_id":"e1","kind":"announce","discord_user_id":"u1","channel_id":"c1",
		"occurred_at":"2026-10-09T12:00:00Z","amount":1
	}`))
	req.Header.Set("X-Ingest-Secret", "secret")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d body=%s", rr.Code, rr.Body.String())
	}
	if len(store.Events) != 0 {
		t.Fatalf("events = %+v", store.Events)
	}
}

func TestHeartbeatRequiresSecretAndAcceptsBotShape(t *testing.T) {
	store := &MemoryStore{}
	h := New("secret", store)
	mux := http.NewServeMux()
	h.Routes(mux)

	// Shape matches apps/discord HeartbeatStatus / OpenAPI Heartbeat.
	body := `{
		"gateway_ready":true,
		"shard_state":{"0":"ready"},
		"host":"join-fixture",
		"build_sha":"test"
	}`

	req := httptest.NewRequest(http.MethodPost, "/v1/ingest/heartbeat", strings.NewReader(body))
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
	if len(store.Heartbeats) != 1 {
		t.Fatalf("heartbeats = %d", len(store.Heartbeats))
	}
	if !json.Valid(store.Heartbeats[0]) {
		t.Fatalf("heartbeat payload not JSON: %s", store.Heartbeats[0])
	}
}

func TestRoutesRegisterBothIngestPaths(t *testing.T) {
	h := New("secret", &MemoryStore{})
	mux := http.NewServeMux()
	h.Routes(mux)

	for _, path := range []string{"/v1/ingest/discord-event", "/v1/ingest/heartbeat"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		// Unauthenticated must hit the handler (401), not 404.
		if rr.Code == http.StatusNotFound {
			t.Fatalf("%s not mounted", path)
		}
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("%s status = %d", path, rr.Code)
		}
	}
}
