package config

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestDeployComposePassesPlatformOwner guards the deployed stacks: FromEnv
// reads both platform owner identifiers, so each api service must forward them
// from the host environment. An unset host value must stay empty (no owner),
// never a literal default.
func TestDeployComposePassesPlatformOwner(t *testing.T) {
	for _, name := range []string{"compose.production.yaml", "compose.staging.yaml"} {
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "deploy", name))
			if err != nil {
				t.Fatalf("read %s: %v", name, err)
			}
			var doc struct {
				Services map[string]struct {
					Environment map[string]string `yaml:"environment"`
				} `yaml:"services"`
			}
			if err := yaml.Unmarshal(raw, &doc); err != nil {
				t.Fatalf("parse %s: %v", name, err)
			}
			api, ok := doc.Services["api"]
			if !ok {
				t.Fatalf("%s has no api service", name)
			}
			for key, want := range map[string]string{
				"PLATFORM_OWNER_MEMBER_ID":  "${PLATFORM_OWNER_MEMBER_ID:-}",
				"PLATFORM_OWNER_DISCORD_ID": "${PLATFORM_OWNER_DISCORD_ID:-}",
			} {
				got, ok := api.Environment[key]
				if !ok {
					t.Fatalf("%s api service does not forward %s", name, key)
				}
				if got != want {
					t.Fatalf("%s api %s = %q, want %q", name, key, got, want)
				}
			}
		})
	}
}
