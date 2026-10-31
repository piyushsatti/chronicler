# D30: Deletion Is Named Per Entity

**Status:** decided 2026-07-31; later amendments reconciled  
**Kind:** boundary  
**Owner:** global (`docs/decisions/`)  
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

A missing delete surface is not a retention decision. Campaign records, member preferences and regenerable projections require different lifecycles. Historical delete-path counts and foreign-key observations do not describe the current Go schema.

## Decision

**Deletion policy is explicit per entity.** The matrix is the target policy, not a claim that every operation is implemented:

| Entity or source family                                                                    | Deletion / retention policy                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents                                                                                  | Soft delete; preserve identity and history. Direct quest-brief deletion is disallowed.                                                                                                                  |
| Document revisions                                                                         | No ordinary deletion; retain indefinitely, including audience-change history. Collapsing revisions is an unadopted successor requiring a new decision and verified restore point.                       |
| Quests, characters, regions                                                                | Soft delete; retain referenced campaign records and ledgers. Retirement/cancellation are not deletion.                                                                                                  |
| Members                                                                                    | No erase-by-row-removal operation; provisional anonymize-in-place under [D31](/docs/decisions/D31-No-Erasure-Anonymize-In-Place.md), unbuilt and first execution owner-gated. Deactivation is distinct. |
| Follows (`member_follows`)                                                                 | Hard delete of the caller's live preference.                                                                                                                                                            |
| Requests (`dm_requests`)                                                                   | Retain the ask and resolution; member-authored note treatment belongs to D31.                                                                                                                           |
| Character logs                                                                             | Hard deletion is the target self-service operation, **owning player only** under September 16's character exception; no staff bypass.                                                                   |
| Archon / lieutenant assignments                                                            | Hard revoke is the retained policy; preserving the fact of a revoked grant remains an explicit open improvement.                                                                                        |
| Availability, document reader/link sets, quest region/hex sets, DDB proficiency projection | Internal replace-on-write may hard-delete the superseded set; this does not authorize deleting the owning record or its history.                                                                        |
| Game-time mapping                                                                          | Internal cutoff purge of regenerable projection, not source facts.                                                                                                                                      |
| Bot heartbeats (`bot_heartbeats`)                                                          | Disposable operational samples. Prune hourly when `received_at` is strictly earlier than seven days before the tick; preserve the exact cutoff and newer samples.                                       |
| Hex / node entry claims                                                                    | Hard unclaim of a live link, where that source family is supported.                                                                                                                                     |
| POIs                                                                                       | **Unresolved:** the historical unreachable delete helper established no policy. Decide before admitting a delete surface.                                                                               |

Source families without a Go counterpart retain their intent here; their absence is not retirement. Other entities or new destructive paths require an explicit policy before implementation. Legal erasure, free-text residuals and backup residuals are not answered by this matrix.

## Alternatives rejected

- Leaving core entities undecided until a delete UI appears: absence of an operation is not a policy.
- Hard-deleting campaign aggregates: it can remove or detach their audit chains, regardless of whether a foreign key permits it.
- Treating a schema cascade as product authorization: DDL permits effects; it does not approve them.

## Consequences

The later indefinite revision-retention ruling replaces the original open-duration answer. September 16 replaces owner-or-admin character-log deletion with literal player ownership. Current cascades must be assessed against these policies before a destructive command is admitted.

## Enforced by

Document reads exclude `documents.deleted_at`; this enforces tombstone visibility only. The [live-authority interface](/docs/interfaces/live-authority.md) and API schema guidance distinguish policy from implemented lifecycle surfaces. The complete matrix is **not enforced**; current schema cascades can delete retained history if an aggregate is physically removed.

`PruneBotHeartbeats` and `TestHourlyMaintenancePrunesOldHeartbeats` enforce the heartbeat cutoff. This amendment uses bounded retention for disposable samples and preserves the API as the single lifecycle authority.

## Reopen triggers

- A new destructive path lacks a policy, or a cascade reaches a retained record.
- An accepted retention or erasure decision changes the matrix; no anonymization executes without D31's owner confirmation.
