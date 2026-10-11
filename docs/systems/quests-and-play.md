# A quest is a five-state machine with two owners, and its written record outlives both

**Map:** [systems.md](/docs/systems.md)

## What it is

The lifecycle is an explicit, named state machine, not an implicit one inferred from

## Interfaces

| Interface                                            | Role                    |
| ---------------------------------------------------- | ----------------------- |
| [discord-sensor](/docs/interfaces/discord-sensor.md) | Announce owned by API   |
| [graphql-schema](/docs/interfaces/graphql-schema.md) | Quest mutations/queries |

## Implemented by

| App            | Local docs                               |
| -------------- | ---------------------------------------- |
| `apps/api`     | [apps/api/docs/](/apps/api/docs)         |
| `apps/web`     | [apps/web/docs/](/apps/web/docs)         |
| `apps/discord` | [apps/discord/docs/](/apps/discord/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/quests-and-play.md](/docs/requirements/by-system/quests-and-play.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/quests-and-play.md` (gitignored).
