# GraphQL contract publication and execution

The accepted product contract is published but its backend implementation remains planned. The API still contains old generated models, resolvers and mounted product REST handlers pending the scheduled cutover. A package/comment scaffold, SDL parse or old unit test is not executable GraphQL acceptance.

The provider implements [graphql-schema](/docs/interfaces/graphql-schema.md), [GraphQL transport](/docs/interfaces/graphql-product-transport.md), [live authority](/docs/interfaces/live-authority.md) and [session audience](/docs/interfaces/session-audience.md). The [product design reference](/apps/api/docs/design/graphql-product/README.md) owns the exact domain/interface/storage contracts.

## Schema and discovery

The recursive split SDL in packages/contracts/graphql is the source. scripts/merge-graphql-schema discovers every .graphql file in sorted relative-path order, fully parses and validates the combined schema, rejects duplicate definitions/fields and invalid references, then atomically replaces the root-controlled aggregate. The pinned gqlgen schema pattern is the same recursive set. TestSchemaDiscovery exercises nested-source parity, deterministic bytes and failure preservation using an exact-script scratch fixture. No aggregate or codegen output is authored by contract publication.

**M1 roots and gqlgen.** Contract roots are `_roots.graphql` (empty `Query` / `Mutation` plus `_contractLayoutStub`). gqlgen emits `_roots.resolvers.go`, which the Go toolchain ignores. Keep compiled root resolvers in `internal/graph/roots.resolvers.go` after each `gqlgen generate`. Domain fields stay on `extend type Query/Mutation` in domain `operations.graphql` files.

The accepted contract has 82 business queries and 82 mutations. Full parsed field/argument/type comparisons belong to TestGraphQLContract and the mounted integration tests after generation. Historical Python QUERY_AUTH_REGISTRY and MUTATION_AUTH_REGISTRY inventories do not authorize Go operations. The exact Go policy and current resolved Authority govern execution.

## Request and command rules

POST /v1/graphql accepts one selected JSON operation, no array batch, upload or subscription. Pure syntax/type/scalar/depth/cost checks precede authority SQL. The [transport contract](/apps/api/docs/design/graphql-product/transport-contract.md) specifies UUID/Date/Time/DateTime/JSON codecs, pinned String conversion, omittable patches and serialization failure behavior. Defaults and bounds are normative in SDL and the [performance contract](/apps/api/docs/design/graphql-product/performance.md).

Expected failures retain the six apierr codes in GraphQL errors.extensions.code. Missing dependencies and unexpected persistence failures fail closed with opaque INTERNAL. Current capabilities and immutable aggregate ownership precede replay admission. A matching receipt precedes one-time lifecycle/version/existence preconditions. Each new command owns one uow transaction, including required history/inbox rows and durable work admission. Repositories never commit; reads never mutate. Multiple mutation roots do not share a transaction. Remote delivery/fetching holds no business transaction.

Request loaders carry exact keys, argument predicates and pagination, preserve duplicate/missing correspondence, and isolate requests and authority scopes. Successful commands invalidate all request loaders; caller authority refresh follows the accepted authority contract. No shared request transaction or serialized read session is introduced.

## Cutover and truthful status

[D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) now selects GraphQL for every product query and command. Retained HTTP protocols are declared in packages/contracts/openapi.yaml. Field routing and frontend incompatibilities are published in packages/contracts. Existing product HTTP handlers remain only until their scheduled W03/LEGHTTP removal; their continued presence is not a second accepted product contract.

S01 discovery is implemented and tested during contract publication. Shared types, migrations, repositories, commands, loaders, resolvers, transport handlers and runtime integration remain unimplemented unless their individual evidence establishes otherwise. The [generation order](/apps/api/docs/design/graphql-product/generation-order-contract.md) requires real providers, controlled archival of obsolete graph sources, source-complete coupled graph declarations, then generation and later mapper/resolver implementation. No fake declarations or disabled generator validation bridge those prerequisites.
