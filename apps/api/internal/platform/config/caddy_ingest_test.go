package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCaddyBlocksOnlyPublicIngestRoutes(t *testing.T) {
	body, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "deploy", "Caddyfile"))
	if err != nil {
		t.Fatal(err)
	}
	config := string(body)
	const block = "\t@ingest path /v1/ingest/*\n\trespond @ingest 404\n"
	if strings.Count(config, block) != 1 || strings.Index(config, block) > strings.Index(config, "\treverse_proxy ") {
		t.Fatal("public ingest rejection must precede reverse_proxy")
	}
	const previous = `# TLS reverse proxy for the production stack (compose profile ` + "`tls`" + `).
# {$API_DOMAIN} is passed by deploy/compose.production.yaml; Caddy obtains and
# renews the Let's Encrypt certificate automatically.
{$API_DOMAIN} {
	encode zstd gzip
	reverse_proxy chronicler-api:8080
}
`
	if strings.Replace(config, block, "", 1) != previous {
		t.Fatal("Caddy directives outside the ingest rejection changed")
	}
}
