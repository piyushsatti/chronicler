#!/usr/bin/env bash
# Proof for the quest loop (local and CI). Requires Postgres + goose/psql + bun.
set -euo pipefail

api_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$api_dir/../.." && pwd)"
cd "$api_dir"

export DATABASE_URL="${DATABASE_URL:-postgres://chronicler:chronicler@127.0.0.1:5432/chronicler?sslmode=disable}"

if command -v goose >/dev/null 2>&1; then
  goose -dir "$api_dir/db/migrations" postgres "$DATABASE_URL" up
else
  go run github.com/pressly/goose/v3/cmd/goose@v3.24.1 -dir "$api_dir/db/migrations" postgres "$DATABASE_URL" up
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$api_dir/db/seed/local.sql"

go run github.com/sqlc-dev/sqlc/cmd/sqlc generate
git -C "$repo" diff --exit-code -- apps/api/internal/platform/dbgen

( cd "$repo" && scripts/merge-graphql-schema )
git -C "$repo" diff --exit-code -- packages/contracts/schema.graphql

go test ./...
go test -tags=integration ./test/integration/... ./internal/quest/...

( cd "$repo/apps/discord" && bun test )
