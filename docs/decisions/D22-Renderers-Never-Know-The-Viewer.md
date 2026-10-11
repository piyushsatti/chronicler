# D22: Renderers Never Know The Viewer

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [scoped-body](/docs/interfaces/scoped-body.md)

## Context

R6 and `HANDOFF-EDITING.md` §2 disagreed on whether redaction keys off renderer identity or viewer identity. `ContentRenderer` has no viewer-role check; it is safe only because callers pass server-redacted `effectiveBody`.

## Decision

**Redaction completes before markdown reaches any renderer.** The renderer takes text, never an identity — so missing checks are correct-by-design, not accidental.

- **`effective_body` on the server is the only enforcement point.** Client marker parsing is for authoring only, never access control.
- **`SummaryDetailPage` must not re-parse an already-redacted body** client-side; correct output from two accidents is not a design.
- **One classifier keyed on `(kind, category)`** in one module (`pipeline` / `_CATEGORY_SCHEMAS` dispatch). Delete frontend `isRulingDocument`; classification ships as a document field ([D17](/apps/api/docs/decisions/D17-Lowest-Layer-Not-A-Utils-Package.md) placement).
- **Slugs are server-allocated in Python only** (`documents_repo` canonical). Delete both TypeScript slug helpers; region route fallback is not a document slug.
- **Region codex-entry body view does not exist** (`RegionHubPage` LORE tab is hardcoded prose). Not a requirement gap until product asks.

`document_revisions` stay raw-body, author-or-admin gated at the resolver — deliberate.

## Alternatives rejected

| Alternative                         | Why not                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Renderer checks viewer role         | Third redaction engine; duplicates server gate and invites drift                                       |
| Client-side enforcement of audience | Fourth parser; [D20](/docs/decisions/D20-One-Closed-Marker-Set.md) exists because two already diverged |
| Frontend re-derives ruling/category | Hand-mirror of backend; same failure mode as deleted `ROLE-1` pattern                                  |
| Client-computed document slugs      | Three implementations already disagree on one input string                                             |
| Close the region body gap now       | Product work not requested; record states the gap                                                      |

## Consequences

Every renderer path assumes pre-redacted input. Authoring may show authors their own markers; preview uses server `effective_body` per [D21](/apps/web/docs/decisions/D21-One-Editor-Pluggable-Body-Field.md).

## Enforced by

Server redaction before GraphQL returns body fields; deletion of client classification helpers when wired.

## Reopen triggers

- A renderer gains viewer identity or re-parses for enforcement.
- A second `(kind, category)` classifier appears outside the one module.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
