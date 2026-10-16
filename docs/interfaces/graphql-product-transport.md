# Interface: GraphQL product transport

**Status:** accepted design; runtime implementation pending
**Provider:** apps/api
**Consumers:** apps/web and product clients; Discord/agent retain their declared machine protocols

## Rule

All product reads and business commands use POST /v1/graphql with one selected JSON operation. Authentication, health, Discord observation ingest/heartbeat and agent question operations retain HTTP as declared in packages/contracts/openapi.yaml. No product REST compatibility wrapper remains after the planned breaking cutover.

GraphQL uses the current apierr vocabulary in errors.extensions.code. Pure request validation precedes authority SQL. Expected admission failures are values; unexpected failures are opaque INTERNAL. Commands own independent transactions and replay receipts; required in-app notification/history effects commit with the originating action. Reads never reconcile or acknowledge rows.

## Enforcement

| Mechanism                                           | Location                                                  | Status                            |
| --------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Full schema/discovery validation                    | scripts/merge-graphql-schema and TestSchemaDiscovery      | implemented and tested            |
| Envelope/codecs/current authority/limits            | GraphQL handler, G05 codecs and mounted integration tests | not enforced until implementation |
| Replaced route removal and retained protocol checks | W03/LEGHTTP and S03/S04 integration tests                 | not enforced until cutover        |

## Provider

The [API contract](/apps/api/docs/graphql-contract.md) owns implementation guidance. Exact [transport](/apps/api/docs/design/graphql-product/transport-contract.md), [authority](/apps/api/docs/design/graphql-product/authority-request-contract.md), [replay](/apps/api/docs/design/graphql-product/command-fingerprint-contract.md) and [performance](/apps/api/docs/design/graphql-product/performance.md) contracts are accepted design. The API fails closed for absent services. External delivery remains asynchronous.

## Consumers

Clients consume the shared split SDL and generated contracts after controlled regeneration. Existing frontend REST adapters and incompatible selections are explicitly outside the backend migration. OAuth, Discord sensor and agent consumers continue their existing declared HTTP authentication/error protocols.

## Related decisions

- [D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) replaces the product transport split.
- [D25](/apps/api/docs/decisions/D25-Expected-Failures-Are-Values.md) keeps expected failures as values.
- [D27](/docs/decisions/D27-One-Session-Per-Request.md) binds task-local database work.

## Reopen

A new machine protocol or measured resource limit requires an accepted boundary change.
