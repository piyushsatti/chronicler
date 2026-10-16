package config

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	PlatformOwnerMemberID     string
	OperatorDiscordWebhookURL string
	Addr                      string
	DatabaseURL               string
	JWTSecret                 string
	DiscordClientID           string
	DiscordSecret             string
	DiscordRedirect           string
	IngestSecret              string
	CORSOrigins               []string
	ShutdownTimeout           time.Duration
	// Env is development (default) or production. Production requires Postgres.
	Env string
	// RequireDatabase forces Wire to fail when Postgres is unavailable.
	RequireDatabase bool
}

func FromEnv() Config {
	envName := env("CHRONICLER_ENV", "development")
	requireDB := envName == "production" || envTruthy("REQUIRE_DATABASE")
	return Config{
		PlatformOwnerMemberID:     os.Getenv("PLATFORM_OWNER_MEMBER_ID"),
		OperatorDiscordWebhookURL: os.Getenv("OPERATOR_DISCORD_WEBHOOK_URL"),
		Addr:                      env("API_ADDR", ":8080"),
		DatabaseURL:               env("DATABASE_URL", "postgres://chronicler:chronicler@127.0.0.1:5432/chronicler?sslmode=disable"),
		JWTSecret:                 env("JWT_SECRET", "dev-only-change-me"),
		DiscordClientID:           os.Getenv("DISCORD_CLIENT_ID"),
		DiscordSecret:             os.Getenv("DISCORD_CLIENT_SECRET"),
		DiscordRedirect:           env("DISCORD_REDIRECT_URI", "http://localhost:8080/auth/discord/callback"),
		IngestSecret:              os.Getenv("INGEST_SECRET"),
		CORSOrigins:               splitCSV(env("CORS_ORIGINS", "http://localhost:5173")),
		ShutdownTimeout:           durationEnv("SHUTDOWN_TIMEOUT", 10*time.Second),
		Env:                       envName,
		RequireDatabase:           requireDB,
	}
}

func envTruthy(key string) bool {
	v := os.Getenv(key)
	return v == "1" || v == "true" || v == "TRUE" || v == "yes"
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	if ms, err := strconv.Atoi(v); err == nil {
		return time.Duration(ms) * time.Millisecond
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

// Validate checks trusted startup configuration before production wiring serves requests.
func (c Config) Validate(ctx context.Context, resolve auth.AuthorityResolver) error {
	if c.PlatformOwnerMemberID == "" {
		return nil
	}
	parsed, err := uuid.Parse(c.PlatformOwnerMemberID)
	if err != nil || parsed.String() != c.PlatformOwnerMemberID {
		return fmt.Errorf("invalid PLATFORM_OWNER_MEMBER_ID")
	}
	if resolve == nil {
		return fmt.Errorf("configured owner requires live authority resolver")
	}
	actor, err := resolve(ctx, c.PlatformOwnerMemberID)
	if err != nil {
		return fmt.Errorf("configured owner must resolve active: %w", err)
	}
	if actor.Claims().MemberID != c.PlatformOwnerMemberID {
		return fmt.Errorf("configured owner authority mismatch")
	}
	return nil
}
