# D29: Owner And Admin Bypass Identity Predicates

**Status:** decided 2026-07-31 (owner ruling)
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

[D14, [D28 ·
**Supersedes:** D14's `owner_only` breadth value

## Decision

- **Owner**is a fixed set of account IDs from an environment variable

- **Admin**is an assigned, revocable role.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Per-predicate admin branch (today's shape) | Roughly twenty hand-written `or Role6.ADMIN in claims.roles` checks, scattered across services, cannot be verified complete by inspection and none of them account for owner at all. Every new predicate risks omitting the branch |
| Policy-data wildcard grant (`ALL_PERMS`) | `(symbol)` already expresses "admin has every permission string" as a grant row, which is right for the capability axis (D14's role/permission vocabulary). It has no way to express "and also every resource-scoped and audience-scoped predicate", because those predicates are not permission strings, they are functions of the caller and the row. A grant row cannot bypass a function argument |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A written ADR supersedes this decision.
