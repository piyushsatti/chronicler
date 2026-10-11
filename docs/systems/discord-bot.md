# Discord bot

**Map:** [systems.md](/docs/systems.md)

## What it is

The bot is primarily an activity sensor: no slash-command product surface, no DB access, no GraphQL client. It forwards gateway observations to ingest REST. Separately, when `AGENT_ENABLED=true`, an allowlisted mention path submits Q&A jobs over HTTP (see [agent-qa](/docs/systems/agent-qa.md)).

## Interfaces

| Interface                                            | Role                                 |
| ---------------------------------------------------- | ------------------------------------ |
| [discord-sensor](/docs/interfaces/discord-sensor.md) | Bot is a sensor                      |
| [discord-ingest](/docs/interfaces/discord-ingest.md) | Observation forward path             |
| [agent-qa-http](/docs/interfaces/agent-qa-http.md)   | Optional mention → API question path |

## Implemented by

| App            | Local docs                               |
| -------------- | ---------------------------------------- |
| `apps/discord` | [apps/discord/docs/](/apps/discord/docs) |
| `apps/api`     | [apps/api/docs/](/apps/api/docs)         |

## Requirements

R-ids for this system: [../requirements/by-system/discord-bot.md](/docs/requirements/by-system/discord-bot.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/discord-bot.md` (gitignored).
