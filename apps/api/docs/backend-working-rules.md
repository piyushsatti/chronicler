# Backend working rules

As-built backend discipline for `apps/api`. Session commit footgun summarized in [AGENTS.md](/AGENTS.md).

## Layer boundaries (target)

```text
GraphQL adapter → service → repo → ORM
```

- GraphQL modules are thin adapters: no raw SQLAlchemy queries; types map from ORM instances via `from_orm()` static methods.
- Services own business logic and write orchestration; they do not commit.
- Repos: one per aggregate root, flush only, return ORM model instances directly.
- New work follows the target under `apps/api/src/pi/chronicler/api/`. Quest is the reference vertical slice.

## Sessions commit explicitly (the footgun)

`get_session()` does not auto-commit. Every write-path GraphQL resolver or FastAPI router must call `await session.commit()` before returning, or rows are flushed but never persisted. Read resolvers never commit.

Related interface: [session-audience](/docs/interfaces/session-audience.md).

## Pydantic at every boundary

Raw input → parsed shape → ORM/read model → API output. Never skip a layer.

## Event sourcing

Events are append-only. Current state is computed by replaying events. Materialized views are a read optimization, never the source of truth.

## Database conventions

- SQLAlchemy 2.0 async style only, sessions via `async_session_maker`.
- Hex coordinates are plain axial integer columns (`atlas_id`, `q`, `r`). No PostGIS in the product model.
- JSONB holds flexible metadata where the schema allows it.
- Append-only ledger tables record history (see API-local [D16](/apps/api/docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md)).

## Testing

- pytest-asyncio throughout; test DB fixtures roll back transactions between tests.
- Repo tests run against real Postgres, never mocked storage.
- Never mock domain logic; test it directly.

## Ingest

Discord gateway events arrive through the bot forwarding to the API ingest path. Interfaces: [discord-ingest](/docs/interfaces/discord-ingest.md), [discord-sensor](/docs/interfaces/discord-sensor.md).
