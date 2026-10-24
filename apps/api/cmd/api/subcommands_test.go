package main

import (
	"bytes"
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthcheckStatus(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		wantOK bool
	}{{"204", http.StatusNoContent, true}, {"500", http.StatusInternalServerError, false}} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/health" {
					t.Errorf("path = %s", r.URL.Path)
				}
				w.WriteHeader(tc.status)
			}))
			defer srv.Close()
			_, port, _ := net.SplitHostPort(srv.Listener.Addr().String())
			err := healthcheck(context.Background(), ":"+port)
			if (err == nil) != tc.wantOK {
				t.Fatalf("err = %v, wantOK %v", err, tc.wantOK)
			}
		})
	}
}

func TestRunSubcommandRejectsUnknown(t *testing.T) {
	var out, errb bytes.Buffer
	if code := runSubcommand([]string{"bogus"}, &out, &errb); code != 2 {
		t.Fatalf("code = %d", code)
	}
	if code := runSubcommand([]string{"migrate", "down"}, &out, &errb); code != 2 {
		t.Fatalf("code = %d", code)
	}
}
