# API

Go GraphQL and REST backend for Chronicler (`github.com/piyushsatti/chronicler/apps/api`).

## Layout

| Path                                                                                   | Purpose                                                                                                                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `cmd/api`                                                                              | HTTP process                                                                                                                            |
| `cmd/worker`                                                                           | Standalone wrapper for the worker loop (`internal/workerrun`, also run inside `cmd/api`) — see [docs/worker-env.md](docs/worker-env.md) |
| `internal/platform/`                                                                   | Shared engine (auth, errors, uow, http, graphql, jobs)                                                                                  |
| `internal/{site,member,document,spatial,character,quest,login,ingest,agent,delivery}/` | Slices                                                                                                                                  |
| `internal/graph/`                                                                      | gqlgen output                                                                                                                           |
| [`db/`](db/)                                                                           | Postgres: goose migrations, seed, [schema docs](db/docs/)                                                                               |
| `db/queries`                                                                           | sqlc queries                                                                                                                            |
| `docs/`                                                                                | Design notes and local decisions                                                                                                        |

## Local

```bash
# from repo root
docker compose -f deploy/compose.yaml up -d postgres
cd apps/api
go test ./...
go run ./cmd/api
```

Health: `GET /health`. GraphQL placeholder: `POST /v1/graphql`. Dev login: `POST /auth/discord/callback` with `{"code":"dev:<discordId>"}` when `DISCORD_CLIENT_SECRET=dev`.

### Live product Discord delivery (opt-in)

Default `go test` skips live network. With `chronicler-dev` up (`scripts/dev-stack`):

```bash
CHRONICLER_LIVE_GRAPHQL_DISCORD=1 \
CHRONICLER_LIVE_API_URL=http://127.0.0.1:8080 \
CHRONICLER_LIVE_JWT_SECRET=local-test-only-jwt-secret \
go test ./internal/delivery/ -run LiveProductDiscordDelivery -count=1
```

API-owned GraphQL only (`discordDeliveryMode`, `syncQuestDiscord`, `redriveDiscordDelivery`). Does not go through the Discord bot (D1).

## Contract

- GraphQL: `packages/contracts/graphql/`
- REST: `packages/contracts/openapi.yaml`
- Routing: `packages/contracts/field-routing.md`

Drift checks (no Discord / no Postgres):

```bash
cd apps/api
go test ./test/contract/...
```

These assert OpenAPI ↔ mux registration and GraphQL `_roots.graphql` ↔ gqlgen schema/resolvers (see [graphql-contract.md](docs/graphql-contract.md)).
CI also fails on sqlc/gqlgen generate drift (`sqlc generate` / `gqlgen generate` + `git diff --exit-code`) and merged `schema.graphql` drift — see `.github/workflows/api.yml`.

## Quest reads

The generic GraphQL `quests` read implements machine `status`, derived
`displayStatus`, and inclusive `scheduledFrom`/`scheduledTo` bounds. Status
strings are case-insensitive. A provided invalid or empty machine status returns
an empty list; otherwise a supplied display filter takes precedence over the
machine filter. Empty or unknown display labels also return empty. Generic
results order by scheduled time and public UUID ascending, recovering the legacy
list order. Total counts all matches before pagination, including when limit is
zero or offset is past the end; count and page share one SQL statement.

Migration `0002_quest_display_status.sql` adds the nonmaterialized CQRS read
projection shared by lists and ID/code details. It labels open/full quests live
from scheduled start (inclusive) to the actual duration end (exclusive), then
open quests with filled seats as filling, future full quests as scheduled, and
otherwise preserves machine status. Reads return the stored duration, including
fractional hours. They do not change machine state, signup rules or delivery.
Unconfigured list producers and database failures propagate through the opaque
GraphQL error presenter instead of looking like an empty population.

Remaining migration gaps: the other declared generic filters are not yet
implemented; questBoard still uses open-only/newest-first rather than the legacy
open+full/ascending feed; board region and recentlyClosed region/closedSince are
still ignored. RecentlyClosed remains closed-only/newest-first (the historical
closedSince lower bound concerned scheduled time, not a close timestamp).
Details still swallow lookup errors at their root resolver. Placeholder rich
fields, accepting-DM reads, signup and settlement remain separate work. Public
quest metadata never grants access to its brief: the linked document resolver
continues applying document audience and body projection.
