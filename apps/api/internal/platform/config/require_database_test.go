package config

import "testing"

func TestFromEnvProductionSetsRequireDatabase(t *testing.T) {
	t.Setenv("CHRONICLER_ENV", "production")
	t.Setenv("REQUIRE_DATABASE", "")
	cfg, err := FromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.RequireDatabase {
		t.Fatal("expected RequireDatabase when CHRONICLER_ENV=production")
	}
}
