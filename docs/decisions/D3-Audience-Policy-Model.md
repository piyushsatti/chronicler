# D3: Audience Policy Model

**Status:** decided 2026-07-15, revised 2026-07-17. Audited 2026-07-25: implemented,
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [scoped-body](/docs/interfaces/scoped-body.md)

## Context

There is no role hierarchy to build “superior sees subordinate” visibility on. Roles are flat capabilities. Visibility must govern whole documents and individual blocks (for example DM-only paragraphs inside an otherwise public summary).

## Decision

**A visibility unit (document or block) has an audience: a set of signed principals.** One engine resolves access at both levels. The document is the outer gate; **blocks may only narrow inward, never re-grant.**

Policy principals: `role:R`, `!role:R`, `member:X`, `!member:X`. **Resolution:** explicit member deny → deny; explicit member allow → allow; else role match with deny winning ties; **default deny.** Author always sees own work. **Admin and platform owner** bypass read/write predicates per [D29](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md), with privileged actions auditable.

Legacy `documents.visibility` **folds into** this model (one engine). **`[!spoiler]`** is presentation (client blur in public body), not server-side secrecy. **`[!dm]`** and member-scoped markers are server-stripped.

**Author-facing markup (D3++):** exactly three markers — `[!dm]`, `[!spoiler]`, `[!dm:@handle]` — mapping to policy as specified. No general `[!audience …]` grammar in v1. Malformed attempts at known markers fail closed (impossible policy); unrecognized marker handling was revised 2026-07-25 toward fail-closed alignment with the frontend.

## Alternatives rejected

| Alternative                                                | Why not                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Role hierarchy                                             | No honest ordering; implicit “superior sees all” over-shares (for example archon reading DM secrets) and fights flat-capability checks |
| Named reusable audience groups                             | Deferred (YAGNI); future additive layer                                                                                                |
| Full `[!audience …]` grammar with NOT-principals in markup | Deferred; smaller parser reduces adversarial surface                                                                                   |

## Consequences

Body reads assemble per viewer without a per-viewer cached blob ([D4](/docs/decisions/D4-Scoped-Body-Cache.md)). Listing surfaces must eventually share the same policy semantics ([D28](/docs/decisions/D28-One-Predicate-Over-Policy.md)).

## Enforced by

`resolve_audience` and marker pipeline in `services/documents_v2/`; adversarial coverage in `tests/backend/v2/test_audience.py`.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
