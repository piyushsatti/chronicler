# A document's audience is decided twice, by two engines that disagree

**Map:** [systems.md](/docs/systems.md)

## What it is

A document's audience is decided by exactly one engine (`resolve_audience`), interpreted twice: in Python over a loaded row for a body read, compiled to SQL over a query for listing, search, and backlinks. [D28](/docs/decisions/D28-One-Predicate-Over-Policy.md) is the specification that makes both interpreters answer the same rule, so a restricted document cannot show up as public everywhere except t

## Interfaces

| Interface                                                | Role                      |
| -------------------------------------------------------- | ------------------------- |
| [scoped-body](/docs/interfaces/scoped-body.md)           | Audience-scoped documents |
| [session-audience](/docs/interfaces/session-audience.md) | Visibility at the session |

## Implemented by

| App        | Local docs                       |
| ---------- | -------------------------------- |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |
| `apps/web` | [apps/web/docs/](/apps/web/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/documents-and-audience.md](/docs/requirements/by-system/documents-and-audience.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/documents-and-audience.md` (gitignored).
