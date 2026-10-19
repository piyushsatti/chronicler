package delivery_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// Opt-in live join: product GraphQL Discord delivery ops against a running Go API.
//
// Default `go test` skips this file (no CHRONICLER_LIVE_GRAPHQL_DISCORD).
// Against chronicler-dev (scripts/dev-stack):
//
//	CHRONICLER_LIVE_GRAPHQL_DISCORD=1 \
//	CHRONICLER_LIVE_API_URL=http://127.0.0.1:8080 \
//	CHRONICLER_LIVE_JWT_SECRET=local-test-only-jwt-secret \
//	go test ./internal/delivery/ -run LiveProductDiscordDelivery -count=1
//
// Evidence levels when this suite is enabled:
//   - Auth/resolver path: green runs below (mode query, forbidden, NOT_FOUND).
//   - Full announce (syncQuestDiscord bump → enqueue → worker Discord I/O):
//     evidence-gated. Needs a seeded quest plus DISCORD_DELIVERY_DRY_RUN unset
//     (or 0) with real bot token/channel. Local seed has no quests and the
//     worker typically runs dry-run; do not claim live announce from fixtures
//     or from NOT_FOUND-only harness results.

const (
	liveAdminMemberID = "11111111-1111-4111-8111-111111111111"
	liveDMMemberID    = "22222222-2222-4222-8222-222222222222"
)

func TestLiveProductDiscordDelivery(t *testing.T) {
	if os.Getenv("CHRONICLER_LIVE_GRAPHQL_DISCORD") != "1" {
		t.Skip("set CHRONICLER_LIVE_GRAPHQL_DISCORD=1 to hit a running API")
	}
	apiURL := strings.TrimRight(envOr("CHRONICLER_LIVE_API_URL", "http://127.0.0.1:8080"), "/")
	secret := envOr("CHRONICLER_LIVE_JWT_SECRET", "local-test-only-jwt-secret")

	t.Run("anonymous discordDeliveryMode is forbidden", func(t *testing.T) {
		body, status := liveGraphQL(t, apiURL, "", `query { discordDeliveryMode }`)
		assertGraphQLCode(t, status, body, "FORBIDDEN")
	})

	t.Run("admin discordDeliveryMode returns configured mode", func(t *testing.T) {
		token := mintLiveToken(t, secret, liveAdminMemberID, auth.Admin, auth.Player)
		body, status := liveGraphQL(t, apiURL, token, `query { discordDeliveryMode }`)
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, body)
		}
		var parsed struct {
			Data struct {
				DiscordDeliveryMode string `json:"discordDeliveryMode"`
			} `json:"data"`
			Errors []struct {
				Message    string         `json:"message"`
				Extensions map[string]any `json:"extensions"`
			} `json:"errors"`
		}
		if err := json.Unmarshal(body, &parsed); err != nil {
			t.Fatalf("decode: %v body=%s", err, body)
		}
		if len(parsed.Errors) > 0 {
			t.Fatalf("graphql errors=%+v", parsed.Errors)
		}
		mode := strings.TrimSpace(parsed.Data.DiscordDeliveryMode)
		if mode == "" {
			t.Fatalf("empty discordDeliveryMode body=%s", body)
		}
		t.Logf("live discordDeliveryMode=%q", mode)
	})

	t.Run("player redriveDiscordDelivery is forbidden", func(t *testing.T) {
		token := mintLiveToken(t, secret, "33333333-3333-4333-8333-333333333333", auth.Player)
		jobID := "10000000-0000-4000-8000-000000000098"
		query := fmt.Sprintf(
			`mutation { redriveDiscordDelivery(jobId: %q, reason: "live-harness", meta: {idempotencyKey: %q}) { jobId deliveryStatus } }`,
			jobID, "live-redrive-player-"+uuid.NewString(),
		)
		body, status := liveGraphQL(t, apiURL, token, query)
		assertGraphQLCode(t, status, body, "FORBIDDEN")
	})

	t.Run("syncQuestDiscord reaches quest-not-found after auth", func(t *testing.T) {
		token := mintLiveToken(t, secret, liveDMMemberID, auth.DM, auth.Player)
		questID := "10000000-0000-4000-8000-000000000099"
		query := fmt.Sprintf(
			`mutation { syncQuestDiscord(questId: %q, meta: {idempotencyKey: %q}) { jobId deliveryStatus } }`,
			questID, "live-sync-"+uuid.NewString(),
		)
		body, status := liveGraphQL(t, apiURL, token, query)
		assertGraphQLCode(t, status, body, "NOT_FOUND")
	})

	t.Run("redriveDiscordDelivery reaches job-not-found after auth", func(t *testing.T) {
		token := mintLiveToken(t, secret, liveAdminMemberID, auth.Admin, auth.Player)
		jobID := "10000000-0000-4000-8000-000000000098"
		query := fmt.Sprintf(
			`mutation { redriveDiscordDelivery(jobId: %q, reason: "live-harness", meta: {idempotencyKey: %q}) { jobId deliveryStatus } }`,
			jobID, "live-redrive-"+uuid.NewString(),
		)
		body, status := liveGraphQL(t, apiURL, token, query)
		assertGraphQLCode(t, status, body, "NOT_FOUND")
	})
}

func mintLiveToken(t *testing.T, secret, memberID string, roles ...auth.Role) string {
	t.Helper()
	token, err := login.Mint(secret, login.Claims{
		MemberID: memberID,
		Roles:    roles,
		Exp:      time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	return token
}

func liveGraphQL(t *testing.T, apiURL, bearer, query string) ([]byte, int) {
	t.Helper()
	payload, err := json.Marshal(map[string]any{"query": query})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, apiURL+"/v1/graphql", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("live API unreachable at %s: %v", apiURL, err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return body, res.StatusCode
}

func assertGraphQLCode(t *testing.T, status int, body []byte, wantCode string) {
	t.Helper()
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}
	var parsed struct {
		Errors []struct {
			Message    string         `json:"message"`
			Extensions map[string]any `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	if len(parsed.Errors) == 0 {
		t.Fatalf("expected GraphQL error code %s, got success body=%s", wantCode, body)
	}
	code, _ := parsed.Errors[0].Extensions["code"].(string)
	if !strings.EqualFold(code, wantCode) {
		t.Fatalf("want code=%s got code=%q errors=%+v", wantCode, code, parsed.Errors)
	}
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
