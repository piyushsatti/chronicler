# D27: One Session Per Request

**Status:** decided 2026-07-28; **superseded 2026-07-30** for session shape (see below)
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [session-audience](/docs/interfaces/session-audience.md)

## Context

`with_resolver_session` opened an isolated session per call (~8 connections per hot page vs pool 15). The "~330 ms GraphQL floor" measured as TCP+TLS setup, not engine work; Postgres execution ~0.033 ms. Binding scarce resource: **pooled connections**, not milliseconds. Closes AUTH-7's deferred gateway trigger (pre-resolution cost was connection setup).

## Decision

**2026-07-28 (superseded):** one database session per GraphQL request; sibling resolvers serialize on an `asyncio.Lock` (unit of work). Delete `session_maker` from context so the per-resolver branch cannot revive. DataLoader batch functions must receive the session and **never** call `with_resolver_session` (non-reentrant lock).

**2026-07-30 (binding):** session-per-task, **no lock** — task-reentrant lock still deadlocked against real Strawberry DataLoaders. Every resolver field, DataLoader batch, and look-ahead prefetch opens its own session via `with_resolver_session`. Authoritative requirement: [serving-a-request R1](/docs/requirements/by-system/serving-a-request.md) (requirements).

**Still binding from 2026-07-28:** size `pool_size` / `max_overflow` explicitly; honor batching decisions (`GQL-SQL-3` etc.) — serialization made query reduction latency-critical; connection budget remains the ceiling. Supavisor transaction mode (6543) deferred until pool waits or backend limits approach (API + scheduler + operator CLI spenders).

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Session per resolver (status quo) | Couples page complexity to connection count; ~2 concurrent detail views before pool exhaustion |
| Query cost / depth limits alone | Guards a resource measurement shows is not scarce (ms-level query cost) |
| Gateway for AUTH-7 before measuring | Floor was connection setup; gateway pays it too |
| Keep one-session + lock after DataLoader deadlock | Hang is production-fatal; lock is not reentrant |
| Transaction-mode pooler without trigger | Session-per-request reduced waste; move when waits appear |

## Consequences

[D12](/docs/decisions/D12-Scope-Predicate-At-The-Session.md) attaches to whichever session shape is live — one listener per session opened, not one per request. [D26](/apps/api/docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md) eager loads stay inside aggregates on the session that holds the predicate.

## Enforced by

`with_resolver_session` / context wiring; explicit pool settings in `db/session.py`.

## Reopen triggers

- Pool waits in production.
- Resolver measured holding DB work during slow non-DB work.
- Surface opened to untrusted clients (revisit depth limits).

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
