#!/usr/bin/env bash
# Proof for the quest loop (local and CI).
# Integration tests start their own Postgres via testcontainers (Docker required).
# No pre-running DATABASE_URL is required.
set -euo pipefail

api_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$api_dir/../.." && pwd)"
cd "$api_dir"

go run github.com/sqlc-dev/sqlc/cmd/sqlc generate
git -C "$repo" diff --exit-code -- apps/api/internal/platform/dbgen

( cd "$repo" && scripts/merge-graphql-schema )
git -C "$repo" diff --exit-code -- packages/contracts/schema.graphql

go test ./...
# -tags=integration: Postgres via testcontainers (needs Docker daemon)
go test -tags=integration ./test/integration/... ./internal/quest/... ./internal/document/...

( cd "$repo/apps/discord" && bun test )
