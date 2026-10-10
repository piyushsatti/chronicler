# D20: One Closed Marker Set

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [scoped-body](/docs/interfaces/scoped-body.md)

## Context

Backend and frontend parsers disagreed on marker recognition. **`> [!DM]` shipped public** while the editor showed a locked block — uppercase Obsidian-style callouts leak secrets.

## Decision

### Closed marker set (three constructs, no more)

**`[!dm]`**, **`[!dm:@handle]`**, **`[!spoiler]`**. Anything else is an ordinary markdown callout, **visible**. No open-ended `[!audience …]` grammar.

**Case and whitespace fold to canonical** in both runtimes — do not treat case variants as “unrecognized visible prose.”

**Handle charset** matches **`members.handle`** constraints, not an independent regex.

**Malformed known markers** → denied (impossible policy). **Unknown callouts** (`[!note]`, etc.) → visible; **validation at save** refuses non-conforming markers before storage (retire frontend fail-safe that hid plain callouts).

**`[!spoiler]`** is client blur only, not access control.

**ENG-3:** one shared definition plus **conformance fixtures** run in both test suites — not codegen between parsers.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Treat case variants as unrecognized | Unrecognized path defaults to **visible** → disclosure |
| Generate one parser from the other | Over-engineering for three constructs |
| Prose spec both teams follow | Produced measured divergences; fixtures enforce instead |
| Runtime heuristic for author intent | Validation at save replaces guessing |

## Consequences

Existing bodies with uppercase DM callouts may be public until reclassified. Summary-only safe authoring expands to shell-level marker awareness ([D21](/apps/web/docs/decisions/D21-One-Editor-Pluggable-Body-Field.md)).

## Enforced by

Shared marker fixture tests; aligned `parse_policy` / editor validation.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
