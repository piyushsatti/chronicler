# Serving a request: session per task, no lock

**Map:** [systems.md](/docs/systems.md)

## What it is

The scarce resource is a pooled connection, not a millisecond. Postgres executes the query

## Interfaces

| Interface | Role |
| --- | --- |
| [live-authority](/docs/interfaces/live-authority.md) | Authority at the boundary |
| [session-audience](/docs/interfaces/session-audience.md) | One session per request |
| [graphql-schema](/docs/interfaces/graphql-schema.md) | Request surface |

## Implemented by

| App | Local docs |
| --- | --- |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/serving-a-request.md](/docs/requirements/by-system/serving-a-request.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/serving-a-request.md` (gitignored).
