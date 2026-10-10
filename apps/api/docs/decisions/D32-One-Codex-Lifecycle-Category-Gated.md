# D32: One Codex Lifecycle Category Gated

**Status:** decided and implemented 2026-09-10
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

· **Release:** `8dd84767` (PR #571)

## Decision

- **Artifact, Event, Lore, NPC, and Faction are categories of one document lifecycle.**They share

- **Category changes the fields and invariants shown by the shared surface.**It does not create a

- **A new entry starts without a category.**The author must choose one; the server rejects an

- **Creation is available to every signed-in member.**Update, publication, unpublication, and

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Separate NPC, Faction and generic editors | They had already drifted in fields, access controls, routes and feature coverage. A second surface makes every future capability a synchronization task |
| One generic form with every field always visible | It exposes irrelevant vocabulary and makes the category meaningless to the author. One implementation can still adapt its field set |
| Default new entries to Artifact | It creates incorrectly classified documents through omission and hid the missing NPC/Faction options that prompted this ruling |
| Let campaign roles edit another author's entry | A role describes campaign responsibility, not authorship. Cross-author mutation remains an explicit admin override under D14 |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A category needs a different persistence lifecycle rather than additional fields or invariants.
- A category-specific renderer must receive data the shared safe renderer cannot represent.
- A new category has a complete product journey and cannot be expressed by the closed authoring set.
- Product grants a named role cross-author authority for a specific operation; that grant must be
