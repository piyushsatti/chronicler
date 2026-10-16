# D40: GraphQL product operations and retained HTTP protocols

**Status:** decided 2026-10-14; supersedes the 2026-10-09 routing rule
**Kind:** local
**Owner:** apps/api/docs/decisions/
**Interface:** [GraphQL transport](/docs/interfaces/graphql-product-transport.md)

## Context

The earlier rule split nested reads onto GraphQL and fixed reads/commands onto REST. The owner-approved backend plan replaces that split with one authoritative product schema and accepts a breaking cutover.

## Decision

Every product query and business command uses POST /v1/graphql. Authentication, health, Discord observation ingest/heartbeat and the agent question protocol retain HTTP. Reads perform no hidden writes. Explicit commands own their unit of work, replay receipt and required history/notification effects.

## Alternatives rejected

| Alternative                                     | Why rejected                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| Retain fixed reads and commands as product REST | Preserves two competing product contracts                               |
| REST wrappers over GraphQL commands             | Preserves an unapproved compatibility API                               |
| Delete protocol HTTP endpoints                  | Breaks authentication and machine protocols outside the product cutover |

## Consequences

Field routing and retained HTTP contracts are published in packages/contracts. Existing frontend REST adapters, retired fields and changed scalar/nullability/pagination selections require a separate frontend migration. The backend work leaves apps/web untouched. Publication/scaffolds do not remove current routes or implement the new behavior; those actions await their implementation owners.

## Enforced by

TestSchemaDiscovery enforces complete deterministic SDL discovery. Product GraphQL/runtime cutover remains **not enforced** until TestGraphQLContract, mounted product/mutation tests and route-removal tests pass.

## Reopen triggers

A separately accepted protocol requires a new boundary, or measured operation behavior contradicts the single product schema.
