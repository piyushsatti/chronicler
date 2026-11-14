package httpserver

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestIDGeneratedInHeaderAndLog(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(ContextHandler(slog.NewJSONHandler(&logs, nil))))
	t.Cleanup(func() { slog.SetDefault(previous) })

	h := RequestID(RequestLog(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
	r := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	id := w.Header().Get(requestIDHeader)
	if !validRequestID(id) {
		t.Fatalf("response X-Request-Id=%q", id)
	}
	if got := requestIDFromLog(t, logs.Bytes(), "request"); got != id {
		t.Fatalf("log request_id=%q want=%q logs=%s", got, id, logs.String())
	}
}

func TestRequestIDKeepsValidIncoming(t *testing.T) {
	const want = "client-req-abc_123"
	h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, ok := RequestIDFromContext(r.Context())
		if !ok || got != want {
			t.Fatalf("context id=%q ok=%v", got, ok)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	r := httptest.NewRequest(http.MethodGet, "/health", nil)
	r.Header.Set(requestIDHeader, want)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if got := w.Header().Get(requestIDHeader); got != want {
		t.Fatalf("response X-Request-Id=%q", got)
	}
}

func TestRequestIDReplacesInvalid(t *testing.T) {
	cases := []struct {
		name  string
		value string
	}{
		{name: "oversized", value: strings.Repeat("a", maxRequestIDLen+1)},
		{name: "disallowed_char", value: "bad id"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got, ok := RequestIDFromContext(r.Context())
				if !ok || got == tc.value || !validRequestID(got) {
					t.Fatalf("context id=%q ok=%v", got, ok)
				}
				w.WriteHeader(http.StatusNoContent)
			}))
			r := httptest.NewRequest(http.MethodGet, "/health", nil)
			r.Header.Set(requestIDHeader, tc.value)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			got := w.Header().Get(requestIDHeader)
			if got == tc.value || !validRequestID(got) {
				t.Fatalf("response X-Request-Id=%q", got)
			}
		})
	}
}

func requestIDFromLog(t *testing.T, raw []byte, msg string) string {
	t.Helper()
	for _, line := range bytes.Split(raw, []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		var entry struct {
			Msg       string `json:"msg"`
			RequestID string `json:"request_id"`
		}
		if err := json.Unmarshal(line, &entry); err != nil {
			t.Fatalf("unmarshal %s: %v", line, err)
		}
		if entry.Msg == msg {
			return entry.RequestID
		}
	}
	t.Fatalf("missing %q log in %s", msg, raw)
	return ""
}
