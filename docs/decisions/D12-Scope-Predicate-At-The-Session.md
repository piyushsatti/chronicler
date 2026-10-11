# D12: Scope Predicate At The Session

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [session-audience](/docs/interfaces/session-audience.md)

## Context

**Step 4's visibility predicate is registered once per request on the SQLAlchemy `Session`, not
written into each query. Every load of a scoped entity inherits it, including loads a batching layer
issues.**

## Decision

**Step 4's visibility predicate is registered once per request on the SQLAlchemy `Session`, not
written into each query. Every load of a scoped entity inherits it, including loads a batching layer
issues.**

## Alternatives rejected

| Alternative                                                | Why not                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authority` as a required argument on every batch function | Covers DataLoader only. Look-ahead pre-fetches and ORM eager loads are not batch functions and stay uncovered. Solving one third of the problem with a convention that looks like it solved all of it is worse than solving none. |
| A lint rule requiring `visible_to` in every `select()`     | Cannot see an eager load: `selectinload` emits its SELECT inside SQLAlchemy, from a `relationship()` declaration that contains no predicate to lint.                                                                              |
| A test asserting every loader is predicate-covered         | Kept as a supplement, rejected as the mechanism. It catches what exists at the time it is written. The failure mode named in `GQL-SQL-6` is a loader added later by someone who did not know the rule.                            |
| Database-side RLS as the primary                           | Would work, and is `AUTH-4`'s question, not this one. Deferred rather than dismissed: see below.                                                                                                                                  |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A written ADR supersedes this decision.
