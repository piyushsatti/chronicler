# D9: Tag Normalization

**Status:** decided 2026-07-15
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

Freehand tags (including from phones) fragment the value set with casing and whitespace variants. Genre filtering needed a demonstrable acceptance path.

## Decision

**Fold-match at write time** against live distinct values: trim, collapse whitespace, casefold for match only; **reuse first-authored casing** for display. De-dupe within input. Same `text[]` storage — **no canon table, migration, or backfill.**

**Ship now:** genre normalization plus a **genre filter** mirroring the existing quest `tag` filter. **Fast-follow:** terrain normalization after location canon landed.

Shared primitive: **`fold_key`** and **`normalize_tags`** in tag normalization service.

Staff merge/dedup tool and historical backfill are **deferred** — revisit only if genre sprawl becomes real.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Canon table with migration and backfill | Not rejected outright; explicitly deferred until sprawl warrants it |

## Consequences

New writes converge on existing distinct tags without a curated vocabulary table. Terrain normalization remains a follow-on.

## Enforced by

`normalize_tags` / `fold_key`; genre filter on quest list inputs.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
