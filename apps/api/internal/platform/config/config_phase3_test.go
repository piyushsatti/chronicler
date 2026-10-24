package config

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestPhase3TaskW04Acceptance(t *testing.T) {
	const owner = "10000000-0000-4000-8000-000000000001"
	const discordOwner = "12345678901234567"
	ctx := context.Background()
	t.Run("environment snapshot", func(t *testing.T) {
		t.Setenv("PLATFORM_OWNER_MEMBER_ID", owner)
		t.Setenv("PLATFORM_OWNER_DISCORD_ID", discordOwner)
		t.Setenv("OPERATOR_DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/synthetic/token")
		cfg := FromEnv()
		t.Setenv("PLATFORM_OWNER_MEMBER_ID", "")
		t.Setenv("PLATFORM_OWNER_DISCORD_ID", "")
		t.Setenv("OPERATOR_DISCORD_WEBHOOK_URL", "")
		if cfg.PlatformOwnerMemberID != owner || cfg.PlatformOwnerDiscordID != discordOwner || cfg.OperatorDiscordWebhookURL != "https://discord.com/api/webhooks/synthetic/token" || FromEnv().PlatformOwnerMemberID != "" || FromEnv().PlatformOwnerDiscordID != "" {
			t.Fatal("configuration did not capture immutable environment values")
		}
	})
	t.Run("absent requires no lookup", func(t *testing.T) {
		if _, err := (Config{}).Validate(ctx, nil, nil); err != nil {
			t.Fatal(err)
		}
	})
	for _, value := range []string{"garbage", "10000000000040008000000000000001", " 10000000-0000-4000-8000-000000000001", "AAAAAAAA-0000-4000-8000-000000000001"} {
		t.Run("reject syntax "+value, func(t *testing.T) {
			called := false
			_, err := (Config{PlatformOwnerMemberID: value}).Validate(ctx, func(context.Context, string) (auth.Authority, error) { called = true; return auth.Authority{}, nil }, nil)
			if err == nil || called {
				t.Fatalf("err=%v queried=%v", err, called)
			}
		})
	}
	cfg := Config{PlatformOwnerMemberID: owner}
	if _, err := cfg.Validate(ctx, nil, nil); err == nil {
		t.Fatal("nil resolver accepted")
	}
	sentinel := errors.New("database unavailable")
	if _, err := cfg.Validate(ctx, func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, sentinel }, nil); !errors.Is(err, sentinel) {
		t.Fatalf("dependency failure lost: %v", err)
	}
	if _, err := cfg.Validate(ctx, func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, nil }, nil); err == nil {
		t.Fatal("missing authority accepted")
	}
	calls := 0
	if got, err := cfg.Validate(ctx, func(got context.Context, id string) (auth.Authority, error) {
		calls++
		if got != ctx || id != owner {
			t.Fatal("wrong lookup")
		}
		return auth.NewAuthority(owner, []auth.Role{auth.Player}, "active", "")
	}, nil); err != nil || calls != 1 || got != owner {
		t.Fatalf("active owner=%q err=%v calls=%d", got, err, calls)
	}
	for _, value := range []string{"1234567890123456", "123456789012345678901", "+12345678901234567", " 12345678901234567", "12345678901234567 ", "１２３４５６７８９０１２３４５６７", "1234567890123456x"} {
		t.Run("reject Discord syntax "+value, func(t *testing.T) {
			called := false
			_, err := (Config{PlatformOwnerDiscordID: value}).Validate(ctx, nil, func(context.Context, string) (string, error) { called = true; return owner, nil })
			if err == nil || called {
				t.Fatalf("err=%v queried=%v", err, called)
			}
		})
	}
	for _, value := range []string{"12345678901234567", "12345678901234567890"} {
		t.Run("accept Discord length "+value, func(t *testing.T) {
			got, err := (Config{PlatformOwnerDiscordID: value}).Validate(ctx, func(_ context.Context, id string) (auth.Authority, error) {
				if id != owner {
					t.Fatalf("authority lookup id=%q", id)
				}
				return auth.NewAuthority(owner, []auth.Role{auth.Player}, "active", "")
			}, func(_ context.Context, id string) (string, error) {
				if id != value {
					t.Fatalf("Discord lookup id=%q", id)
				}
				return owner, nil
			})
			if err != nil || got != owner {
				t.Fatalf("owner=%q err=%v", got, err)
			}
		})
	}
	if _, err := (Config{PlatformOwnerDiscordID: discordOwner}).Validate(ctx, func(context.Context, string) (auth.Authority, error) {
		return auth.Authority{}, errors.New("inactive member")
	}, func(context.Context, string) (string, error) { return owner, nil }); err == nil {
		t.Fatal("inactive Discord owner accepted")
	}
	if _, err := (Config{PlatformOwnerDiscordID: discordOwner}).Validate(ctx, func(context.Context, string) (auth.Authority, error) {
		return auth.Authority{}, errors.New("member not found")
	}, func(context.Context, string) (string, error) { return "", errors.New("member not found") }); err == nil {
		t.Fatal("unknown Discord owner accepted")
	}
	if got, err := (Config{PlatformOwnerMemberID: owner, PlatformOwnerDiscordID: discordOwner}).Validate(ctx, func(_ context.Context, id string) (auth.Authority, error) {
		return auth.NewAuthority(id, []auth.Role{auth.Player}, "active", "")
	}, func(context.Context, string) (string, error) { return owner, nil }); err != nil || got != owner {
		t.Fatalf("matching dual owner=%q err=%v", got, err)
	}
	if _, err := (Config{PlatformOwnerMemberID: owner, PlatformOwnerDiscordID: discordOwner}).Validate(ctx, func(_ context.Context, id string) (auth.Authority, error) {
		return auth.NewAuthority(id, []auth.Role{auth.Player}, "active", "")
	}, func(context.Context, string) (string, error) { return "10000000-0000-4000-8000-000000000002", nil }); err == nil {
		t.Fatal("mismatched dual owner accepted")
	}
}
