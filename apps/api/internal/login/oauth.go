package login

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

const (
	discordTokenURL   = "https://discord.com/api/oauth2/token"
	discordProfileURL = "https://discord.com/api/users/@me"
	discordTimeout    = 10 * time.Second
	maxOAuthJSONBytes = 64 << 10
)

// HTTPDoer is the trusted Go-only provider transport boundary. Implementations
// must honor request contexts; production uses the bounded no-redirect client.
type HTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

func newDiscordClient() *http.Client {
	return &http.Client{
		Timeout: discordTimeout,
		// Never forward form credentials or bearer tokens through redirects.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

type discordProfile struct {
	ID, DisplayName, AvatarURL string
}

// exchangeDiscord follows the existing Authorization Code Grant. The original
// request context and one deadline bound both provider calls; there is no retry.
func (s *Service) exchangeDiscord(ctx context.Context, code string) (discordProfile, error) {
	ctx, cancel := context.WithTimeout(ctx, discordTimeout)
	defer cancel()
	form := url.Values{
		"client_id": {s.cfg.ClientID}, "client_secret": {s.cfg.ClientSecret},
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {s.cfg.RedirectURI},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, discordTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return discordProfile{}, apierr.New(apierr.Internal, "discord exchange unavailable")
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	var token struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := s.discordJSON(request, &token); err != nil {
		return discordProfile{}, err
	}
	if strings.TrimSpace(token.AccessToken) == "" || !strings.EqualFold(token.TokenType, "Bearer") {
		return discordProfile{}, apierr.New(apierr.Unauthenticated, "discord access token unavailable")
	}
	request, err = http.NewRequestWithContext(ctx, http.MethodGet, discordProfileURL, nil)
	if err != nil {
		return discordProfile{}, apierr.New(apierr.Internal, "discord profile unavailable")
	}
	request.Header.Set("Authorization", "Bearer "+token.AccessToken)
	request.Header.Set("Accept", "application/json")
	var user struct {
		ID         string  `json:"id"`
		Username   string  `json:"username"`
		GlobalName *string `json:"global_name"`
		Avatar     *string `json:"avatar"`
	}
	if err := s.discordJSON(request, &user); err != nil {
		return discordProfile{}, err
	}
	if strings.TrimSpace(user.ID) == "" || strings.TrimSpace(user.Username) == "" {
		return discordProfile{}, apierr.New(apierr.Unauthenticated, "invalid discord profile")
	}
	profile := discordProfile{ID: user.ID, DisplayName: user.Username}
	if user.GlobalName != nil && strings.TrimSpace(*user.GlobalName) != "" {
		profile.DisplayName = *user.GlobalName
	}
	if user.Avatar != nil && *user.Avatar != "" {
		// Preserve the legacy resolved .png avatar form, including a_ hashes.
		profile.AvatarURL = "https://cdn.discordapp.com/avatars/" + url.PathEscape(user.ID) + "/" + url.PathEscape(*user.Avatar) + ".png"
	}
	return profile, nil
}

func (s *Service) discordJSON(request *http.Request, target any) error {
	if request.Context().Err() != nil || s.http == nil {
		return apierr.New(apierr.Internal, "discord request unavailable")
	}
	response, err := s.http.Do(request)
	if err != nil {
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		return apierr.New(apierr.Internal, "discord request failed")
	}
	if response == nil || response.Body == nil {
		return apierr.New(apierr.Internal, "invalid discord response")
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		if response.StatusCode >= 400 && response.StatusCode < 500 && response.StatusCode != http.StatusTooManyRequests {
			return apierr.New(apierr.Unauthenticated, "discord authorization rejected")
		}
		return apierr.New(apierr.Internal, "discord request failed")
	}
	if err := decodeBoundedJSON(response.Body, target); err != nil {
		return apierr.New(apierr.Internal, "invalid discord response")
	}
	if request.Context().Err() != nil {
		return apierr.New(apierr.Internal, "discord request failed")
	}
	return nil
}
