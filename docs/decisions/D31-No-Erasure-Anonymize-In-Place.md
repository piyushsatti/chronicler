# D31: No erasure by row removal; anonymize in place

**Status:** ruled-provisional 2026-08-01
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

**First execution gated on owner confirmation.**

## Context

Member erasure was open. Schema FKs to `members` are bare `REFERENCES` (NO ACTION), so `DELETE FROM members` fails against many referencing tables. A product position was required without claiming legal compliance.

## Decision

> R4 = documented no-erasure policy + anonymize-in-place on request, additive-reversible if overturned.

- Row removal is not the supported path.
- Supported operation shape: anonymize in place (identifying values cleared; rows and facts retained).
- Published framing is **product policy**, not a legal claim (owner-ruled branch P).
- Status remains **ruled-provisional**: shape chosen; per-surface execution map and trigger authorization stay out of this short record (long-form inventory in `.local/docs-quarry/decisions-longform/`).

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Cascade delete / row removal | Foreclosed by bare FKs without schema rewrite |
| Crypto-shredding | No per-member key; schema-wide rewrite |
| Legal-compliance framing | Owner chose weaker product-policy framing |

## Consequences

No erase-by-delete path. Anonymize is designed, not built, until owner confirmation. Free-text and backup residuals remain stated limits.

## Enforced by

**not enforced** — operation not implemented. Do not execute anonymization before owner confirmation.

## Reopen triggers

FK shape changes to allow deletes; anonymization runs before confirmation; a legal obligation forces compliance framing; free-text residual policy changes.
