# D14: Ownership Is Code Override Is Declared

**Status:** decided
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

`Authorization.md` R8 reads: documents have resource-scoped authority via `resolve_audience`,
generalize it to quests, characters and regions. A code survey on 2026-07-27 found two of those three
wrong.

## Decision

**AUTH-6 splits on the axis R8 conflated, and the split is the ruling.**

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Zanzibar / full ReBAC (SpiceDB, OpenFGA, Ory Keto) | Same reasoning that rejected Casbin/OPA under `ROLE-1`. It buys arbitrary relationship graphs and transitive lookups; we have four ownership relations, one of them two hops. Running a policy service to express `quest.dm_id == caller` is not proportionate. |
| Ownership as data, in a table | Rejected on D13's rule: making a gate editable is safe only when the gate is a policy. `quest.dm_id` owning a quest is an invariant. An admin editing an ownership table to become the author of someone else's document is exactly the forgery path D13 closed for `quest_brief`. |
| Generalizing read scoping to quests and characters, as R8 asks | Premise checked and rejected. They are public by product decision. Building a visibility predicate for an entity with no visibility rule adds a mechanism with no policy behind it. |
| Leaving breadth at the call site with a lint rule | A lint rule can see that a check exists. It cannot see that `any_role_holder` was the wrong answer, which is precisely the defect found above. |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A written ADR supersedes this decision.
