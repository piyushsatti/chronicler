package config

import (
	"strings"
	"testing"
)

func validProd() Config {
	return Config{Env: "production", DiscordSecret: "s", DiscordClientID: "c", JWTSecret: "j", IngestSecret: "i"}
}

func TestValidateProduction(t *testing.T) {
	if err := validProd().ValidateProduction(); err != nil {
		t.Fatal(err)
	}
	dev := Config{Env: "development", DiscordSecret: "dev"}
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
