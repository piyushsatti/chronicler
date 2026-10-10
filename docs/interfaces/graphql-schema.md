# Interface: GraphQL schema

**Status:** accepted  
**Provider:** `apps/api` (exports SDL)  
**Consumers:** `apps/web`, `apps/discord` (via `@pi/contracts`)

## Rule

There is one GraphQL schema for the product. Clients consume the committed SDL in `packages/contracts/schema.graphql`. Clients do not fork or hand-edit the contract.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| Export from API schema module | `bun run export-schema` | enforced |
| Drift check vs committed SDL | `bun run check-schema` | enforced |

## Provider

Split SDL under `packages/contracts/graphql/` is the source; `scripts/merge-graphql-schema` produces the committed `schema.graphql`. The Go API generates handlers from that contract via gqlgen.

## Consumers

Web and Discord generate or import types from `@pi/contracts`. Local notes: `apps/web/README.md`, `apps/discord/docs/`.

## Related decisions

- Aggregate boundaries that shape the surface: [D26](/apps/api/docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md) (API-local)
- Expected failures as values on the wire: [D25](/apps/api/docs/decisions/D25-Expected-Failures-Are-Values.md) (API-local)

## Reopen

A second public API surface (REST for reads, alternate GraphQL) is accepted in writing with an ADR.
