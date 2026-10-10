#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
db_url="${DATABASE_URL:-postgres://chronicler:chronicler@127.0.0.1:5432/chronicler?sslmode=disable}"
if ! command -v goose >/dev/null 2>&1; then
  echo "goose not found; install: go install github.com/pressly/goose/v3/cmd/goose@latest" >&2
  exit 1
fi
goose -dir "$root/db/migrations" postgres "$db_url" "$@"
