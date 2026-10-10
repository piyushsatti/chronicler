# Discord bot

**Map:** [systems.md](/docs/systems.md)

## What it is

Post-#300 the bot is a pure activity sensor: zero commands, zero interaction router, zero DB access, zero GraphQL client. It listens to 3 gateway events and POSTs them to one REST endpoint.

## Interfaces

| Interface | Role |
| --- | --- |
| [discord-sensor](/docs/interfaces/discord-sensor.md) | Bot is a sensor |
| [discord-ingest](/docs/interfaces/discord-ingest.md) | Observation forward path |

## Implemented by

| App | Local docs |
| --- | --- |
| `apps/discord` | [apps/discord/docs/](/apps/discord/docs) |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/discord-bot.md](/docs/requirements/by-system/discord-bot.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/discord-bot.md` (gitignored).
