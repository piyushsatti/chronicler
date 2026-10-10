# Knowledge map: product goals and system boundaries

Status: current architecture navigation with an initial implementation baseline dated 2026-09-06 and a production release observation dated 2026-09-08. This architecture docs owns intended actors, needs, goals, architecture, design and accepted decisions. Implementation observations remain in the outer project's notes; current semantic contracts travel with the application in `semantics/`. The system inventory below remains tied to its stated baseline; the release note records only what the later deployment established.

Production release observation: application revision `1da1ff12bfbb1b8d99ea7bd5c2e9c30e58e68a34` served the Vercel frontend and the Droplet API/scheduler after guarded deployment. Health/build identity, the public quest board, the GraphQL contract and bounded logs were checked. This does not convert unexercised routes, external Discord behavior, Discord OAuth, or ordinary-role journeys into verified features.

[Core reliability decisions](/docs/interfaces/README.md) records the current owner rulings and their per-surface implementation limits.

## Product and actors

Chronicler serves a West Marches Dungeons & Dragons community. Players need to find games, maintain characters and preserve their experience. DMs need to organize adventures and record outcomes. Stewards need to maintain a coherent world with appropriate visibility. Newcomers need to understand a campaign whose history precedes them. Administrators need to keep identity, rules, and operations reliable.

The central multi-person journey is organize → recruit → play externally → reconcile attendance/outcome → publish the record → discover it later. The site represents the organization and record; it does not itself perform the tabletop game. [Systems](/docs/systems.md) remains the main system index.

## Fourteen system families

| ID | Family / governing page | Main implementation responsibility | Boundary / verification posture |
|---|---|---|---|
| SYS01 | [Identity and access](/docs/systems/identity-lifecycle.md) | JWT/context, member services, capability and ownership gates | Identity, role, scope and ownership are distinct; selected local persona tests do not prove Discord OAuth |
| SYS02 | [Documents and audience](/docs/systems/documents-and-audience.md) | Document services, audience interpreter, revision/link persistence, editor | Audience, publication, deletion and edit permission are separate; selected cross-user scenarios required |
| SYS03 | [Quests and play](/docs/systems/quests-and-play.md) | Quest/signup/reward/summary services and quest pages | Capacity and participation share a transaction; full multi-person close/reward journey exceeds initial pilot |
| SYS04 | [World and map](/docs/systems/world-and-map.md) | Spatial models/services, map and location query/mutation roots | Existing API does not imply public UI availability; map routes currently placeholders |
| SYS05 | [Characters](/docs/systems/characters.md) | Character ownership, verification, progression, DDB sync | DDB snapshot is external input, not authoritative player intent; live DDB sync not part of isolated pilot |
| SYS06 | [Game time](/docs/systems/time-and-the-calendar.md) | Time/calendar models and spatial operations | In-world time differs from real quest scheduling; public calendar route currently placeholder |
| SYS07 | [Data model](/docs/systems/data-model.md) | SQLAlchemy models/repos, migrations, transaction-owning services | Ten target aggregates are design intent; model table inventory is not proof of aggregate enforcement |
| SYS08 | [Request path](/docs/systems/serving-a-request.md) | FastAPI routers, Strawberry schema/context, services/database | HTTP/GraphQL crosses language and trust boundaries; resolver registration/SDL connect contracts |
| SYS09 | [Frontend](/docs/systems/frontend.md) | React routes, GraphQL documents, query cache, components | Static route declaration differs from successful user journey |
| SYS10 | [Discord](/docs/systems/discord-bot.md) | discord.js gateway sensor → backend ingest; backend announcement clients | Observations are not authored facts; live bot/outgoing effects disabled in local QA |
| SYS11 | [Work and scheduling](/docs/systems/work-and-scheduling.md) | PostgreSQL work queue, job runners, Supercronic | No independent queue broker required by current topology; job presence does not prove scheduled operation |
| SYS12 | [Operations](/docs/systems/operations.md) | GitHub Actions release authority, Compose deployment primitives, Caddy, credentials, monitoring/backups | [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) requires Actions-only production deploy/rollback; [Secrets and credentials](/deploy/docs/secrets-overview.md) records OpenBao as a verified proposed direction, not yet an accepted credential migration |
| SYS13 | [Community and social](/docs/systems/community-and-social.md) | Directories/profiles, availability, follow/request services | Request enums do not prove decision verbs; current service has create/follow/unfollow surfaces |
| SYS14 | [Personalization and unlocks](/docs/systems/personalization-and-unlocks.md) | Member settings, unlock catalog/grants, equipment and notification preferences | Catalog membership, entitlement and equipped state are different facts |

Every family is mapped statically. Runtime verification is scenario-based and intentionally narrower. The run's inventories enumerate 73 Query fields, 66 Mutation fields and 84 frontend route declarations from the selected baseline, with code owners and source anchors. Seven route declarations are placeholders and ten are redirects. These numbers are not counts of passing features.

## Architecture and dependencies

| Component | Uses | Evidence level in initial baseline |
|---|---|---|
| Browser SPA | React 19, React Router, TanStack Query, GraphQL request client, Vite, Tailwind | Declared by frontend manifest; route/API imports establish selected use |
| Backend | Python 3.12+, FastAPI, Strawberry, Pydantic, SQLAlchemy async, asyncpg | Declared and imported; FastAPI main registers GraphQL and auth/ingest/heartbeat routers |
| Persistence | PostgreSQL, Alembic migrations | Configured and modeled; local database verification is separate evidence |
| Shared contract | SDL exported from backend, generated TypeScript documents/types | Committed contract connects frontend operations to Python root fields |
| Sensor | TypeScript, discord.js, backend API | Declared/configured and source-inspected; live gateway not exercised locally |
| Scheduled work | Supercronic, backend service/job commands, PostgreSQL queue | Compose/source configuration; schedule execution not established by a build |
| Delivery | Vercel frontend/API rewrites, Caddy/API droplet, Supabase PostgreSQL, workstation-built images and GitHub | Configuration plus the dated `1da1ff12` production observation above; rollback, provider credentials and later deployments require fresh evidence |

The current Vercel configuration rewrites `/graphql`, Discord auth and health requests to the API hostname, preserving the browser's frontend origin. Do not infer the request path solely from an older diagram.

## How knowledge is verified

Use three independent accounts: accepted architecture docs intent, current code/contracts, and experienced local UI behavior. A symbol or table name alone cannot establish domain meaning. Trace a goal through actor action, UI route, GraphQL field, resolver/service, permission check, persisted change and observed result. Confirm writes with reload plus fresh backend read. Record divergence instead of rewriting an intended rule to match a defect.

The first verification set covers anonymous discovery, open signup, full/waitlist withdrawal, draft/publication and cross-user audience/ownership. Browser discovery starts without the candidate ontology, then a second pass targets discrepancies. Red and blue independently assess a frozen evidence set; neither edits what it reviews.

All authored architecture docs Markdown belongs in the curated RAG source manifest. Search preserves original paths/revisions and authority/status labels; retrieval and project memory are recall aids, never competing authorities. Historical measurements remain dated evidence until rechecked.

Source anchors: application `apps/api/chronicler/main.py`, `graphql/queries/__init__.py`, `graphql/mutations/__init__.py`, `packages/contracts/schema.graphql`, `src/frontend/app/App.tsx`, service manifests, `vercel.json`; baseline application HEAD `5964bd5fd1b7d13095c0ae734191683393d1cd0a` with preserved working diff. Operational observations and independent reviews are maintained in the project knowledge-foundation run.
