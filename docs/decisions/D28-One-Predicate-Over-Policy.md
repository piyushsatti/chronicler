# D28: One Predicate Over Policy

**Status:** decided 2026-07-28
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [session-audience](/docs/interfaces/session-audience.md)

## Context

Body gate (`effective_body`) consults `policy`; listing gate (`DocumentsRepo.scope_predicate`) does not — docstring claims parity but branches on `visibility` only. `setDocumentVisibility` can set `policy` alone while `visibility` stays `public`, so titles leak in search/directories (FINDINGS 70). Depends on [D12](/docs/decisions/D12-Scope-Predicate-At-The-Session.md), [D15](/docs/decisions/D15-Denial-Is-Explicit.md), [D20](/docs/decisions/D20-One-Closed-Marker-Set.md), [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md); session attach shape follows [D27](/docs/decisions/D27-One-Session-Per-Request.md).

## Decision

**A listing is an authorization surface** — search, link picker, backlinks, directories ask the same question: may this viewer know this row exists?

**One specification, two interpreters:** declare the audience rule once over `policy`. Python evaluates it on a loaded row for body/read paths; SQL compiles it for listings. No consumer restates `and_`/`or_` over `Document.visibility`.

**Legacy `visibility` compiles into policy** via `compile_legacy_visibility` — not a parallel branch. Fail-closed: unresolvable audience → absent from listings ([D20](/docs/decisions/D20-One-Closed-Marker-Set.md) lesson for rows).

**DOC-11:** render links to invisible documents; deny on click ([D15](/docs/decisions/D15-Denial-Is-Explicit.md), [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md)) — renderer must not drop links by viewer.

**Member search/listing:** roster is public; default status floor excludes banned/removed — callers may narrow, not widen.

Search **coverage** (quests, characters, etc.) remains a product call; **access** for any type search reaches uses this predicate.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Patch `scope_predicate` to also read `policy` | Still two implementations of one matrix; convention already drifted once |
| Compile policy down to `visibility` | Three enum values cannot express arbitrary principals; rounding toward `public` leaks |
| Forbid policy-only writes at mutation | Fixes one path; vestigial `visibility` remains wrong after #143 |
| Deny all policy-scoped rows in listings | Fail-closed but breaks intentional sharing lists |
| Per-viewer server index cache | Premise died with connection-floor measurement ([D27](/docs/decisions/D27-One-Session-Per-Request.md)) |

## Consequences

Every listing surface shares one clause factory. Policy migration makes documents safer in body view without widening enumeration.

## Enforced by

Single predicate module; listings and backlinks call it (including joined source doc in `list_backlinks`).

## Reopen triggers

- Second `Document.visibility` branch outside the one predicate.
- Surface listing rows without the predicate.
- Policy state `compile_legacy_visibility` cannot express in reverse.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
