# D25: Expected Failures Are Values

**Status:** decided 2026-07-28
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

`STRUCT-3` assumed duplicate exception classes with no shared base. Survey found **one root per module** and latent (not active) catch hazards — worst in `documents_v2` with four unrelated exception roots. Owner chose the ideal over a shared-hierarchy cheap fix, 2026-07-28.

## Decision

**Expected domain failures are return values, not exceptions.** Services return `Document | NotFound | NotOwner | …`; callers `match` with `assert_never` under pyright strict so unhandled arms fail the type checker.

- **Unexpected failures stay exceptions** — bugs and infrastructure only. Ambiguous cases are **expected** (cheap to add a `match` arm; expensive to miss a catch).
- **Error dataclasses live in `domain/`** per [D17](/apps/api/docs/decisions/D17-Lowest-Layer-Not-A-Utils-Package.md).
- **GraphQL expresses the same idea:** expected failures are union payload arms; `__typename` is the code (resolves GQL-MUT-2). No parallel error enum. Auth identity failures stay top-level GraphQL errors per [D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md); denials are explicit union arms per [D15](/docs/decisions/D15-Denial-Is-Explicit.md).
- **Migration unit is a vertical, all-or-nothing** — delete that vertical's exception root in the same change. `documents_v2` goes first.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Shared exception hierarchy / `ChroniclerError` base | Still depends on humans catching the right symbol; invites `except ChroniclerError` |
| `Result[T, E]` wrapper | Extra unwrap at every call site; pyright already enforces exhaustiveness on bare unions |
| Functional-effects / `returns` library | Guarantee is pyright, not combinators |
| Partial vertical conversion | Two conventions inside one vertical — worse than not starting |
| Per-mutation GraphQL error code enum | Duplicates union `__typename` |

## Consequences

Resolvers map service arms to schema arms; no `try`/`except` for expected domain failures.

## Enforced by

pyright strict on `services/`; Strawberry union payloads at the schema edge.

## Reopen triggers

- A vertical left half-converted across more than one merge.
- pyright strict relaxed anywhere in `services/`.
- A caller catches an exception D25 says should be a value.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
