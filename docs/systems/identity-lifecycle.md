# How identity lifecycle should work

**Map:** [systems.md](/docs/systems.md)

## What it is

Sibling to `Authorization.md`: that page covers WHAT a token authorizes; this page covers the LIFE
of the identity that holds it, birth to death. States the requirements and the structure that
satisfies them. **Deliberately says nothing about how much code would change, in what order, or
whether it is affordable.** Those are separate questions and answering them here would let cost
quietly edit the requirements.

## Interfaces

| Interface                                            | Role                            |
| ---------------------------------------------------- | ------------------------------- |
| [live-authority](/docs/interfaces/live-authority.md) | Who you are and what you may do |

## Implemented by

| App        | Local docs                       |
| ---------- | -------------------------------- |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |
| `apps/web` | [apps/web/docs/](/apps/web/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/identity-lifecycle.md](/docs/requirements/by-system/identity-lifecycle.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/identity-lifecycle.md` (gitignored).
