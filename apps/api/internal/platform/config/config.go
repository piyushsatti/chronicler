package config

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type Env string

const (
	EnvDevelopment Env = "development"
	EnvTest        Env = "test"
	EnvStaging     Env = "staging"
	EnvProduction  Env = "production"
)

const defaultJWTSecret = "dev-only-change-me"

type DiscordConfig struct {
	BotToken                string
	GuildID                 string
	AnnounceChannelFallback string
	DeliveryDryRun          bool
}

type AgentConfig struct {
	InlineComplete bool
}

type Config struct {
	PlatformOwnerMemberID  string
	PlatformOwnerDiscordID string
	Addr                   string
	DatabaseURL            string
	JWTSecret              string
	DiscordClientID        string
	DiscordSecret          string
	DiscordRedirect        string
	IngestSecret           string
	CORSOrigins            []string
	ShutdownTimeout        time.Duration
	Env                    Env
	RequireDatabase        bool
	Discord                DiscordConfig
	Agent                  AgentConfig
}

func FromEnv() (Config, error) {
	envName := env("CHRONICLER_ENV", string(EnvDevelopment))
	switch Env(envName) {
	case EnvDevelopment, EnvTest, EnvStaging, EnvProduction:
	default:
		return Config{}, fmt.Errorf("unknown CHRONICLER_ENV")
	}
	timeout, err := durationEnv("SHUTDOWN_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}
	requireDB := Env(envName) == EnvProduction || envTruthy("REQUIRE_DATABASE")
	return Config{
		PlatformOwnerMemberID:  os.Getenv("PLATFORM_OWNER_MEMBER_ID"),
		PlatformOwnerDiscordID: os.Getenv("PLATFORM_OWNER_DISCORD_ID"),
		Addr:                   env("API_ADDR", ":8080"),
		DatabaseURL:            env("DATABASE_URL", "postgres://chronicler:chronicler@127.0.0.1:5432/chronicler?sslmode=disable&pool_max_conns=10"),
		JWTSecret:              env("JWT_SECRET", defaultJWTSecret),
		DiscordClientID:        os.Getenv("DISCORD_CLIENT_ID"),
		DiscordSecret:          os.Getenv("DISCORD_CLIENT_SECRET"),
		DiscordRedirect:        env("DISCORD_REDIRECT_URI", "http://localhost:8080/auth/discord/callback"),
		IngestSecret:           os.Getenv("INGEST_SECRET"),
		CORSOrigins:            splitCSV(env("CORS_ORIGINS", "http://localhost:5173")),
		ShutdownTimeout:        timeout,
		Env:                    Env(envName),
		RequireDatabase:        requireDB,
		Discord: DiscordConfig{
			BotToken:                os.Getenv("DISCORD_BOT_TOKEN"),
			GuildID:                 os.Getenv("GUILD_ID"),
			AnnounceChannelFallback: os.Getenv("DISCORD_ANNOUNCE_CHANNEL_ID"),
			DeliveryDryRun:          envTruthy("DISCORD_DELIVERY_DRY_RUN"),
		},
		Agent: AgentConfig{
			InlineComplete: envTruthy("AGENT_INLINE_COMPLETE"),
		},
	}, nil
}

// ValidateProduction requires production credentials and 32-character machine secrets.
// Errors name the variable, never its value.
func (c Config) ValidateProduction() error {
	if c.Env != EnvDevelopment && c.Env != EnvTest && c.JWTSecret == defaultJWTSecret {
		return fmt.Errorf("refusing to start: unset or development-default JWT_SECRET")
	}
	if c.Env != EnvProduction {
		return nil
	}
	if bad := c.productionMissing(); len(bad) > 0 {
		return fmt.Errorf("refusing to start in production: unset or development-default %s", strings.Join(bad, ", "))
	}
	return nil
}

func (c Config) productionMissing() []string {
	var bad []string
	if c.DiscordSecret == "" || c.DiscordSecret == "dev" {
		bad = append(bad, "DISCORD_CLIENT_SECRET")
	}
	if c.DiscordClientID == "" {
		bad = append(bad, "DISCORD_CLIENT_ID")
	}
	if utf8.RuneCountInString(c.JWTSecret) < 32 {
		bad = append(bad, "JWT_SECRET")
	}
	if utf8.RuneCountInString(c.IngestSecret) < 32 {
		bad = append(bad, "INGEST_SECRET")
	}
	if c.Discord.BotToken == "" {
		bad = append(bad, "DISCORD_BOT_TOKEN")
	}
	if c.Discord.GuildID == "" {
		bad = append(bad, "GUILD_ID")
	}
	if c.DiscordRedirect == "" || isLoopbackURL(c.DiscordRedirect) {
		bad = append(bad, "DISCORD_REDIRECT_URI")
	}
	if len(c.CORSOrigins) == 0 || hasLoopbackOrigin(c.CORSOrigins) {
		bad = append(bad, "CORS_ORIGINS")
	}
	if c.Discord.DeliveryDryRun {
		bad = append(bad, "DISCORD_DELIVERY_DRY_RUN")
	}
	if c.Agent.InlineComplete {
		bad = append(bad, "AGENT_INLINE_COMPLETE")
	}
	return bad
}

func hasLoopbackOrigin(origins []string) bool {
	for _, origin := range origins {
		if isLoopbackURL(origin) {
			return true
		}
	}
	return false
}

func isLoopbackURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return true
	}
	host := u.Hostname()
	if host == "localhost" || host == "0.0.0.0" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
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

