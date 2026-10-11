# D42: Worker Ownership and Migrations Tool

**Status:** decided 2026-10-09
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** `apps/api/cmd/worker`, `apps/api/db/migrations`

## Context

Discord delivery and scheduled jobs (reconcile, game-time fill, idempotency purge) ran outside the Python API process. The Go port needs one owner for the worker and one migrations tool. Postgres starts fresh; there is no production Alembic history to carry.

## Decision

- **`apps/api/cmd/worker`** owns Discord delivery (desired-revision pattern) and the scheduled jobs. It is a separate binary from `cmd/api`, same module.
- **Migrations tool is [goose](https://github.com/pressly/goose).** SQL files live in `apps/api/db/migrations`, one file per aggregate root where practical.
- **Agent questions:** `internal/agent` in the API owns the job table and HTTP routes (`POST`/`GET /v1/agent/questions`). `apps/agent` is the worker that answers them; the API does not embed the model.

## Alternatives rejected

| Alternative                   | Why not                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Atlas                         | Goose is SQL-first and matches the "migrations are the schema" rule with less ceremony |
| Worker inside the API process | Blocks HTTP under Discord rate limits; old design already separated them               |
| API embeds the agent model    | Violates the apps/agent boundary                                                       |

## Consequences

Compose runs `api` and `worker`. Staging and production run both. Agent routes enqueue work for `apps/agent` over HTTP claim/complete ([D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md)); no RabbitMQ.

## Enforced by

Compose and CI must start both binaries. Migrations apply in CI before tests.

## Reopen triggers

A second job store is introduced, or agent answering moves into the API process.
