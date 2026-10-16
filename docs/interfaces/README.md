# Interfaces

Boundaries both sides must honor. The systems map points here; each interface points at provider and consumer app docs. Apps implement interfaces — they do not redefine them.

Templates: [../templates/interface.md](/docs/templates/interface.md).

## Catalogue

| Interface                                                          | Rule (short)                                                                             | Enforcement                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [graphql-schema](/docs/interfaces/graphql-schema.md)               | One GraphQL SDL shared by API and clients                                                | **enforced** (`bun run check-schema`)                                                 |
| [live-authority](/docs/interfaces/live-authority.md)               | JWT is identity only; authority is read live from the member row                         | partial — request authority verified; aggregate declarations and overrides unfinished |
| [session-audience](/docs/interfaces/session-audience.md)           | One DB session per request; audience predicate bound to the session                      | not enforced                                                                          |
| [scoped-body](/docs/interfaces/scoped-body.md)                     | Renderers receive a body already scoped; they never learn the viewer                     | partial — provider verified; renderer/editor consumer unverified                      |
| [discord-sensor](/docs/interfaces/discord-sensor.md)               | Bot observes and forwards; never announces or authors facts                              | **enforced** ([sensor.test.ts](/apps/discord/tests/unit/interface/sensor.test.ts))    |
| [discord-ingest](/docs/interfaces/discord-ingest.md)               | Bot → API observation contract (normalized events)                                       | **enforced** ([ingest.test.ts](/apps/discord/tests/unit/interface/ingest.test.ts))    |
| [agent-qa-http](/docs/interfaces/agent-qa-http.md)                 | Discord and agent move Q&A jobs over ingest-secret REST (no broker)                      | **enforced**                                                                          |
| [work-queue-durability](/docs/interfaces/work-queue-durability.md) | API owns durable retry work; alerts are out of band                                      | not enforced                                                                          |
| [actions-releases](/docs/interfaces/actions-releases.md)           | Production deploy/promote/rollback only via GitHub Actions                               | not enforced (policy + workflow ownership)                                            |
| [notifications](/docs/interfaces/notifications.md)                 | Addressed events; protected display under current authority; delivery tracked separately | partial — unread count only; generation, inbox and delivery remain unfinished         |
| [media-linked](/docs/interfaces/media-linked.md)                   | Media is linked, not hosted by Chronicler                                                | not enforced                                                                          |

## Remaining enforcement gaps

Interfaces with incomplete enforcement or verification. Each owning page distinguishes implemented boundaries from remaining gaps; closing a row requires named checks at the relevant boundary.

| Interface             | Gap                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| live-authority        | Owner-only character commands, fixed platform-owner mapping and complete declaration/override audit coverage remain unfinished |
| session-audience      | No session/listener contract test named on the page                                                                            |
| scoped-body           | Renderer isolation and shared editor-vector conformance remain unverified                                                      |
| work-queue-durability | Table/worker contract not asserted in CI                                                                                       |
| actions-releases      | Relies on human/process; no mechanical block of workstation deploy                                                             |
| notifications         | Generation durability, protected inbox display, acknowledgement and channel delivery remain unfinished                         |
| media-linked          | No lint against hosting/upload paths                                                                                           |

## Link rules

- Map / systems → interfaces → `apps/<app>/docs/`
- App docs may link **up only** to interfaces they implement
- Boundary decisions in [../decisions/](/docs/decisions) are cited from interfaces

The [GraphQL product transport](/docs/interfaces/graphql-product-transport.md) is accepted design. Runtime envelope, limits and product REST removal remain unenforced until their implementation tests pass.
