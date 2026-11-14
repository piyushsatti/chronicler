package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDeadlineCancelsMatchingPath(t *testing.T) {
	h := Deadline(50*time.Millisecond, "/v1/graphql")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
		w.WriteHeader(http.StatusGatewayTimeout)
	}))
	r := httptest.NewRequest(http.MethodPost, "/v1/graphql", nil)
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		defer close(done)
		h.ServeHTTP(w, r)
	}()
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("handler did not return after deadline")
	}
	if w.Code != http.StatusGatewayTimeout {
		t.Fatalf("status=%d", w.Code)
	}
}

func TestDeadlineSkipsNonMatchingPath(t *testing.T) {
	h := Deadline(50*time.Millisecond, "/v1/graphql")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.Context().Deadline(); ok {
			t.Fatal("unexpected deadline")
		}
		w.WriteHeader(http.StatusOK)
	}))
	r := httptest.NewRequest(http.MethodGet, "/v1/documents", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d", w.Code)
	}
}
