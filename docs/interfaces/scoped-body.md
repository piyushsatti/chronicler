# Interface: Scoped document body

**Status:** accepted  
**Provider:** `apps/api` (scopes before return)  
**Consumers:** `apps/web` renderers / editors that display body HTML or AST

## Rule

Renderers never learn who the viewer is. The document body arrives already scoped for the viewer. No per-viewer body cache that would require re-scoping client-side.

**Owner ruling, 2026-10-11:** enforce per-viewer blocks on every readable document, including SQL NULL and JSON-null `policy`. Preserve the whole-document gate and author/admin raw-body bypass. A legacy DM or archon whole-document grant does not bypass a block addressed to another member; archon does not imply literal `role:dm`.

## Enforcement

| Mechanism                                              | Location                                                              | Status                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outer gate, then block projection                      | `apps/api/internal/document/body.go`, `query.go`                      | Implemented; passed the offline Go suite and bounded native PostgreSQL 16.14 body verification using the recorded audit-only DB lifecycle adapter |
| Direct ID/slug, lists, directory and typed quest brief | GraphQL consumes projected `Queries` results                          | Native assertions passed across all five projections                                                                                              |
| Batch documents                                        | `document.BatchLoader` delegates to `Queries.ByID`                    | Native batch assertion passed using freshly resolved database authority                                                                           |
| Shared marker vectors                                  | `packages/contracts/fixtures/audience-markers.v1.json`, Go body tests | All 49 vectors passed across SQL NULL, JSON null and readable explicit-policy forms; editor consumer unverified                                   |
| Renderer isolation                                     | web/editor runtime                                                    | **not independently verified**                                                                                                                    |

## Provider

API applies audience policy and marker rules before returning body content. Repositories hold raw body text; `Queries.ByID`, `BySlug` and `List` overwrite the returned value with request-scoped bytes. Outer denial returns no body, and an inner marker cannot re-grant that document. Hidden spans become the fixed `> [!redacted]` placeholder without a secret-length hint. Author/admin bypass retains the raw source; actual administrator override is logged without protected body, policy or handle principals.

The closed grammar is recorded in [D20](/docs/decisions/D20-One-Closed-Marker-Set.md), including the accepted July 30 lexical amendment, and the shared `audience-markers.v1.json` vectors. The closed forms are `[!dm]`, `[!dm:@handle]` and `[!spoiler]`, with case/outer whitespace folding, exact handle case and marker charset `[A-Za-z0-9_.-]+`. Spoiler is presentation only. The shared vectors record malformed-attempt denial, ordinary-callout visibility and preserved maximal quote-run/bare-line classification; editor validation must consume those vectors before claiming conformance.

**Observed scoped verification (2026-10-11):** the full offline Go `./...` suite passed. The bounded native Go integration run passed against PostgreSQL 16.14 using the recorded audit-only database lifecycle adapter; this does not verify the unchanged Docker/Testcontainers lifecycle. Native assertions passed for all 42 SQL NULL/JSON-null × visibility × viewer leaves, five body projections (direct ID, slug, list, codex directory and typed quest brief), and the separate batch path. Four current-authority transitions with unchanged JWT also passed. The denial cases checked `FORBIDDEN`, empty readable enumeration/counts, no body values or raw fragments, and an empty batch; readable cases checked complete expected text and hidden-sentinel absence. Astra's independent v2 review recorded zero must-fix findings for the frozen body source and fixture.

These results close the prepared native body assertion boundary for this slice. At that body-slice verification, the repository-wide `scripts/verify` local-cache run stopped at `format:check`; that dated observation is not the current repository verification verdict. Later repository checks have their own source/evidence boundary and do not broaden these body assertions. The renderer/editor consumer remains unverified, as does the original Docker/Testcontainers database lifecycle. Search currently emits title snippets; backlinks and map places emit metadata, and none of those is a body projection. Public archive ingestion, other body-bearing domains and editor/save behavior remain outside this document-body slice.

## Consumers

Web renderers consume scoped bodies only. Local notes: `apps/web/docs/` (when present).

## Related decisions

- [D3](/docs/decisions/D3-Audience-Policy-Model.md)
- [D4](/docs/decisions/D4-Scoped-Body-Cache.md)
- [D20](/docs/decisions/D20-One-Closed-Marker-Set.md)
- [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md)

## Reopen

A renderer is allowed to receive the viewer identity or an unscoped body for filtering.
