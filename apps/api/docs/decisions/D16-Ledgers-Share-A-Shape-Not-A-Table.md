# D16: Ledgers Share A Shape Not A Table

**Status:** decided 2026-07-27
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

`LEDGER-1` reads: "one append-only ledger convention for audit records, or a table per domain.
`role_changes` is the cited precedent in three places, never as a mandate." It anticipates three
domains each inventing their own audit table.

## Decision

**Keep a table per domain. Mandate one column shape, carried by a mixin.**

## Alternatives rejected

| Alternative                                                                 | Why not                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One polymorphic `audit_events` table (entity_type, entity_id, JSON payload) | The textbook answer, and wrong here. Ten tables already exist and are load-bearing, each with real foreign keys and typed columns. Collapsing them means a large migration that trades typed, indexed, FK-enforced columns for a JSON blob, to fix a naming problem. It also loses the per-domain read gating that already differs deliberately. |
| Leave it alone; document `role_changes` as the precedent                    | The status quo. It is precisely what produced seven spellings: `role_changes` was already the cited precedent in three places and was copied by none of them. A precedent nobody follows is not a convention.                                                                                                                                    |
| Retrofit every existing table before the mixin is used                      | Rejected as a gate, not as work. See scope below.                                                                                                                                                                                                                                                                                                |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A written ADR supersedes this decision.
