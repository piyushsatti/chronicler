# Interface: Scoped document body

**Status:** accepted  
**Provider:** `apps/api` (scopes before return)  
**Consumers:** `apps/web` renderers / editors that display body HTML or AST

## Rule

Renderers never learn who the viewer is. The document body arrives already scoped for the viewer. No per-viewer body cache that would require re-scoping client-side.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| Renderer isolation test | web or API test suite | **not enforced** |

## Provider

API applies audience policy and marker rules before returning body content.

## Consumers

Web renderers consume scoped bodies only. Local notes: `apps/web/docs/` (when present).

## Related decisions

- [D3](/docs/decisions/D3-Audience-Policy-Model.md)
- [D4](/docs/decisions/D4-Scoped-Body-Cache.md)
- [D20](/docs/decisions/D20-One-Closed-Marker-Set.md)
- [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md)

## Reopen

A renderer is allowed to receive the viewer identity or an unscoped body for filtering.
