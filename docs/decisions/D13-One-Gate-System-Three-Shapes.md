# D13: One Gate System Three Shapes

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

`KIND_GATES` acted as a second gate system beside role permissions. Owner ruling 2026-07-27: **no two gate systems.**

## Decision

**`KIND_GATES` stops existing as a second gate system.**

The five create gates fold into **one system, three shapes** — only the first becomes data:

| Shape                     | Examples                              | Treatment                                                                             |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| Role permission           | `rule` → admin or verifier            | `document.create.rule` in `role_permissions`                                          |
| “Any member” role check   | `codex_entry`, `summary`, `community` | `document.create.<kind>` on a base member role                                        |
| Structural refusal        | `quest_brief` → `False`               | **Delete the entry.** Service refuses the kind; real creation stays on the quest flow |
| Resource-scoped authority | Location create/edit                  | **Not this table** — routed to AUTH-6 (archon owns region), ReBAC-shaped              |

**`quest_brief` must not become a permission:** `False` means “this door is not the door,” not “nobody holds the permission.” Making it a grant would be one `INSERT` away from bypass on a live-editable matrix ([ROLE-1](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md)).

**Invariant gates stay code.** Assignment is data; not every gate is an assignment.

## Alternatives rejected

| Alternative                                            | Why not                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Keep `KIND_GATES` parallel to `role_permissions`       | Two gate systems; seven-day production window where any member could publish rules showed lambda gates are easy to miss |
| Encode `quest_brief` as a permission granted to nobody | Guarantee becomes editable data; violates structural refusal                                                            |
| Force location archon checks into RBAC rows            | Region ownership is resource-scoped; belongs in AUTH-6                                                                  |

## Consequences

Create-kind permissions move into the vocabulary/assignment model. Location gates remain until AUTH-6 lands.

## Enforced by

Migration of foldable gates to `document.create.*` permissions; removal of direct `quest_brief` create path.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
