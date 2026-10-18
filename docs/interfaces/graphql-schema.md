# Interface: GraphQL schema

**Status:** accepted; split SDL/discovery published, aggregate/runtime regeneration pending
**Provider:** packages/contracts and apps/api
**Consumers:** apps/web, apps/discord and product clients

## Rule

There is one product GraphQL SDL source under packages/contracts/graphql, recursively discovered in sorted order. Clients consume the controlled aggregate schema.graphql and generated types after root regeneration. No client forks the schema. Product queries and business commands share this contract; retained HTTP protocols are separate.

## Enforcement

| Mechanism                                      | Location                                             | Status                            |
| ---------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| Full recursive discovery and schema validation | scripts/merge-graphql-schema and TestSchemaDiscovery | implemented/tested                |
| Aggregate drift vs source                      | bun run check-schema                                 | enforced                          |
| Generated/executable field/argument parity     | TestGraphQLContract and mounted product tests        | not enforced until implementation |

## Provider

The [API contract](/apps/api/docs/graphql-contract.md) explains source/config publication, real generation prerequisites and runtime acceptance. Publishing SDL does not replace old generated handlers. No generator is run against incomplete service declarations.

## Consumers

Clients use @pi/contracts after controlled regeneration. [Breaking changes](/packages/contracts/docs/product-cutover.md) identify the unsupported old product REST adapters, retired selections and changed scalar/nullability/cursor contracts. Frontend migration remains separate.

## Related decisions

- [D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) selects the single product API.
- [D25](/apps/api/docs/decisions/D25-Expected-Failures-Are-Values.md) retains expected failure values.

## Reopen

A second product API is accepted in writing or actual client/server source discovery differs.
