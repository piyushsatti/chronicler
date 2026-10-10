# Ownership is one relation in code, and two live writes bypass it anyway

**Map:** [systems.md](/docs/systems.md)

## What it is

A character has exactly one owner, `characters.owner_id`, set once at creation and checked in code on every write. It is never an editable table row. [D14](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md)

## Interfaces

| Interface | Role |
| --- | --- |
| [live-authority](/docs/interfaces/live-authority.md) | Ownership and bypass rules |

## Implemented by

| App | Local docs |
| --- | --- |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |
| `apps/web` | [apps/web/docs/](/apps/web/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/characters.md](/docs/requirements/by-system/characters.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/characters.md` (gitignored).
