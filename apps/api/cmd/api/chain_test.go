package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

const testOrigin = "https://app.example.test"

func chainTestConfigAndToken(t *testing.T) (config.Config, string) {
	t.Helper()
	cfg := config.Config{JWTSecret: "chain-test-signing-key", CORSOrigins: []string{testOrigin}}
	token, err := login.Mint(cfg.JWTSecret, login.Claims{
		MemberID: "member", Roles: []auth.Role{auth.Admin}, Exp: time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return cfg, token
}

func TestProductionChainAuthorityFailuresKeepCORS(t *testing.T) {
	for _, tt := range []struct {
		name    string
		resolve auth.AuthorityResolver
		status  int
		code    string
	}{
		{"inactive", func(context.Context, string) (auth.Authority, error) {
			return auth.NewAuthority("member", nil, "inactive", "")
		}, 403, "FORBIDDEN"},
		{"missing member", func(context.Context, string) (auth.Authority, error) { return auth.NewAuthority("", nil, "", "") }, 403, "FORBIDDEN"},
		{"lookup failure", func(context.Context, string) (auth.Authority, error) {
			return auth.Authority{}, errors.New("database unavailable")
		}, 500, "INTERNAL"},
		{"missing resolver", nil, 500, "INTERNAL"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			cfg, token := chainTestConfigAndToken(t)
			h := apiHandler(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("authority failure reached app") }), cfg, tt.resolve)
			r := httptest.NewRequest(http.MethodGet, "/v1/documents/private", nil)
			r.Header.Set("Authorization", "Bearer "+token)
			r.Header.Set("Origin", testOrigin)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tt.status {
				t.Fatalf("status=%d want=%d", w.Code, tt.status)
			}
			if got := w.Header().Get("Access-Control-Allow-Origin"); got != testOrigin {
				t.Fatalf("ACAO=%q", got)
			}
			if got := w.Header().Get("Content-Type"); got != "application/problem+json" {
				t.Fatalf("content type=%q", got)
			}
			var problem struct {
				Code string `json:"code"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &problem); err != nil || problem.Code != tt.code {
				t.Fatalf("problem=%+v err=%v", problem, err)
			}
		})
	}
}

func TestProductionChainPreflightDoesNotResolveAuthority(t *testing.T) {
	cfg, token := chainTestConfigAndToken(t)
	h := apiHandler(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("preflight reached app") }), cfg,
		func(context.Context, string) (auth.Authority, error) {
			t.Fatal("preflight resolved authority")
			return auth.Authority{}, nil
		})
	r := httptest.NewRequest(http.MethodOptions, "/v1/documents/private", nil)
	r.Header.Set("Origin", testOrigin)
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("Access-Control-Request-Method", http.MethodGet)
	r.Header.Set("Access-Control-Request-Headers", "Authorization")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != testOrigin {
		t.Fatalf("preflight status=%d headers=%v", w.Code, w.Header())
	}
}

func TestProductionChainDoesNotGrantDisallowedOrigin(t *testing.T) {
	cfg, token := chainTestConfigAndToken(t)
	reads := 0
	h := apiHandler(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("denied authority reached app") }), cfg,
		func(context.Context, string) (auth.Authority, error) {
			reads++
			return auth.NewAuthority("member", nil, "banned", "")
		})
	r := httptest.NewRequest(http.MethodGet, "/v1/documents/private", nil)
	r.Header.Set("Origin", "https://untrusted.example.test")
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 || reads != 1 || w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("status=%d reads=%d headers=%v", w.Code, reads, w.Header())
	}
}
