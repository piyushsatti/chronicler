package ingest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func fixedNow() time.Time {
	return time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
}

func newTestHandler(store Store) *Handler {
	h := New("secret", store)
	h.now = fixedNow
	return h
}

func TestDiscordEventRequiresSecret(t *testing.T) {
	store := &MemoryStore{}
	h := newTestHandler(store)
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
	h := newTestHandler(store)
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

func TestDiscordEventValidation(t *testing.T) {
	cases := []struct {
		name string
		body string
		code int
	}{
		{
			name: "missing occurred_at",
			body: `{"event_id":"e1","kind":"message","discord_user_id":"u1","channel_id":"c1","amount":1}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "25 hours old",
			body: `{"event_id":"e1","kind":"message","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-08T11:00:00Z","amount":1}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "6 minutes ahead",
			body: `{"event_id":"e1","kind":"message","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:06:00Z","amount":1}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "voice 0",
			body: `{"event_id":"e1","kind":"voice","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":0}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "voice 1.5",
			body: `{"event_id":"e1","kind":"voice","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":1.5}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "voice 1441",
			body: `{"event_id":"e1","kind":"voice","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":1441}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "voice -100000",
			body: `{"event_id":"e1","kind":"voice","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":-100000}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "reaction 2",
			body: `{"event_id":"e1","kind":"reaction","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":2}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "missing amount",
			body: `{"event_id":"e1","kind":"message","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z"}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "valid message",
			body: `{"event_id":"e1","kind":"message","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":1}`,
			code: http.StatusOK,
		},
		{
			name: "valid reaction",
			body: `{"event_id":"e2","kind":"reaction","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":1}`,
			code: http.StatusOK,
		},
		{
			name: "valid voice",
			body: `{"event_id":"e3","kind":"voice","discord_user_id":"u1","channel_id":"c1","occurred_at":"2026-10-09T12:00:00Z","amount":30}`,
			code: http.StatusOK,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := &MemoryStore{}
			h := newTestHandler(store)
			mux := http.NewServeMux()
			h.Routes(mux)

			req := httptest.NewRequest(http.MethodPost, "/v1/ingest/discord-event", strings.NewReader(tc.body))
			req.Header.Set("X-Ingest-Secret", "secret")
			rr := httptest.NewRecorder()
			mux.ServeHTTP(rr, req)
			if rr.Code != tc.code {
				t.Fatalf("status = %d body=%s", rr.Code, rr.Body.String())
			}
			if tc.code == http.StatusOK {
				if len(store.Events) != 1 {
					t.Fatalf("events = %+v", store.Events)
				}
			} else if len(store.Events) != 0 {
				t.Fatalf("events = %+v", store.Events)
			}
		})
	}
}

func TestHeartbeatRequiresSecretAndAcceptsBotShape(t *testing.T) {
	store := &MemoryStore{}
	h := newTestHandler(store)
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

func TestHeartbeatValidation(t *testing.T) {
	cases := []struct {
		name string
		body string
		code int
	}{
		{name: "bare string", body: `"ready"`, code: http.StatusUnprocessableEntity},
		{
			name: "missing gateway_ready",
			body: `{"shard_state":{},"host":"h","build_sha":"s"}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "gateway_ready string",
			body: `{"gateway_ready":"yes","shard_state":{},"host":"h","build_sha":"s"}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "gateway_ready null",
			body: `{"gateway_ready":null,"shard_state":{},"host":"h","build_sha":"s"}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "host null",
			body: `{"gateway_ready":true,"shard_state":{},"host":null,"build_sha":"s"}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "shard_state null",
			body: `{"gateway_ready":true,"shard_state":null,"host":"h","build_sha":"s"}`,
			code: http.StatusUnprocessableEntity,
		},
		{
			name: "bot body",
			body: `{"gateway_ready":true,"shard_state":{"0":"ready"},"host":"join-fixture","build_sha":"test"}`,
			code: http.StatusOK,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := &MemoryStore{}
			h := newTestHandler(store)
			mux := http.NewServeMux()
			h.Routes(mux)

			req := httptest.NewRequest(http.MethodPost, "/v1/ingest/heartbeat", strings.NewReader(tc.body))
			req.Header.Set("X-Ingest-Secret", "secret")
			rr := httptest.NewRecorder()
			mux.ServeHTTP(rr, req)
			if rr.Code != tc.code {
				t.Fatalf("status = %d body=%s", rr.Code, rr.Body.String())
			}
			if tc.code == http.StatusOK {
				if len(store.Heartbeats) != 1 {
					t.Fatalf("heartbeats = %d", len(store.Heartbeats))
				}
			} else if len(store.Heartbeats) != 0 {
				t.Fatalf("heartbeats = %d", len(store.Heartbeats))
			}
		})
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
