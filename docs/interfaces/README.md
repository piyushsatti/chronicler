# Interfaces

Boundaries both sides must honor. The systems map points here; each interface points at provider and consumer app docs. Apps implement interfaces — they do not redefine them.

Templates: [../templates/interface.md](/docs/templates/interface.md).

## Catalogue

| Interface | Rule (short) | Enforcement |
| --- | --- | --- |
| [graphql-schema](/docs/interfaces/graphql-schema.md) | One GraphQL SDL shared by API and clients | **enforced** (`bun run check-schema`) |
| [live-authority](/docs/interfaces/live-authority.md) | JWT is identity only; authority is read live from the member row | not enforced |
| [session-audience](/docs/interfaces/session-audience.md) | One DB session per request; audience predicate bound to the session | not enforced |
| [scoped-body](/docs/interfaces/scoped-body.md) | Renderers receive a body already scoped; they never learn the viewer | not enforced |
| [discord-sensor](/docs/interfaces/discord-sensor.md) | Bot observes and forwards; never announces or authors facts | **enforced** ([sensor.test.ts](/apps/discord/tests/unit/interface/sensor.test.ts)) |
| [discord-ingest](/docs/interfaces/discord-ingest.md) | Bot → API observation contract (normalized events) | **enforced** ([ingest.test.ts](/apps/discord/tests/unit/interface/ingest.test.ts)) |
| [work-queue-durability](/docs/interfaces/work-queue-durability.md) | API owns durable retry work; alerts are out of band | not enforced |
| [actions-releases](/docs/interfaces/actions-releases.md) | Production deploy/promote/rollback only via GitHub Actions | not enforced (policy + workflow ownership) |
| [media-linked](/docs/interfaces/media-linked.md) | Media is linked, not hosted by Chronicler | not enforced |

## Not enforced

Interfaces whose Enforcement table has no green check today. Closing a row means naming a schema check, test, or CI job on the interface page.

| Interface | Gap |
| --- | --- |
| live-authority | No import/test gate that JWT claims are not used as roles |
| session-audience | No session/listener contract test named on the page |
| scoped-body | No renderer-isolation test named |
| work-queue-durability | Table/worker contract not asserted in CI |
| actions-releases | Relies on human/process; no mechanical block of workstation deploy |
| media-linked | No lint against hosting/upload paths |

## Link rules

- Map / systems → interfaces → `apps/<app>/docs/`
- App docs may link **up only** to interfaces they implement
- Boundary decisions in [../decisions/](/docs/decisions) are cited from interfaces
