# Round trips, not connections, are what the frontend pays for

**Map:** [systems.md](/docs/systems.md)

## What it is

The frontend is static, built with Vite/React, served from Vercel. It reaches the API only through

## Interfaces

| Interface                                            | Role                 |
| ---------------------------------------------------- | -------------------- |
| [scoped-body](/docs/interfaces/scoped-body.md)       | Render scoped bodies |
| [graphql-schema](/docs/interfaces/graphql-schema.md) | Client contract      |

## Implemented by

| App        | Local docs                       |
| ---------- | -------------------------------- |
| `apps/web` | [apps/web/docs/](/apps/web/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/frontend.md](/docs/requirements/by-system/frontend.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/frontend.md` (gitignored).
