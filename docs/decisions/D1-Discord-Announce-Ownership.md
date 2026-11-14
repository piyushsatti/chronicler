# D1: Discord announce ownership

**Status:** decided 2026-07-15; amended 2026-11-14
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [discord-sensor](/docs/interfaces/discord-sensor.md)

## Context

The API already announced quests. Epic work assumed the bot would post and write refs back. That contradiction had to be resolved before announce work could ship.

## Decision

> Backend owns all (no bot). Backend keeps announce and extends it to create the Discord scheduled event server-side and write its own `discord_event_id` + `event_url`. Bot stays read-only. Write-back mutations for Discord refs are rejected.

(Owner ruling preserved from epic #137 decision text.)

**2026-11-14 amendment:** "Read-only" means the bot never announces quests, never creates or edits scheduled events, and never authors campaign facts. It writes Discord messages only on the opt-in agent path (`AGENT_ENABLED`), where it replies to the member who asked. Each bot capability is a declared route ([D19](/docs/decisions/D19-Machine-Principals.md)); today the bot calls four: `POST /v1/ingest/discord-event`, `POST /v1/ingest/heartbeat`, `POST /v1/agent/questions` and `GET /v1/agent/questions/{id}`. Announce and scheduled-event ownership are unchanged.

## Alternatives rejected

| Alternative                       | Why not                                               |
| --------------------------------- | ----------------------------------------------------- |
| Bot owns announce                 | Requires bot write auth and splits announce ownership |
| Bot adds event + writes refs only | Still gives the bot a write path; rejected            |

## Consequences

Announce and scheduled-event creation live only on the API. The Discord app is a sensor. `announceError` (or equivalent) carries per-leg failure without raising.

## Enforced by

[sensor.test.ts](/apps/discord/tests/unit/interface/sensor.test.ts) fails if the Discord app calls announce, scheduled-event, GraphQL, or database APIs. See [discord-sensor](/docs/interfaces/discord-sensor.md).

## Reopen triggers

The bot is granted announce or scheduled-event write capability, or Discord becomes a source of authoritative campaign facts.
