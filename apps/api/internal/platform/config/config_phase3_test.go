package config

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestPhase3TaskW04Acceptance(t *testing.T) {
	const owner = "10000000-0000-4000-8000-000000000001"
	ctx := context.Background()
	t.Run("environment snapshot", func(t *testing.T) {
		t.Setenv("PLATFORM_OWNER_MEMBER_ID", owner)
		t.Setenv("OPERATOR_DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/synthetic/token")
		cfg := FromEnv()
		t.Setenv("PLATFORM_OWNER_MEMBER_ID", "")
		t.Setenv("OPERATOR_DISCORD_WEBHOOK_URL", "")
		if cfg.PlatformOwnerMemberID != owner || cfg.OperatorDiscordWebhookURL != "https://discord.com/api/webhooks/synthetic/token" || FromEnv().PlatformOwnerMemberID != "" {
			t.Fatal("configuration did not capture immutable environment values")
		}
	})
	t.Run("absent requires no lookup", func(t *testing.T) {
		if err := (Config{}).Validate(ctx, nil); err != nil {
			t.Fatal(err)
		}
	})
	for _, value := range []string{"garbage", "10000000000040008000000000000001", " 10000000-0000-4000-8000-000000000001", "AAAAAAAA-0000-4000-8000-000000000001"} {
		t.Run("reject syntax "+value, func(t *testing.T) {
			called := false
			err := (Config{PlatformOwnerMemberID: value}).Validate(ctx, func(context.Context, string) (auth.Authority, error) { called = true; return auth.Authority{}, nil })
			if err == nil || called {
				t.Fatalf("err=%v queried=%v", err, called)
			}
		})
	}
	cfg := Config{PlatformOwnerMemberID: owner}
	if cfg.Validate(ctx, nil) == nil {
		t.Fatal("nil resolver accepted")
	}
	sentinel := errors.New("database unavailable")
	if err := cfg.Validate(ctx, func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, sentinel }); !errors.Is(err, sentinel) {
		t.Fatalf("dependency failure lost: %v", err)
	}
	if err := cfg.Validate(ctx, func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, nil }); err == nil {
		t.Fatal("missing authority accepted")
	}
	calls := 0
	if err := cfg.Validate(ctx, func(got context.Context, id string) (auth.Authority, error) {
		calls++
		if got != ctx || id != owner {
			t.Fatal("wrong lookup")
		}
		return auth.NewAuthority(owner, []auth.Role{auth.Player}, "active", "")
	}); err != nil || calls != 1 {
		t.Fatalf("active owner err=%v calls=%d", err, calls)
	}
}
