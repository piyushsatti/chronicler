# D1: Discord announce ownership

**Status:** decided 2026-07-15
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [discord-sensor](/docs/interfaces/discord-sensor.md)

## Context

The API already announced quests. Epic work assumed the bot would post and write refs back. That contradiction had to be resolved before announce work could ship.

## Decision

> Backend owns all (no bot). Backend keeps announce and extends it to create the Discord scheduled event server-side and write its own `discord_event_id` + `event_url`. Bot stays read-only. Write-back mutations for Discord refs are rejected.

(Owner ruling preserved from epic #137 decision text.)

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Bot owns announce | Requires bot write auth and splits announce ownership |
| Bot adds event + writes refs only | Still gives the bot a write path; rejected |

## Consequences

Announce and scheduled-event creation live only on the API. The Discord app is a sensor. `announceError` (or equivalent) carries per-leg failure without raising.

## Enforced by

**not enforced** — no CI gate that the Discord app cannot call announce APIs. See [discord-sensor](/docs/interfaces/discord-sensor.md).

## Reopen triggers

The bot is granted announce or scheduled-event write capability, or Discord becomes a source of authoritative campaign facts.
