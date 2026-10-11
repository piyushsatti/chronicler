# D23: One work table; out-of-band alerts

**Status:** decided 2026-07-28
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [work-queue-durability](/docs/interfaces/work-queue-durability.md)

## Context

Older intent put durable replay on the bot. The bot container has no durable volume, so bot-side durability is impossible. Failed ingests, DDB sync, and similar work needed one owned durability path, and alerts must not die with the process they watch.

## Decision

- The API owns durability in one Postgres work table (kinds for dead-letter ingest, DDB sync, and later retryable work).
- The bot keeps in-memory/local retry as a **transport buffer** only.
- Events missed while offline are recovered via a high-water mark on stored activity, not a second queue.
- Operator alerts use an out-of-band Discord webhook (not the bot process). Owner ruled 2026-07-28, overruling the prior “backend keeps no dead-letter store” fold.

## Alternatives rejected

| Alternative              | Why not                                                   |
| ------------------------ | --------------------------------------------------------- |
| Bot-local durable SQLite | Destroyed on redeploy; second backup story                |
| Message broker           | Extra ops surface; Postgres already present and backed up |

## Consequences

One durability mechanism; alert path survives bot death; simultaneous bot+API outage may lose in-flight activity counters (accepted).

## Enforced by

**not enforced** — work table / worker contract tests not named in CI. Design detail: `apps/api/docs/` (background work). Bot forwarding: [activity](/apps/discord/docs/activity.md).

## Reopen triggers

More than one API replica without revisiting locking; event volume makes Postgres queue contention measurable; bot gains a second durable consumer; Discord ships activity over HTTP webhooks removing the bot’s reason to exist.
