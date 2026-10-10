# Two crons run nightly, unwatched; D23's queue and alert path exist only on paper

**Map:** [systems.md](/docs/systems.md)

## What it is

What runs today runs alone. One `scheduler` container, `supercronic` reading a committed

## Interfaces

| Interface | Role |
| --- | --- |
| [work-queue-durability](/docs/interfaces/work-queue-durability.md) | Durable background work |

## Implemented by

| App | Local docs |
| --- | --- |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/work-and-scheduling.md](/docs/requirements/by-system/work-and-scheduling.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/work-and-scheduling.md` (gitignored).
