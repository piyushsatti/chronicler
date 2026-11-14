package main

import (
	"net/http"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

func TestNewServerTimeouts(t *testing.T) {
	srv := newServer(config.Config{Addr: ":0"}, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	if srv.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout=%v", srv.ReadHeaderTimeout)
	}
	if srv.ReadTimeout != 30*time.Second {
		t.Fatalf("ReadTimeout=%v", srv.ReadTimeout)
	}
	if srv.WriteTimeout != 60*time.Second {
		t.Fatalf("WriteTimeout=%v", srv.WriteTimeout)
	}
	if srv.IdleTimeout != 120*time.Second {
		t.Fatalf("IdleTimeout=%v", srv.IdleTimeout)
	}
}
