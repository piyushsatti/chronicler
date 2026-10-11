# API database

Postgres schema for Chronicler. **Migrations are the schema** — read `migrations/0001_init.sql` for the live DDL and its header conventions.

| Path             | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `migrations/`    | Goose SQL migrations (greenfield; no Alembic history) |
| `seed/`          | Local/preview fixtures (`local.sql`)                  |
| `queries/`       | sqlc query sources                                    |
| [`docs/`](docs/) | Why / patterns / table inventory                      |

Canonical convention text also lives in the header of `migrations/0001_init.sql`. Design rationale and naming patterns are expanded under [`docs/`](docs/) — start at [`docs/README.md`](docs/README.md).

## Migrate

Requires [goose](https://github.com/pressly/goose) and `DATABASE_URL` (see `apps/api/.env.example`).

```bash
# from apps/api
./scripts/migrate.sh up
./scripts/migrate.sh status
./scripts/migrate.sh down   # rolls back one step
```

Wrapper: `scripts/migrate.sh` → `goose -dir db/migrations postgres "$DATABASE_URL" …`.

Default URL if unset: `postgres://chronicler:chronicler@127.0.0.1:5432/chronicler?sslmode=disable`.

Tooling choice: [D42](../docs/decisions/D42-Worker-And-Migrations.md).

## Tests

Integration tests (`go test -tags=integration …`) start Postgres with testcontainers, run goose + seed themselves. Docker required; no compose DB. See [`internal/platform/dbtest`](../internal/platform/dbtest).

## Seed (local)

After migrate, apply fixtures (safe to re-run; pins stable `public_id`s):

```bash
psql "$DATABASE_URL" -f db/seed/local.sql
```

Seed resolves FKs via `public_id` / natural-key subqueries — never hard-code internal `id`.

## QA / UI fixture

[`seed/qa.jsonl`](seed/qa.jsonl) is a varied world for looking at the UI: codex entries across Entities, Locations, Feature, Rules, and Lore, plus other document kinds, members and DMs, characters, quests, and the Lightfall Coast map. It is not the integration-test seed (`local.sql` stays small).

```bash
# from apps/api, after migrate
./scripts/load-qa.sh
```

The script checks that Postgres is reachable and that `goose_db_version` matches the latest file in `db/migrations`, then loads the JSONL. Each line is `{table, conflict, refs, row}`. `refs` point at another row's `public_id`. `ON CONFLICT DO NOTHING`, so loading twice does not duplicate rows.

Regenerate the file from the built-in world with `go run ./cmd/seedqa -write`.

## Dual-key (one-liner)

| Column      | Role                                                                |
| ----------- | ------------------------------------------------------------------- |
| `id`        | `BIGINT` identity PK; **all FKs**; never in URLs or client payloads |
| `public_id` | `UUID`; only identifier the HTTP/GraphQL layer may accept or emit   |

Full rules: [`docs/design.md`](docs/design.md), [`docs/patterns.md`](docs/patterns.md).
