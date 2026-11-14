package config

import (
	"strconv"
	"strings"
	"testing"
)

func validProd() Config {
	return Config{
		Env:             EnvProduction,
		DiscordSecret:   "s",
		DiscordClientID: "c",
		JWTSecret:       strings.Repeat("j", 32),
		IngestSecret:    strings.Repeat("i", 32),
		DiscordRedirect: "https://app.example.com/auth/discord/callback",
		CORSOrigins:     []string{"https://app.example.com"},
		Discord: DiscordConfig{
			BotToken: "bot-token",
			GuildID:  "guild-id",
		},
	}
}

func TestValidateProductionRequiresStrongMachineSecrets(t *testing.T) {
	for _, variable := range []string{"JWT_SECRET", "INGEST_SECRET"} {
		for _, encoding := range []struct{ name, character string }{
			{"ASCII", "s"},
			{"multibyte", "é"},
		} {
			for _, length := range []int{31, 32} {
				t.Run(variable+"/"+encoding.name+"/"+strconv.Itoa(length), func(t *testing.T) {
					c := validProd()
					value := strings.Repeat(encoding.character, length)
					if variable == "JWT_SECRET" {
						c.JWTSecret = value
					} else {
						c.IngestSecret = value
					}
					err := c.ValidateProduction()
					if length == 32 {
						if err != nil {
							t.Fatalf("%s length %d: %v", variable, length, err)
						}
					} else {
						want := "refusing to start in production: unset or development-default " + variable
						if err == nil || err.Error() != want {
							t.Fatalf("%s length %d: err=%v", variable, length, err)
						}
						if strings.Contains(err.Error(), value) {
							t.Fatal("error leaks secret value")
						}
					}
					c.Env = EnvDevelopment
					if err := c.ValidateProduction(); err != nil {
						t.Fatal(err)
					}
				})
			}
		}
	}
}

func TestValidateProduction(t *testing.T) {
	if err := validProd().ValidateProduction(); err != nil {
		t.Fatal(err)
	}
	dev := Config{Env: EnvDevelopment, DiscordSecret: "dev", JWTSecret: defaultJWTSecret}
	if err := dev.ValidateProduction(); err != nil {
		t.Fatal(err)
	}
	for name, mut := range map[string]func(*Config){
		"DISCORD_CLIENT_SECRET": func(c *Config) { c.DiscordSecret = "dev" },
		"DISCORD_CLIENT_ID":     func(c *Config) { c.DiscordClientID = "" },
		"JWT_SECRET":            func(c *Config) { c.JWTSecret = "dev-only-change-me" },
		"INGEST_SECRET":         func(c *Config) { c.IngestSecret = "" },
	} {
		c := validProd()
		mut(&c)
		err := c.ValidateProduction()
		if err == nil || !strings.Contains(err.Error(), name) {
			t.Fatalf("%s: err=%v", name, err)
		}
		if strings.Contains(err.Error(), "dev-only-change-me") {
			t.Fatal("error leaks value")
		}
	}
}

func TestFromEnvAndValidateProductionTable(t *testing.T) {
	strong := strings.Repeat("j", 32)
	ingest := strings.Repeat("i", 32)
	setProdBase := func(t *testing.T) {
		t.Helper()
		t.Setenv("CHRONICLER_ENV", "production")
		t.Setenv("JWT_SECRET", strong)
		t.Setenv("INGEST_SECRET", ingest)
		t.Setenv("DISCORD_CLIENT_ID", "c")
		t.Setenv("DISCORD_CLIENT_SECRET", "s")
		t.Setenv("DISCORD_REDIRECT_URI", "https://app.example.com/auth/discord/callback")
		t.Setenv("CORS_ORIGINS", "https://app.example.com")
		t.Setenv("DISCORD_BOT_TOKEN", "bot-token")
		t.Setenv("GUILD_ID", "guild-id")
		t.Setenv("DISCORD_DELIVERY_DRY_RUN", "")
		t.Setenv("AGENT_INLINE_COMPLETE", "")
		t.Setenv("SHUTDOWN_TIMEOUT", "")
	}

	t.Run("prod", func(t *testing.T) {
		t.Setenv("CHRONICLER_ENV", "prod")
		if _, err := FromEnv(); err == nil {
			t.Fatal("expected unknown env error")
		}
	})
	t.Run("Production", func(t *testing.T) {
		t.Setenv("CHRONICLER_ENV", "Production")
		if _, err := FromEnv(); err == nil {
			t.Fatal("expected unknown env error")
		}
	})
	t.Run("staging default secret", func(t *testing.T) {
		t.Setenv("CHRONICLER_ENV", "staging")
		t.Setenv("JWT_SECRET", "")
		cfg, err := FromEnv()
		if err != nil {
			t.Fatal(err)
		}
		if err := cfg.ValidateProduction(); err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
			t.Fatalf("err=%v", err)
		}
	})
	t.Run("bad duration", func(t *testing.T) {
		t.Setenv("CHRONICLER_ENV", "development")
		t.Setenv("SHUTDOWN_TIMEOUT", "not-a-duration")
		if _, err := FromEnv(); err == nil {
			t.Fatal("expected duration error")
		}
	})
	for _, tc := range []struct {
		name string
		mut  func(*testing.T)
		want string
	}{
		{"missing bot token", func(t *testing.T) { t.Setenv("DISCORD_BOT_TOKEN", "") }, "DISCORD_BOT_TOKEN"},
		{"missing guild", func(t *testing.T) { t.Setenv("GUILD_ID", "") }, "GUILD_ID"},
		{"loopback CORS origin", func(t *testing.T) { t.Setenv("CORS_ORIGINS", "http://localhost:5173") }, "CORS_ORIGINS"},
		{"loopback redirect URI", func(t *testing.T) { t.Setenv("DISCORD_REDIRECT_URI", "http://localhost:8080/auth/discord/callback") }, "DISCORD_REDIRECT_URI"},
		{"dry-run on", func(t *testing.T) { t.Setenv("DISCORD_DELIVERY_DRY_RUN", "1") }, "DISCORD_DELIVERY_DRY_RUN"},
		{"inline-complete on", func(t *testing.T) { t.Setenv("AGENT_INLINE_COMPLETE", "1") }, "AGENT_INLINE_COMPLETE"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setProdBase(t)
			tc.mut(t)
			cfg, err := FromEnv()
			if err != nil {
				t.Fatal(err)
			}
			err = cfg.ValidateProduction()
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err=%v want %s", err, tc.want)
			}
		})
	}
}
