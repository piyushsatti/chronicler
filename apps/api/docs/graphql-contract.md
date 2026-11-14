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

## Demand control

The mounted handler applies the GraphQL demand control pattern before resolvers run. `DefaultLimits()` allows field depth 12, complexity 100000, and 20 aliased root fields. Depth starts at one for a root field, expands named and inline fragments, counts aliased fields, and checks only the selected operation. Skipped selections do not add depth. Introspection follows the same depth check and is enabled outside production only (`HTTPDeps.Introspection` / `cfg.Env != production`).

The typed `graph.ListComplexity()` configures gqlgen's cost calculation. A scalar costs one, an ordinary object costs one plus its children, and a paginated field costs `1 + max(1, limit) * childCost`. The field owning `limit` applies the multiplier. A page's `items`, `entries`, or `summaries` field does not multiply that page again. Nested pagination adds its own multiplier. Addition and multiplication saturate at the largest Go integer. Zero or negative limits cannot lower the cost below the child cost. Domain page validation still governs their admission: root `limit`/`offset` page arguments use `product.ValidPage` with `MaxPageLimit` 100 (`limit` in 1..100, `offset` >= 0). Nested list limits such as `pointcrawlNodes` are not under that shared maximum.

Implicit object lists use cost estimates from the product cardinalities contract. Home uses six buckets of five documents. Availability uses 28 slots, scheduled work uses two entries, and calendar grids use 366 cells. Role counts use seven roles, kind counts and search kinds use 20 entries, and quest state counts use five entries. Other implicit object collections use 100 entries. List-valued mutations use their input list lengths. These estimates do not enforce new result-size limits. Scalar arrays retain gqlgen's scalar cost.

Gqlgen v0.17.78 counts aliases and fragment uses in complexity and conservatively includes selections behind `skip` and `include`. Rejections return GraphQL errors before provider calls, with `DEPTH_LIMIT_EXCEEDED`, `COMPLEXITY_LIMIT_EXCEEDED`, or `ALIAS_LIMIT_EXCEEDED`. The installed POST transport returns HTTP 200 for these extension errors.

`TestSupportedWebOperationsFitDefaultComplexityBudget` discovers and validates the checked-in web operations. Its page envelope is 200, with the actual nested-screen sizes of 50 for QuestBoard and QuestList, 100 for MemberUpcoming, and 25 for AdminOperations. These sizes come from `useQuestBoardPage.ts`, `memberHubAdapter.ts`, `useAdminOperations.ts`, and the map and directory adapters. The 2026-10-29 calculation covered 181 operations. The largest estimate was ChronicleList at 85203 under the conservative 200-row envelope. MapAtlas cost 63413, QuestBoard and QuestList each cost 31351, MemberUpcoming cost 30901, and AdminOperations cost 4876. A three-level arc list with 50 quests per level exceeds the budget while remaining within depth 12. These are static costs, not server-capacity measurements.

## Cutover and truthful status

[D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) now selects GraphQL for every product query and command. Retained HTTP protocols are declared in packages/contracts/openapi.yaml. Field routing and frontend incompatibilities are published in packages/contracts. Existing product HTTP handlers remain only until their scheduled W03/LEGHTTP removal; their continued presence is not a second accepted product contract.

S01 discovery is implemented and tested during contract publication. Shared types, migrations, repositories, commands, loaders, resolvers, transport handlers and runtime integration remain unimplemented unless their individual evidence establishes otherwise. The [generation order](/apps/api/docs/design/graphql-product/generation-order-contract.md) requires real providers, controlled archival of obsolete graph sources, source-complete coupled graph declarations, then generation and later mapper/resolver implementation. No fake declarations or disabled generator validation bridge those prerequisites.
