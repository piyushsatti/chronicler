# D6: Hex Location Link Canon

**Status:** decided 2026-07-15
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

Two mechanisms linked hexes to location documents: scalar `hexes.document_id` (ungated bypass) and typed, published-gated `hex_entry_links` (already used for terrain).

## Decision

**Consolidate on `hex_entry_links`.** Add partial-unique constraints for `relation='location'`: **one hex per location link and one document per location link** (strict 1:1). **Close** the `updateHex(documentId:)` scalar-FK bypass. One mechanism for all hex↔document typed links.

## Alternatives rejected

| Alternative                            | Why not                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Repurpose `hexes.document_id` as canon | Not chosen; typed table already carried terrain relation and publish gating |

## Consequences

Location links are created and queried only through the claim table. Scalar FK column is removed from the hex model.

## Enforced by

Partial-unique indexes on `hex_entry_links` for `relation='location'`; `updateHex` mutation without `documentId`.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
