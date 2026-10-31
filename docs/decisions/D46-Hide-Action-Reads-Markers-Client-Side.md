# D46: Hide Action Reads Markers Client-Side

**Status:** decided 2026-10-28
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [scoped-body](/docs/interfaces/scoped-body.md)

## Context

Authors asked for an easy way to hide text without typing marker syntax. The editor toolbar's "Hide" action wraps the selection as a blockquote headed by one closed [D20](/docs/decisions/D20-One-Closed-Marker-Set.md) marker: `[!dm]`, `[!dm:@handle]` or `[!spoiler]`. To write that header safely, the action must read the markers already in the range. The server picks the first handle anywhere in a quote run over `[!dm]`, and a malformed token hides the block from everyone. A token left inside the range would therefore override the new header. Replacing hidden text with a spoiler would also make DM-only text public without warning. [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md) keeps visibility decisions on the server. **Owner ruling, 2026-10-28:** keep the client marker reader in `hideMarkers.ts` for the Hide action only.

## Decision

Named pattern: **conformist client reader verified by shared conformance vectors**. The client adopts the server's grammar unchanged (conformist, not a translation), and both runtimes are tested against the same vectors. This follows [scoped-body](/docs/interfaces/scoped-body.md): "editor validation must consume those vectors".

`apps/web/src/features/editor/hideMarkers.ts` reads audience tokens with the same boundary and precedence as `classifyMarkerLine` / `classifyMarkers` in `apps/api/internal/document/body.go`. The Hide action uses it for two things only:

1. **Stripping:** remove every audience token (valid, malformed and lookalike such as `[!dm@x]`) inside the wrapped range, so the written header is the block's only token.
2. **Confirming:** detect an existing hidden scope (DM, member or malformed) that the new marker would change, and ask the author before writing.

**Scope limit:** the reader serves the Hide action's writes only. It never decides or displays what any viewer can see. Badges, lookalike warnings, the publish guard and preview stay server-only (`auditBody`, `previewBody`). The server's `EffectiveBody` remains the only enforcement point.

Convergence: one grammar with two interpreters checked against one vector set. This is the convergent form the owner ruling of 2026-07-28 allows; the client never restates the rule in its own terms.

## Trade-off accepted

- **Risk:** the client reader can drift from `body.go`. A drift would make the Hide action strip too little or ask at the wrong time. Visibility stays correct, because the server classifies the saved body and the action never decides visibility.
- **Cost:** a second implementation of the token scan to maintain.

## Alternatives rejected

| Alternative                                 | Why not                                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Write the header without reading the range  | An inline handle or malformed token overrides it; silent mis-scoping |
| Ask the server (`auditBody`) on every Hide  | A round trip per toolbar action; needs a saved or posted body        |
| Client reader also drives badges or preview | A client-side visibility surface; violates D22                       |

## Consequences

- Any change to the server grammar must update `packages/contracts/fixtures/audience-markers.v1.json`.
- The web Hide action's tests then fail until `hideMarkers.ts` matches.
- [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md) records this record as its one exception.

## Enforced by

`apps/web/tests/features/editor/hideMarkers.test.ts` classifies every span of every case in `packages/contracts/fixtures/audience-markers.v1.json` and must match the server's policy. It also checks that every Hide output carries exactly one audience token, on its header. The API's `TestSharedAudienceMarkerConformance` runs the same vectors.

The server-only surfaces this record keeps off the client reader are tested with a mocked server: `apps/web/tests/features/editor/bodyAudit.test.tsx` (badges, lookalike Fix, preview summary from the projected `> [!redacted]` blocks), `bodyAuditGuard.test.tsx` (publish check) and `previewViewAs.test.tsx` (preview audience and member handle). The audit modules (`adapters/bodyAudit.ts`, `bodyAuditCopy.ts`, `hooks/useBodyAudit.ts`) do not import `hideMarkers.ts`.

## Reopen triggers

- The client reader is used for anything other than the Hide action's writes.
- A server grammar change lands without a matching vector change.
- The server offers a cheap marker-scan endpoint the editor can call instead.
