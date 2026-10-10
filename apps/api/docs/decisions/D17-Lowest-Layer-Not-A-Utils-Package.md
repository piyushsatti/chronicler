# D17: Lowest Layer Not A Utils Package

**Status:** decided
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

STRUCT-1 asked for a shared utilities module. Survey showed cited duplications belong in **different layers**, not one grab-bag.

## Decision

**No `utils` package.** A shared thing moves to the **lowest existing layer that all of its consumers already depend on.**

Examples from the survey: pure date helpers → `domain/`; SQL `LIKE` escaping → `db/v2/`; scattered `_is_admin` copies → **deleted** via ownership work ([D14](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md)), not centralized.

**STRUCT-2:** **no backend reuse gate now** — duplications traced to structural causes already addressed by in-flight decisions (auth consolidation, ledger shape, placement rule). **Revisit** after PRs 1–4 if any function still has **three or more copies**.

*(Amended 2026-07-28: STRUCT-2 reopened for frontend reuse gate; backend ruling unchanged.)*

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Shared `utils` / grab-bag module | No position in dependency graph; hides unlike concerns; becomes cycle magnet |
| Backend duplication lint gate immediately | Catches symptoms while causes are being removed; no AST lint infrastructure yet |
| Pre-emptive shared auth helpers | Would be deleted by PR 1 / D14 |

## Consequences

New shared code lands in `domain/`, `db/v2/base.py`, or existing layer modules — never a new sibling `utils`.

## Enforced by

Import graph and layer conventions; consolidation tracked when touching affected files.

## Reopen triggers

- Three-or-more-copy duplication survives PRs 1–4 → reconsider a gate.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
