# D21: One Editor Pluggable Body Field

**Status:** decided 2026-07-27
**Kind:** local
**Owner:** `apps/web/docs/decisions/`
**Interface:** n/a

## Context

DOC-6 assumed three competing editors. Survey found one shell: `AudienceBlockField` is a **body field** swapped by the summary adapter; `HomeContentEditor` is unreachable (disabled trigger).

## Decision

**One editor shell. The body field is pluggable.** `LiveEditor` is the default; the marker-aware field is a **capability of the shell**, not a rival editor. Fixes [D20](/docs/decisions/D20-One-Closed-Marker-Set.md) structurally by putting marker awareness on every body, not summaries only.

**Delete `HomeContentEditor`** (unreachable).

**EDIT-1:** “Save draft” must call **`update_document`**; keep `localStorage` as crash-recovery buffer only.

**EDIT-2:** document-level undo required (per-line textareas break native undo).

**EDIT-3:** optimistic concurrency — client sends loaded **`updated_at`**; server rejects if moved. Reject pessimistic locks and merge/CRDT for this product.

**EDIT-4:** Preview tab gains audience selector calling server **`effective_body`**, not a fourth client parser.

## Alternatives rejected

| Alternative                      | Why not                                                  |
| -------------------------------- | -------------------------------------------------------- |
| Three independent editor widgets | Already one shell; variation is body field only          |
| Pessimistic locking              | Lock lifetime and stale-lock story for rare co-editing   |
| Merge UI / CRDT                  | Order-of-magnitude more machinery than conflict error    |
| Client-side preview redaction    | Fourth parser; D20 exists because three already diverged |

## Consequences

Authoring surfaces share save/publish/leave guard. Redaction becomes verifiable in preview.

## Enforced by

Editor shell adapters; wired draft save to backend when implemented.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
