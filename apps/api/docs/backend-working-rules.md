# Backend working rules

Working discipline for the Go API and worker in `apps/api`. [AGENTS.md](/AGENTS.md) owns the repository rules; current code and the accepted decisions below supersede imported Python implementation guidance.

## Transport and layer boundaries

```text
POST /v1/graphql (product query or mutation) → handler/resolver → command/query → repository → sqlc/pgx
Retained HTTP (auth, health, Discord ingest/heartbeat, agent Q&A) → protocol handlers → services (not product REST commands)
```

- Follow [D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md): **product** reads and business commands use GraphQL only; retained HTTP covers authentication, health, Discord observation ingest/heartbeat, and agent question protocols — not a second product command surface. Routing authority is [field-routing.md](/packages/contracts/field-routing.md) (converging toward D40), with wire shapes in [OpenAPI](/packages/contracts/openapi.yaml) and the contract SDL.
- GraphQL resolvers and HTTP protocol handlers decode and validate input, establish caller authority, call a command/query, and map its result. Domain rules and transaction orchestration belong in the owning slice.
- New API code belongs under `apps/api/internal/`. The [quest commands](/apps/api/internal/quest/command.go) and [repository interface](/apps/api/internal/quest/repository.go) demonstrate the transaction boundary; their presence does not certify every quest behavior as complete.

## Commands own one transaction

A command executes related writes through [uow.Runner.Do](/apps/api/internal/platform/uow/uow.go). The [pgx runner](/apps/api/internal/platform/db/db.go) binds repositories to one transaction, commits when the callback returns nil and rolls back otherwise. Repositories never commit; handlers do not add a second commit. Return each write failure from the callback so it cannot commit partial work.

Aggregate changes, their history and durable job enqueue belong in the same transaction when they form one command. Run remote HTTP/model work outside that transaction. Read-only paths do not mutate state. Memory implementations are local/test substitutes and do not prove Postgres persistence or concurrency.

## Expected failures are values

Keep [D25's expected-failure principle](/apps/api/docs/decisions/D25-Expected-Failures-Are-Values.md), translated to Go: return typed values from the shared [apierr vocabulary](/apps/api/internal/platform/apierr/apierr.go). Product GraphQL maps them to `errors.extensions.code` per [graphql-contract.md](/apps/api/docs/graphql-contract.md); retained HTTP protocol handlers use `apierr.Write` for `application/problem+json`. Unexpected errors become opaque 500 responses. Imported D25 Python dataclasses and pyright details do not prescribe the current Go surface.

Validate request shape and domain constraints at their owning boundaries. Do not treat an ignored error or zero affected rows as a successful state transition. Authentication and authorization remain explicit; public serialization must respect audience rules such as [session-audience](/docs/interfaces/session-audience.md).

## Database and background work

- [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md) selects fresh Postgres and Goose. SQL migrations in `apps/api/db/migrations` define schema; queries in `apps/api/db/queries` generate `internal/platform/dbgen` through [sqlc configuration](/apps/api/sqlc.yaml). Change source inputs and regenerate; do not hand-edit generated files.
- Use pgx repositories and explicit transactions. Do not copy SQLAlchemy session/flush/commit patterns into Go. Squashed map model is **pointcrawl-only** ([owner-decisions](/docs/audits/owner-decisions.md) **C3**); JSONB is used where the schema allows flexible data.
- Preserve append-only history where an aggregate defines it ([D16](/apps/api/docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md)). The current backend also persists aggregate state directly; a universal event-replay source-of-truth claim is not an as-built rule.
- The worker loop (`internal/workerrun`, started by `cmd/api`; `cmd/worker` is a standalone wrapper) owns Discord delivery and scheduled jobs. [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md) and [agent-qa-http](/docs/interfaces/agent-qa-http.md) give the API durable question ownership and the Python agent HTTP claim/complete; the model stays in `apps/agent`.
- [D44](/apps/api/docs/decisions/D44-Leased-Work-With-Fencing.md) gives `background_jobs` sole lifecycle authority, post-lock clock sampling, expiry/reclaim and receipt-fenced completion. [Background work](/apps/api/docs/background-work.md) records budgets and limits. Validate recovery against disposable Postgres and the actual consumer; source implementation alone is not execution evidence.

Discord gateway events arrive through the bot forwarding to the API ingest path. Interfaces: [discord-ingest](/docs/interfaces/discord-ingest.md), [discord-sensor](/docs/interfaces/discord-sensor.md).

## Verification

- Test domain behavior directly with Go tests and adapter/contract tests at the wire boundary. Test persistence, atomicity, locking and recovery against an explicitly admitted disposable Postgres database; a fake store is not that evidence.
- Follow [README verification commands](/README.md) and [contribution gates](/CONTRIBUTING.md). Repository instructions require `scripts/verify` for covered app changes and `python3 scripts/docs-lint.py` for documentation.
- Report each executed check and any skipped or unavailable database/service lane separately. A passing unit suite or route-registration test does not establish behavioral parity, recovery or live service effectiveness.

## Accepted product cutover

The [product GraphQL design](/apps/api/docs/design/graphql-product/README.md) defines the accepted future services, physical storage and verification obligations. Existing useful code remains until its exclusive scheduled owner replaces or retires it. Comment-only placeholders are not implementations. [Generation order](/apps/api/docs/design/graphql-product/generation-order-contract.md) requires actual providers before controlled code generation.
