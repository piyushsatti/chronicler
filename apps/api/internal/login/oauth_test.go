package login

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type oauthDoFunc func(*http.Request) (*http.Response, error)

func (f oauthDoFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }

type oauthStore struct {
	calls               int
	id, display, avatar string
	err                 error
}

func (s *oauthStore) EnsureFromDiscord(ctx context.Context, id, display, avatar string) (string, []auth.Role, []string, []string, error) {
	s.calls++
	s.id, s.display, s.avatar = id, display, avatar
	if ctx.Err() != nil {
		return "", nil, nil, nil, ctx.Err()
	}
	return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", []auth.Role{auth.DM, auth.Admin}, []string{"preserved-region"}, []string{"preserved-npc"}, s.err
}

type oauthBody struct {
	io.Reader
	closed bool
}

func (b *oauthBody) Close() error { b.closed = true; return nil }
func oauthResponse(status int, body string) (*http.Response, *oauthBody) {
	b := &oauthBody{Reader: strings.NewReader(body)}
	return &http.Response{StatusCode: status, Body: b}, b
}

// All credentials, identities and redirects here are synthetic; every Do call
// is injected. These tests never open a provider or local server socket.
func oauthConfig(client HTTPDoer) Config {
	return Config{ClientID: "synthetic-client", ClientSecret: "fixture-client-secret", RedirectURI: "https://fixture.invalid/registered?part=a+b", JWTSecret: "fixture-signing-key", TokenTTL: time.Hour, HTTPClient: client}
}

func oauthCallback(s *Service, ctx context.Context, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	s.callback(w, httptest.NewRequest(http.MethodPost, "/auth/discord/callback", strings.NewReader(body)).WithContext(ctx))
	return w
}

