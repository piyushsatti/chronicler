package apierr_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestWrapErrorsIsCause(t *testing.T) {
	cause := errors.New("database blip")
	err := apierr.Wrap(apierr.Internal, "Internal error", cause)
	if !errors.Is(err, cause) {
		t.Fatalf("errors.Is failed: %v", err)
	}
}

func TestWriteLogsWrappedInternalWithCause(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	cause := errors.New("database blip")
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/v1/notifications", nil)
	apierr.Write(w, r, apierr.Wrap(apierr.Internal, "Internal error", cause))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d", w.Code)
	}
	var body struct {
		Title  string `json:"title"`
		Status int    `json:"status"`
		Code   string `json:"code"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Title != "Internal error" || body.Status != http.StatusInternalServerError || body.Code != "INTERNAL" {
		t.Fatalf("body=%+v", body)
	}
	if !bytes.Contains(logs.Bytes(), []byte("database blip")) {
		t.Fatalf("missing cause in log: %s", logs.String())
	}
}
