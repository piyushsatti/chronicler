# Port gap audit (`apps/agent`)

**App:** `apps/agent`  
**Implements:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Verdict

This page records what first-party docs and code claimed before the HTTP-first agent port, versus the target in [architecture.md](/apps/agent/docs/architecture.md). It is a living checklist until Phase C closes each gap.

## Status legend

| Status | Meaning |
| --- | --- |
| accurate | Matches target HTTP path today |
| stale | Contradicts target or claims shipped work that is not done |
| partial | Some truth; missing archive, claim route, or deploy |
| missing | Required page did not exist |

## Inventory

| Page | Status | Notes |
| --- | --- | --- |
| [apps/agent/README.md](/apps/agent/README.md) | partial | Layout correct; still describes Rabbit-style `.env` and incomplete archive |
| [apps/agent/docs/README.md](/apps/agent/docs/README.md) | stale | Claimed agent/archive code was placeholder after agent harness landed |
| [apps/agent/src/.../agent/README.md](/apps/agent/src/pi/chronicler/agent/README.md) | stale | Placeholder title only |
| [apps/agent/src/.../archive/README.md](/apps/agent/src/pi/chronicler/archive/README.md) | stale | Placeholder; archive not ported |
| [apps/agent/.env.example](/apps/agent/.env.example) | stale | RabbitMQ vars; target is `API_URL` / `INGEST_SECRET` |
| [apps/discord/docs/mentions.md](/apps/discord/docs/mentions.md) | accurate | HTTP POST + poll already documented |
| [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md) | partial | Agent boundary correct; does not name claim route |
| [docs/overview.md](/docs/overview.md) | stale | Still describes API as FastAPI Python |
| [docs/systems.md](/docs/systems.md) | partial | “No queue broker by default” fits HTTP; no Agent Q&A system row |
| Discord system page (map) | stale (fixed in Phase A) | Previously ignored the mention agent path |
| [deploy/docs/staging-flip-status.md](/deploy/docs/staging-flip-status.md) | partial | Ingest/agent row assumes worker exists; claim not shipped |
| OpenAPI agent paths | partial | Submit + get present; claim + complete missing from public OpenAPI |
| Deploy agent/archive compose | missing | Legacy Rabbit compose not in monorepo `deploy/` |
| [architecture.md](/apps/agent/docs/architecture.md) | was missing | Added in Phase A |
| [http-transport.md](/apps/agent/docs/http-transport.md) | was missing | Added in Phase A |
| [archive.md](/apps/agent/docs/archive.md) | was missing | Added in Phase A |
| [environment.md](/apps/agent/docs/environment.md) | was missing | Added in Phase A |
| [legacy-mapping.md](/apps/agent/docs/legacy-mapping.md) | was missing | Added in Phase A |

## Phase C closure

| Former gap | Resolution |
| --- | --- |
| Submit without `background_jobs` row | `CreateAgentQuestion` inserts job + question |
| `completed` vs `answered` | Terminal states `answered` / `failed`; claim uses `claimed` |
| No claim route | `POST /v1/agent/questions/claim` |
| OpenAPI incomplete | claim + complete documented |
| Rabbit worker | HTTP claim/complete worker; Rabbit env retired |
| Archive absent | `pi.chronicler.archive` + `pi.chronicler.qa` ported |

## Retired (do not document as current)

Legacy Discord ↔ agent **RabbitMQ** transport (`QA_EXCHANGE`, `QA_JOBS_QUEUE`, `QA_EVENTS_QUEUE`). Historical reference only in [legacy-mapping.md](/apps/agent/docs/legacy-mapping.md).

## Related

- [architecture.md](/apps/agent/docs/architecture.md)
- [http-transport.md](/apps/agent/docs/http-transport.md)
- Interface: [agent-qa-http](/docs/interfaces/agent-qa-http.md)
