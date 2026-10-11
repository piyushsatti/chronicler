# D5: DM Table Empty State And Uniqueness

**Status:** decided 2026-07-17 (backfilled, see Revisions)
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

Issue #144 needed answers for an empty DM table on a quest and whether a member may own more than one `dm_table` document.

## Decision

**Empty state:** a quest whose DM has no table document resolves **`dmTable: null`**. The frontend shows a create CTA. The backend **never synthesizes a placeholder.**

**Uniqueness:** one `community` / `dm_table` document per member, enforced by partial-unique index **`uq_documents_dm_table_per_member`** on `(created_by)` where `kind='community' AND category='dm_table' AND deleted_at IS NULL`. Soft-deleting frees the slot.

**Both** a service pre-check (`DuplicateDmTableError`) **and** the DB index are required; `IntegrityError` from the index re-raises as the same error.

Category vocab starts `{dm_table}` with room to add values such as `player_intro` without a schema migration beyond constants.

## Alternatives rejected

| Alternative            | Why not                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Placeholder document   | Would make `dmTable` never-null, push emptiness detection to the frontend by content inspection, and create rows nobody authored               |
| Multiple tables per DM | Drops the index and forces “which table does this quest use?” — product surface not requested; index is the only thing to drop if wanted later |

## Consequences

Quest GraphQL exposes null vs real table distinctly. Duplicate create attempts fail at service layer and at the database.

## Enforced by

Partial-unique index `uq_documents_dm_table_per_member`; `DuplicateDmTableError`; tests at service and repository layers.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
