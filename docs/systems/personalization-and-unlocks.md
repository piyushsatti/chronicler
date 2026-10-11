# A member's cosmetics are recomputed on every read, and achievements are just one more rule type

**Map:** [systems.md](/docs/systems.md)

## What it is

Catalog, ledger, settings, the `/me/personalize` page, and an admin panel to manage the catalog are one system, wired end to end. Second only to community and social in code volume.

## Interfaces

| Interface                                            | Role                 |
| ---------------------------------------------------- | -------------------- |
| [live-authority](/docs/interfaces/live-authority.md) | Unlocks and settings |

## Implemented by

| App        | Local docs                       |
| ---------- | -------------------------------- |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |
| `apps/web` | [apps/web/docs/](/apps/web/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/personalization-and-unlocks.md](/docs/requirements/by-system/personalization-and-unlocks.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/personalization-and-unlocks.md` (gitignored).
