package config

import (
	"strconv"
	"strings"
	"testing"
)

func validProd() Config {
	return Config{Env: "production", DiscordSecret: "s", DiscordClientID: "c", JWTSecret: strings.Repeat("j", 32), IngestSecret: strings.Repeat("i", 32)}
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
					c.Env = "development"
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
