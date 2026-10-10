# D4: Scoped Body Cache

**Status:** decided 2026-07-15
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [scoped-body](/docs/interfaces/scoped-body.md)

## Context

`body_public` was one cached column per document. After [D3](/docs/decisions/D3-Audience-Policy-Model.md), different viewers need different effective bodies for the same document.

## Decision

**No per-viewer cache.** `body_public` survives only as the **public-audience projection**; member- and role-scoped blocks are **spliced per request**. Block audience is **declared in markup** (source of truth), not materialized as separate per-block grant rows. Documents with `policy IS NULL` may still fall back through legacy visibility until compiled into policy.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Restructure cache around scoped bodies | Not chosen; per-request assembly was the starred simpler option |
| Per-viewer cached blob | Cannot represent two redacted views of one document in one stored column |

## Consequences

Every policy-bearing read re-parses and re-assembles body content for the viewer. No memoization layer on the read path.

## Enforced by

Per-request assembly in document read services; no cache keys on scoped body paths.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