func TestDiscordCodeGrantFormProfileAndExistingTokenShape(t *testing.T) {
	for _, tc := range []struct{ name, profile, display, avatar string }{
		{"global display", `{"id":"12345","username":"username","global_name":"Global Name","avatar":"a_fixture"}`, "Global Name", "https://cdn.discordapp.com/avatars/12345/a_fixture.png"},
		{"username fallback", `{"id":"12345","username":"username","global_name":null,"avatar":null}`, "username", ""},
		{"empty global display", `{"id":"12345","username":"username","global_name":"","avatar":""}`, "username", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			bodies := []*oauthBody{}
			client := oauthDoFunc(func(r *http.Request) (*http.Response, error) {
				calls++
				deadline, bounded := r.Context().Deadline()
				if !bounded || time.Until(deadline) > discordTimeout {
					t.Fatal("request has no bounded shared context")
				}
				if calls == 1 {
					if r.Method != http.MethodPost || r.URL.String() != discordTokenURL || r.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
						t.Fatalf("token request=%s %s headers=%v", r.Method, r.URL, r.Header)
					}
					raw, err := io.ReadAll(r.Body)
					if err != nil {
						t.Fatal(err)
					}
					form, err := url.ParseQuery(string(raw))
					if err != nil {
						t.Fatal(err)
					}
					want := url.Values{"client_id": {"synthetic-client"}, "client_secret": {"fixture-client-secret"}, "grant_type": {"authorization_code"}, "code": {"synthetic+code&value"}, "redirect_uri": {"https://fixture.invalid/registered?part=a+b"}}
					if !reflect.DeepEqual(form, want) {
						t.Fatal("form did not preserve configured values")
					}
					res, body := oauthResponse(200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`)
					bodies = append(bodies, body)
					return res, nil
				}
				if calls != 2 || r.Method != http.MethodGet || r.URL.String() != discordProfileURL || r.Header.Get("Authorization") != "Bearer provider-access-secret" {
					t.Fatal("unexpected profile request")
				}
				res, body := oauthResponse(200, tc.profile)
				bodies = append(bodies, body)
				return res, nil
			})
			store := &oauthStore{}
			w := oauthCallback(New(oauthConfig(client), store), context.Background(), `{"code":"synthetic+code&value","state":"existing-opaque-state"}`)
			var result map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 || len(result) != 1 || result["token"] == "" {
				t.Fatalf("callback=%d %s err=%v", w.Code, w.Body, err)
			}
			if calls != 2 || store.calls != 1 || store.id != "12345" || store.display != tc.display || store.avatar != tc.avatar {
				t.Fatalf("calls=%d store=%+v", calls, store)
			}
			for _, body := range bodies {
				if !body.closed {
					t.Fatal("provider body not closed")
				}
			}
			payload, err := base64.RawURLEncoding.DecodeString(strings.Split(result["token"], ".")[1])
			if err != nil {
				t.Fatal(err)
			}
			var claims Claims
			if err := json.Unmarshal(payload, &claims); err != nil {
				t.Fatal(err)
			}
			if claims.MemberID != "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" || !reflect.DeepEqual(claims.Roles, []auth.Role{auth.DM, auth.Admin}) || !reflect.DeepEqual(claims.ArchonRegions, []string{"preserved-region"}) || !reflect.DeepEqual(claims.LtNPCs, []string{"preserved-npc"}) || claims.Exp < time.Now().Add(59*time.Minute).Unix() || claims.Exp > time.Now().Add(time.Hour).Unix() {
				t.Fatalf("existing token claims changed: %+v", claims)
			}
			if strings.Contains(w.Body.String(), "provider-access-secret") || strings.Contains(w.Body.String(), "fixture-client-secret") {
				t.Fatal("provider secret escaped callback")
			}
		})
	}
}

func TestDiscordProviderFailuresAreBoundedOpaqueAndNeverPersist(t *testing.T) {
	for _, tc := range []struct {
		name          string
		tokenStatus   int
		tokenBody     string
		profileStatus int
		profileBody   string
		network       bool
		status        int
		code          string
	}{
		{"token rejected", 400, `{"secret":"provider-access-secret"}`, 200, "", false, 401, "UNAUTHENTICATED"},
		{"token upstream failure", 503, `{"secret":"fixture-client-secret"}`, 200, "", false, 500, "INTERNAL"},
		{"rate limited", 429, "provider-access-secret", 200, "", false, 500, "INTERNAL"},
		{"redirect", 302, "provider-access-secret", 200, "", false, 500, "INTERNAL"},
		{"network error", 200, "", 200, "", true, 500, "INTERNAL"},
		{"malformed token", 200, "not-json provider-access-secret", 200, "", false, 500, "INTERNAL"},
		{"oversized token", 200, strings.Repeat("x", maxOAuthJSONBytes+1), 200, "", false, 500, "INTERNAL"},
		{"empty token", 200, `{"access_token":"","token_type":"Bearer"}`, 200, "", false, 401, "UNAUTHENTICATED"},
		{"wrong token type", 200, `{"access_token":"provider-access-secret","token_type":"Basic"}`, 200, "", false, 401, "UNAUTHENTICATED"},
		{"profile rejected", 200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`, 401, "private-provider-body", false, 401, "UNAUTHENTICATED"},
		{"profile upstream failure", 200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`, 503, "private-provider-body", false, 500, "INTERNAL"},
		{"malformed profile", 200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`, 200, "private-provider-body", false, 500, "INTERNAL"},
		{"oversized profile", 200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`, 200, strings.Repeat("x", maxOAuthJSONBytes+1), false, 500, "INTERNAL"},
		{"empty profile id", 200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`, 200, `{"id":" ","username":"name"}`, false, 401, "UNAUTHENTICATED"},
		{"empty profile username", 200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`, 200, `{"id":"12345","username":" "}`, false, 401, "UNAUTHENTICATED"},
		{"invalid profile types", 200, `{"access_token":"provider-access-secret","token_type":"Bearer"}`, 200, `{"id":12345,"username":"name"}`, false, 500, "INTERNAL"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var audit bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&audit, nil)))
			defer slog.SetDefault(previous)
			calls := 0
			bodies := []*oauthBody{}
			client := oauthDoFunc(func(*http.Request) (*http.Response, error) {
				calls++
				if tc.network {
					return nil, errors.New("fixture-client-secret provider-access-secret")
				}
				status, raw := tc.tokenStatus, tc.tokenBody
				if calls == 2 {
					status, raw = tc.profileStatus, tc.profileBody
				}
				res, body := oauthResponse(status, raw)
				bodies = append(bodies, body)
				return res, nil
			})
			store := &oauthStore{}
			w := oauthCallback(New(oauthConfig(client), store), context.Background(), `{"code":"synthetic-code"}`)
			var problem struct{ Code string }
			err := json.Unmarshal(w.Body.Bytes(), &problem)
			if err != nil || w.Code != tc.status || problem.Code != tc.code || store.calls != 0 || calls > 2 {
				t.Fatalf("callback=%d %s storecalls=%d err=%v", w.Code, w.Body, store.calls, err)
			}
			for _, body := range bodies {
				if !body.closed {
					t.Fatal("provider failure body not closed")
				}
			}
			for _, secret := range []string{"fixture-client-secret", "provider-access-secret", "private-provider-body"} {
				if strings.Contains(w.Body.String(), secret) || strings.Contains(audit.String(), secret) {
					t.Fatal("provider secret/body escaped response or logs")
				}
			}
		})
	}
}

func TestDiscordCancellationAndDefaultClientBoundary(t *testing.T) {
	client := newDiscordClient()
	if client.Timeout != discordTimeout || client.CheckRedirect(nil, nil) != http.ErrUseLastResponse {
		t.Fatal("default provider client is not bounded/no-redirect")
	}
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	doer := oauthDoFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		cancel()
		returnRes, _ := oauthResponse(200, `{"access_token":"secret","token_type":"Bearer"}`)
		return returnRes, nil
	})
	store := &oauthStore{}
	w := oauthCallback(New(oauthConfig(doer), store), ctx, `{"code":"synthetic-code"}`)
	if w.Code != 500 || calls != 1 || store.calls != 0 {
		t.Fatalf("cancellation response=%d calls=%d store=%d", w.Code, calls, store.calls)
	}
	ctx, cancel = context.WithCancel(context.Background())
	cancel()
	calls = 0
	w = oauthCallback(New(oauthConfig(doer), store), ctx, `{"code":"synthetic-code"}`)
	if w.Code != 500 || calls != 0 || store.calls != 0 {
		t.Fatal("pre-cancelled request reached provider/store")
	}
}

func TestDevCallbackAndMalformedInputPreserveLocalBoundary(t *testing.T) {
	calls := 0
	cfg := oauthConfig(oauthDoFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return nil, errors.New("must not contact provider")
	}))
	cfg.ClientSecret = "dev"
	cfg.AllowDevLogin = true
	cfg.RedirectURI = ""
	store := &oauthStore{}
	service := New(cfg, store)
	w := oauthCallback(service, context.Background(), `{"code":"dev:local-fixture"}`)
	if w.Code != 200 || store.id != "local-fixture" || store.display != "dev" || calls != 0 {
		t.Fatalf("dev callback=%d store=%+v provider=%d", w.Code, store, calls)
	}
	for _, body := range []string{`{"code":"dev:"}`, `{"code":" "}`, `{"code":1}`, `{"code":"dev:local"} {}`, strings.Repeat("x", maxOAuthJSONBytes+1)} {
		before := store.calls
		w = oauthCallback(service, context.Background(), body)
		if w.Code != 422 || store.calls != before || calls != 0 {
			t.Fatalf("invalid input code=%d store=%d provider=%d", w.Code, store.calls, calls)
		}
	}
	if New(Config{}, store).cfg.TokenTTL != 30*24*time.Hour {
		t.Fatal("default token TTL changed")
	}
	// Configured dev mode must remain local even when a redirect is present.
	cfg.RedirectURI = "https://fixture.invalid/registered"
	w = oauthCallback(New(cfg, store), context.Background(), `{"code":"synthetic-nondev-code"}`)
	if w.Code != 422 || calls != 0 {
		t.Fatal("development mode attempted a provider exchange")
	}
}

func TestCallbackConfigurationAndStoreFailuresDoNotMint(t *testing.T) {
	for _, tc := range []struct {
		name   string
		edit   func(*Config)
		store  MemberStore
		body   string
		status int
		code   string
	}{
		{"missing client", func(c *Config) { c.ClientID = "" }, &oauthStore{}, `{"code":"synthetic-code"}`, 422, "INVALID"},
		{"missing secret", func(c *Config) { c.ClientSecret = "" }, &oauthStore{}, `{"code":"synthetic-code"}`, 422, "INVALID"},
		{"missing redirect", func(c *Config) { c.RedirectURI = "" }, &oauthStore{}, `{"code":"synthetic-code"}`, 422, "INVALID"},
		{"missing store", func(c *Config) { c.ClientSecret = "dev"; c.AllowDevLogin = true }, nil, `{"code":"dev:local-fixture"}`, 500, "INTERNAL"},
		{"store failure", func(c *Config) { c.ClientSecret = "dev"; c.AllowDevLogin = true }, &oauthStore{err: apierr.New(apierr.Internal, "member store failed")}, `{"code":"dev:local-fixture"}`, 500, "INTERNAL"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			cfg := oauthConfig(oauthDoFunc(func(*http.Request) (*http.Response, error) { calls++; return nil, errors.New("must not call provider") }))
			tc.edit(&cfg)
			w := oauthCallback(New(cfg, tc.store), context.Background(), tc.body)
			var result map[string]any
			err := json.Unmarshal(w.Body.Bytes(), &result)
			if err != nil || w.Code != tc.status || result["code"] != tc.code || calls != 0 || result["token"] != nil {
				t.Fatalf("configuration/store response=%d %s calls=%d err=%v", w.Code, w.Body, calls, err)
			}
		})
	}
}

func TestDevLoginRefusedWhenNotAllowed(t *testing.T) {
	calls := 0
	cfg := oauthConfig(oauthDoFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return nil, errors.New("must not contact provider")
	}))
	cfg.ClientSecret = "dev"
	cfg.AllowDevLogin = false
	store := &oauthStore{}
	w := oauthCallback(New(cfg, store), context.Background(), `{"code":"dev:attacker"}`)
	if w.Code != 422 || store.id != "" || calls != 0 {
		t.Fatalf("code=%d id=%q calls=%d", w.Code, store.id, calls)
	}
}
