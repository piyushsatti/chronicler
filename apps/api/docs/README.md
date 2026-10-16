# API app docs (`apps/api`)

## Implements

| Interface                                                          | Role                             |
| ------------------------------------------------------------------ | -------------------------------- |
| [graphql-schema](/docs/interfaces/graphql-schema.md)               | Owns and exports the SDL         |
| [live-authority](/docs/interfaces/live-authority.md)               | Builds Authority per request     |
| [session-audience](/docs/interfaces/session-audience.md)           | Session + audience predicate     |
| [scoped-body](/docs/interfaces/scoped-body.md)                     | Scopes bodies before return      |
| [discord-sensor](/docs/interfaces/discord-sensor.md)               | Owns announce / outbound Discord |
| [discord-ingest](/docs/interfaces/discord-ingest.md)               | Accepts observations             |
| [work-queue-durability](/docs/interfaces/work-queue-durability.md) | Durable work table               |
| [media-linked](/docs/interfaces/media-linked.md)                   | Link-only media policy           |

## Topics

[Endpoint review baseline](/apps/api/docs/endpoint-review.md) — operation inventory, seed drift, coverage limits and sequential acceptance gates; versioned project-memory snapshot linked there.

[Content boundary review](/apps/api/docs/content-boundary-review.md) records authored-content and operational-data ownership findings, source limits, and open design decisions.

| Doc                                                                 | Use                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| [backend-working-rules.md](/apps/api/docs/backend-working-rules.md) | Layering, session commit footgun                     |
| [schema-v2.md](/apps/api/docs/schema-v2.md)                         | v2 database schema reference                         |
| [auth-flow.md](/apps/api/docs/auth-flow.md)                         | Discord OAuth and hybrid v2 JWT claims               |
| [background-work.md](/apps/api/docs/background-work.md)             | Durable background work plane                        |
| [worker-env.md](/apps/api/docs/worker-env.md)                       | Worker Discord delivery, dry-run, coalesce/reconcile |
| [graphql-contract.md](/apps/api/docs/graphql-contract.md)           | SDL, auth registries, drift enforcement              |
| [backend-stack.md](/apps/api/docs/backend-stack.md)                 | Languages, runtime, dependencies                     |
| [object-storage.md](/apps/api/docs/object-storage.md)               | Object storage and multimedia                        |
| [capacity.md](/apps/api/docs/capacity.md)                           | Capacity levers and attribution                      |
| [design/](/apps/api/docs/design/README.md)                          | Cross-app seams via interfaces                       |
| [decisions/](/apps/api/docs/decisions)                              | API-local D-records                                  |

Parent: [../README.md](/apps/api/README.md).

Accepted product API design and implementation status: [GraphQL product](/apps/api/docs/design/graphql-product/README.md).
