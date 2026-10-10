#!/usr/bin/env bash
# Load db/seed/qa.jsonl.
# 1. Confirm Postgres accepts a connection.
# 2. Confirm goose_db_version matches the latest file in db/migrations.
# 3. Insert the JSONL. Re-runs do not duplicate rows.
# DATABASE_URL defaults to local Postgres.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
export DATABASE_URL="${DATABASE_URL:-postgres://chronicler:chronicler@127.0.0.1:5432/chronicler?sslmode=disable}"
go run ./cmd/seedqa -file db/seed/qa.jsonl -migrations db/migrations
