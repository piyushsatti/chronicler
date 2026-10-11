# D31: No erasure by row removal; anonymize in place

**Status:** ruled-provisional 2026-08-01
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

**First execution gated on owner confirmation.**

## Context

Member erasure was open. Campaign history must retain the fact of recorded actions while identifying values have a separately stated treatment. The historical blanket no-cascade rationale is superseded by the current mixed foreign-key actions; the provisional product ruling does not depend on that old schema observation.

## Decision

> R4 = documented no-erasure policy + anonymize-in-place on request, additive-reversible if overturned.

- Row removal is not the supported path.
- Supported operation shape: anonymize in place (identifying values cleared; rows and facts retained).
- Published framing is **product policy**, not a legal claim (owner-ruled branch P).
- Status remains **ruled-provisional**: shape chosen; a current per-surface execution map and trigger authorization are still required before implementation. [D30](/docs/decisions/D30-Deletion-Is-Named-Per-Entity.md) preserves ordinary deletion/retention policy separately.

## Alternatives rejected

| Alternative                  | Why not                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| Cascade delete / row removal | Can destroy campaign facts; current cascades do not authorize erasure |
| Crypto-shredding             | No per-member key; schema-wide rewrite                                |
| Legal-compliance framing     | Owner chose weaker product-policy framing                             |

## Consequences

No erase-by-delete path. Anonymize is designed, not built, until owner confirmation. Free-text and backup residuals remain stated limits.

## Enforced by

**not enforced** — operation not implemented. Do not execute anonymization before owner confirmation.

## Reopen triggers

A current per-surface map changes retained facts; anonymization runs before confirmation; a legal obligation forces compliance framing; free-text or backup residual policy changes.
