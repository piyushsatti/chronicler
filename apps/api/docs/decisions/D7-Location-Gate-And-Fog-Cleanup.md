# D7: Location Gate And Fog Cleanup

**Status:** decided 2026-07-15 (D7a locked same day)
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

The map needed a ruling on layer state, fog/discovery, and who may mutate location entries once linked into a region.

## Decision

**No map-layer state management** — map is document linking and viewing only. **Fog/discovery:** map fog is the location entry’s **audience** ([D3](/docs/decisions/D3-Audience-Policy-Model.md)), resolved per viewer; “reveal” is an archon editing audience, not a special map action.

**Delete** discovery machinery: `hex_discoveries`, `hexes.discovered_at`, flip/discover reveal paths, and dependent reads. No discovery ledger, no fog flags.

**D7a (locked):** archon (region archon once linked; admin override) owns **all** location-entry mutations — create, edit, link, set-audience.

**#150 ripple:** “hexes discovered” metric loses its ledger source → resolved in [D8](/apps/api/docs/decisions/D8-Member-Metrics-Scope.md) by dropping `hexesDiscovered`.

## Alternatives rejected

| Alternative                               | Why not                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| Quest-visiting-hex auto-reveal            | Rejected explicitly                                  |
| Keep `hex_discoveries` as a credit ledger | Rejected explicitly                                  |
| Fog-as-progression product                | Deferred as possible later feature, out of scope now |

## Consequences

Spatial and stats code no longer read discovery timestamps. Location visibility follows audience policy only.

## Enforced by

Destructive migration removing discovery tables/columns; archon gates on create/link paths (published edit and set-audience were flagged for alignment with D7a).

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
