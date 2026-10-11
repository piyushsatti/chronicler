# D19: Machine Principals

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [discord-ingest](/docs/interfaces/discord-ingest.md)

## Context

AUTH-3 asked what the Discord bot may do. AUTH-4 asked whether Postgres RLS separates principals. AUTH-7 asked where `resolve_authority` runs relative to a gateway.

## Decision

**AUTH-3 — closed capability set:** the bot has **one route**: `POST /ingest/v2/discord-event`, shared-secret (`X-Ingest-Secret`), append-only writes to idempotency/activity tables. **No GraphQL, no database credential, no domain logic in the bot.** New bot capability = **new declared route**, never widening this one. The bot is **not** a member principal ([D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md)).

**AUTH-4 — RLS unchanged, no policies:** RLS is default-deny with **zero policies**; app uses a superuser-equivalent DB role, so RLS does not separate API, bot, CLIs, or scheduler. **Application tier remains the enforcement point** ([D12](/docs/decisions/D12-Scope-Predicate-At-The-Session.md)). Do not build per-principal Postgres roles to answer AUTH-4.

**AUTH-7 — in-process now:** `resolve_authority` at GraphQL `get_context`. Gateway deferred until pre-resolution cost is understood (connection-setup floor corrected in [D27](/docs/decisions/D27-One-Session-Per-Request.md)). In-process choice does not foreclose a later gateway move.

Accepted limitation: shared secret can post activity for any Discord id; mitigated by append-only counters and single-bot fleet.

## Alternatives rejected

| Alternative                                    | Why not                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Postgres RLS policies as primary authorization | Requires per-principal DB roles not present; app already bypasses FORCEd RLS |
| Bot as member through Identify                 | Bot has no member row; conflates machine and human authority                 |
| Gateway before measuring GraphQL floor         | Floor was TCP/TLS setup; premature gateway adds forgeable trust boundary     |
| Operator secret header as bot gate             | Dead wiring; not adopted for AUTH-3                                          |

## Consequences

Ingest stays a single-purpose machine endpoint. Human and machine writers remain distinguished at the HTTP/GraphQL boundary.

## Enforced by

`ingest_auth` constant-time secret check; single ingest router surface.

## Reopen triggers

- Meaningful pre-resolution GraphQL cost measured → revisit gateway placement.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
