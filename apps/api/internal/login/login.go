package login

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type Config struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	JWTSecret    string
	TokenTTL     time.Duration
	// AllowDevLogin enables the "dev:<discordId>" code path when ClientSecret is
	// "dev". It must be false in production.
	AllowDevLogin bool
	// HTTPClient is a trusted Go-only transport seam for controlled tests and
	// harnesses. Nil selects the bounded Discord client; no endpoint is configurable.
	HTTPClient HTTPDoer
}

type MemberStore interface {
	EnsureFromDiscord(ctx context.Context, discordID, displayName, avatarURL string) (memberID string, roles []auth.Role, archonRegions, ltNPCs []string, err error)
}

type Service struct {
	cfg   Config
	store MemberStore
	http  HTTPDoer
}

func New(cfg Config, store MemberStore) *Service {
	if cfg.TokenTTL == 0 {
		cfg.TokenTTL = 30 * 24 * time.Hour
	}
	client := cfg.HTTPClient
	if client == nil {
		client = newDiscordClient()
	}
	return &Service{cfg: cfg, store: store, http: client}
}

func (s *Service) Routes(mux httpserver.Router) {
	mux.HandleFunc("GET /auth/discord", s.redirect)
	mux.HandleFunc("POST /auth/discord/callback", s.callback)
}

func (s *Service) redirect(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ClientID == "" {
		http.Redirect(w, r, "/?error=oauth_misconfig", http.StatusFound)
		return
	}
	q := url.Values{}
	q.Set("client_id", s.cfg.ClientID)
	q.Set("response_type", "code")
	q.Set("scope", "identify")
	q.Set("redirect_uri", s.cfg.RedirectURI)
	if state := r.URL.Query().Get("state"); state != "" {
		q.Set("state", state)
	}
	http.Redirect(w, r, "https://discord.com/api/oauth2/authorize?"+q.Encode(), http.StatusFound)
}

type callbackBody struct {
	Code  string `json:"code"`
	State string `json:"state"`
}

func (s *Service) callback(w http.ResponseWriter, r *http.Request) {
	var body callbackBody
	if err := decodeBoundedJSON(r.Body, &body); err != nil || strings.TrimSpace(body.Code) == "" {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "code required"))
		return
	}
	if s.cfg.ClientID == "" || s.cfg.ClientSecret == "" || (s.cfg.ClientSecret == "dev" && !s.cfg.AllowDevLogin) {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "oauth not configured"))
		return
	}
	// Dev path: code "dev:<discordId>" mints a local token when ClientSecret is "dev".
	var discordID, displayName, avatar string
	displayName = "dev"
	if s.cfg.ClientSecret == "dev" {
		if !strings.HasPrefix(body.Code, "dev:") {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "development code required"))
			return
		}
		discordID = strings.TrimPrefix(body.Code, "dev:")
		if strings.TrimSpace(discordID) == "" {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "discord id required"))
			return
		}
	} else {
		if s.cfg.RedirectURI == "" {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "oauth not configured"))
			return
		}
		profile, err := s.exchangeDiscord(r.Context(), body.Code)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		discordID, displayName, avatar = profile.ID, profile.DisplayName, profile.AvatarURL
	}
	if s.store == nil {
		apierr.Write(w, r, apierr.New(apierr.Internal, "member store unavailable"))
		return
	}
	memberID, roles, archons, lts, err := s.store.EnsureFromDiscord(r.Context(), discordID, displayName, avatar)
	if err != nil {
		apierr.Write(w, r, err)
		return
	}
	token, err := Mint(s.cfg.JWTSecret, Claims{
		MemberID:      memberID,
		Roles:         roles,
		ArchonRegions: archons,
		LtNPCs:        lts,
		Exp:           time.Now().Add(s.cfg.TokenTTL).Unix(),
	})
	if err != nil {
		apierr.Write(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"token": token})
}

// A callback/provider response is one bounded JSON value. Decoder errors never
// escape with provider response bytes or credentials attached.
func decodeBoundedJSON(reader io.Reader, target any) error {
	raw, err := io.ReadAll(io.LimitReader(reader, maxOAuthJSONBytes+1))
	if err != nil || len(raw) > maxOAuthJSONBytes {
		return apierr.New(apierr.Invalid, "invalid oauth response")
	}
	return json.Unmarshal(raw, target)
}

// Claims is the JWT payload (D41).
type Claims struct {
	MemberID      string      `json:"member_id"`
	Roles         []auth.Role `json:"roles"`
	ArchonRegions []string    `json:"archon_regions"`
	LtNPCs        []string    `json:"lt_npcs"`
	Exp           int64       `json:"exp"`
}

func Mint(secret string, c Claims) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	body := header + "." + base64.RawURLEncoding.EncodeToString(payload)
	sig := sign(secret, body)
	return body + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func Parse(secret, token string) (auth.Claims, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return auth.Claims{}, false
	}
	expected := sign(secret, parts[0]+"."+parts[1])
	got, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(expected, got) {
		return auth.Claims{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return auth.Claims{}, false
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return auth.Claims{}, false
	}
	if c.Exp > 0 && time.Now().Unix() > c.Exp {
		return auth.Claims{}, false
	}
	if c.MemberID == "" {
		return auth.Claims{}, false
	}
	return auth.Claims{MemberID: c.MemberID, Roles: c.Roles}, true
}

func sign(secret, body string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(body))
	return mac.Sum(nil)
}

func Parser(secret string) auth.Parser {
	return func(token string) (auth.Claims, bool) {
		return Parse(secret, token)
	}
}

// StaticMemberStore is a P1 stand-in until the member slice exists.
type StaticMemberStore struct{}

func (StaticMemberStore) EnsureFromDiscord(_ context.Context, discordID, _, _ string) (string, []auth.Role, []string, []string, error) {
	if discordID == "" {
		return "", nil, nil, nil, apierr.New(apierr.Invalid, "discord id required")
	}
	return fmt.Sprintf("member-%s", discordID), []auth.Role{auth.Player}, nil, nil, nil
}
