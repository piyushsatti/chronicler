# API

Go GraphQL and REST backend for Chronicler (`github.com/piyushsatti/chronicler/apps/api`).

## Layout

| Path | Purpose |
| --- | --- |
| `cmd/api` | HTTP process |
| `cmd/worker` | Discord delivery and scheduled jobs — see [docs/worker-env.md](docs/worker-env.md) |
| `internal/platform/` | Shared engine (auth, errors, uow, http, graphql, jobs) |
| `internal/{site,member,document,spatial,character,quest,login,ingest,agent,delivery}/` | Slices |
| `internal/graph/` | gqlgen output |
| [`db/`](db/) | Postgres: goose migrations, seed, [schema docs](db/docs/) |
| `db/queries` | sqlc queries |
| `docs/` | Design notes and local decisions |

## Local

```bash
# from repo root
docker compose -f deploy/compose.yaml up -d postgres
cd apps/api
go test ./...
go run ./cmd/api
```

Health: `GET /health`. GraphQL placeholder: `POST /v1/graphql`. Dev login: `POST /auth/discord/callback` with `{"code":"dev:<discordId>"}` when `DISCORD_CLIENT_SECRET=dev`.

## Contract

- GraphQL: `packages/contracts/graphql/`
- REST: `packages/contracts/openapi.yaml`
- Routing: `packages/contracts/field-routing.md`

Drift checks (no Discord / no Postgres):

```bash
cd apps/api
go test ./test/contract/...
```

These assert OpenAPI ↔ mux registration and GraphQL `roots.graphql` ↔ gqlgen schema/resolvers.
CI also fails on sqlc/gqlgen generate drift (`sqlc generate` / `gqlgen generate` + `git diff --exit-code`) and merged `schema.graphql` drift — see `.github/workflows/api.yml`.
