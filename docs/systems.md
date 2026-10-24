# Systems map

Chronicler is the record-keeping platform for a West Marches D&D community. Members sign in with Discord, own characters, sign up for quests, and write results down. The written record is the product.

## Verdict

- **Authoring is website-first.** Discord is a notification surface and activity sensor. Nothing the bot observes is authoritative.
- **One API, one web app, one bot, one scheduler, one database.** No service mesh; no queue broker by default.
- **Agent Q&A is HTTP-first.** Discord submits and polls the API; `apps/agent` claims and completes jobs. Archive + LiteLLM sit beside the API — still no RabbitMQ on this path.
- **Access control is the hardest product problem**, not the infrastructure.
- **Boundaries live in [interfaces/](/docs/interfaces).** System pages are thin maps that point at interfaces and owning apps.

## The fifteen systems

| System                      | Answers                                                 | Page                                                                                   |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Identity and access         | Who are you, and what may you do                        | [systems/identity-lifecycle.md](/docs/systems/identity-lifecycle.md)                   |
| Documents and audience      | Who wrote this, and who may read it                     | [systems/documents-and-audience.md](/docs/systems/documents-and-audience.md)           |
| Quests and play             | How a game gets run and recorded                        | [systems/quests-and-play.md](/docs/systems/quests-and-play.md)                         |
| World and map               | Where things are, and who knows they exist              | [systems/world-and-map.md](/docs/systems/world-and-map.md)                             |
| Characters                  | Who owns a character sheet and who may change it        | [systems/characters.md](/docs/systems/characters.md)                                   |
| Game time                   | What the in-world date is                               | [systems/time-and-the-calendar.md](/docs/systems/time-and-the-calendar.md)             |
| Data model                  | What the nouns are and where their boundaries run       | [systems/data-model.md](/docs/systems/data-model.md)                                   |
| Request path                | What happens between a click and a row                  | [systems/serving-a-request.md](/docs/systems/serving-a-request.md)                     |
| Frontend                    | How the browser fetches, caches, and renders            | [systems/frontend.md](/docs/systems/frontend.md)                                       |
| Discord                     | What the bot may and may not do                         | [systems/discord-bot.md](/docs/systems/discord-bot.md)                                 |
| Agent Q&A                   | How a mention becomes a grounded public answer          | [systems/agent-qa.md](/docs/systems/agent-qa.md)                                       |
| Work and scheduling         | What runs without a person asking                       | [systems/work-and-scheduling.md](/docs/systems/work-and-scheduling.md)                 |
| Operations                  | How releases, backups, and recovery work                | [systems/operations.md](/docs/systems/operations.md)                                   |
| Community and social        | How members find, follow, and ask things of each other  | [systems/community-and-social.md](/docs/systems/community-and-social.md)               |
| Personalization and unlocks | What a member can change, and what they must earn first | [systems/personalization-and-unlocks.md](/docs/systems/personalization-and-unlocks.md) |

## Seams → interfaces

| Seam                                              | Interface                                                |
| ------------------------------------------------- | -------------------------------------------------------- |
| Browser to API (JWT identity only)                | [live-authority](/docs/interfaces/live-authority.md)     |
| API to database (one session; audience bound)     | [session-audience](/docs/interfaces/session-audience.md) |
| Document to reader (body already scoped)          | [scoped-body](/docs/interfaces/scoped-body.md)           |
| Discord to the record (observations, never facts) | [discord-sensor](/docs/interfaces/discord-sensor.md)     |
| Discord / agent / API Q&A jobs (HTTP, no broker)  | [agent-qa-http](/docs/interfaces/agent-qa-http.md)       |
| Shared GraphQL SDL                                | [graphql-schema](/docs/interfaces/graphql-schema.md)     |
| Production releases                               | [actions-releases](/docs/interfaces/actions-releases.md) |

## Related

- [requirements/](/docs/requirements/README.md) · [semantics/](/docs/semantics/README.md) · [decisions/](/docs/decisions/README.md)
- [interfaces/](/docs/interfaces/README.md) · [overview.md](/docs/overview.md) (monorepo map)
- App docs: `apps/*/docs/` · Runbooks: [deploy/docs/](/deploy/docs/README.md)

## Deployment

The release pattern is a deployment pipeline with one production control plane: GitHub Actions. Staging uses a manually dispatched workflow on the owner's self-hosted machine. Production uses a CalVer tag that points to `main`, then deploys the backend and frontend through one Actions release.

Staging targets `chronicler.piyushsatti.com` and `chronicler-api.piyushsatti.com`. Production targets `chronicler.smokebombstudios.com` and `api.chronicler.smokebombstudios.com`. The production backend and PostgreSQL target one DigitalOcean droplet.

The staging and production release workflows are not implemented. Production Compose does not define PostgreSQL, ingress, or migrations. See [operations](/docs/systems/operations.md), [release requirements](/docs/requirements/by-system/operations.md), and the [deployment guides](/deploy/docs/README.md) for the current gaps.
