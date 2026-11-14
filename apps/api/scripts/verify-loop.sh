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

# Frontend documents are outside the Go module and its test cache inputs.
go test -count=1 ./internal/graph -run '^TestFrontendOperationsMatchServerGraphQLValidator$'

go test ./...
# -tags=integration: Postgres via testcontainers (needs Docker daemon).
# cmd/api is the mounted production-chain lane; keep it here so a new migration cannot rot outside CI.
go test -tags=integration ./test/integration/... ./internal/quest/... ./internal/document/... ./cmd/api/
