# Contracts docs

High-signal notes for the shared wire contract under `packages/contracts/`. Truth for fields and routes remains in the split SDL, merged `schema.graphql`, `openapi.yaml`, and `field-routing.md`.

| Doc | Covers |
| --- | --- |
| [design.md](design.md) | Why this package; source-of-truth order; consumers; how to evolve |
| [patterns.md](patterns.md) | GraphQL vs REST / DROP; naming; `/v1` versioning; `ID` on the wire |

Related (do not duplicate here):

- [D40 — GraphQL versus REST](../../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) — transport rule
- [field-routing.md](../field-routing.md) — old field → GQL / REST / DROP map
- [graphql-schema interface](../../../docs/interfaces/graphql-schema.md) — one SDL, enforced drift check

Parent entrypoint: [`../README.md`](../README.md).