func durationEnv(key string, fallback time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	if ms, err := strconv.Atoi(v); err == nil {
		return time.Duration(ms) * time.Millisecond, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return d, nil
}

type DiscordOwnerLookup func(context.Context, string) (memberID string, err error)

func validateDiscordOwnerID(id string) error {
	if len(id) < 17 || len(id) > 20 {
		return fmt.Errorf("invalid PLATFORM_OWNER_DISCORD_ID")
	}
	for i := 0; i < len(id); i++ {
		if id[i] < '0' || id[i] > '9' {
			return fmt.Errorf("invalid PLATFORM_OWNER_DISCORD_ID")
		}
	}
	return nil
}

func lookupConfiguredDiscordOwner(ctx context.Context, id string, lookup DiscordOwnerLookup) (string, error) {
	if lookup == nil {
		return "", fmt.Errorf("configured Discord owner requires member lookup")
	}
	memberID, err := lookup(ctx, id)
	if err != nil {
		return "", fmt.Errorf("configured owner must resolve active: %w", err)
	}
	parsed, err := uuid.Parse(memberID)
	if err != nil || parsed.String() != memberID {
		return "", fmt.Errorf("configured Discord owner lookup returned invalid member identity")
	}
	return memberID, nil
}

// Validate checks trusted startup configuration and returns its resolved owner UUID.
func (c Config) Validate(ctx context.Context, resolve auth.AuthorityResolver, lookup DiscordOwnerLookup) (string, error) {
	ownerID := c.PlatformOwnerMemberID
	if ownerID != "" {
		parsed, err := uuid.Parse(ownerID)
		if err != nil || parsed.String() != ownerID {
			return "", fmt.Errorf("invalid PLATFORM_OWNER_MEMBER_ID")
		}
	}
	if id := c.PlatformOwnerDiscordID; id != "" {
		if err := validateDiscordOwnerID(id); err != nil {
			return "", err
		}
		memberID, err := lookupConfiguredDiscordOwner(ctx, id, lookup)
		if err != nil {
			return "", err
		}
		if ownerID != "" && ownerID != memberID {
			return "", fmt.Errorf("configured owner identity mismatch")
		}
		ownerID = memberID
	}
	if ownerID == "" {
		return "", nil
	}
	if resolve == nil {
		return "", fmt.Errorf("configured owner requires live authority resolver")
	}
	actor, err := resolve(ctx, ownerID)
	if err != nil {
		return "", fmt.Errorf("configured owner must resolve active: %w", err)
	}
	if actor.Claims().MemberID != ownerID {
		return "", fmt.Errorf("configured owner authority mismatch")
	}
	return ownerID, nil
}
