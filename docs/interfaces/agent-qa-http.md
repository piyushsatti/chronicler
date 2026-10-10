# Interface: agent-qa-http

**Status:** accepted  
**Provider:** `apps/api`  
**Consumers:** `apps/discord`, `apps/agent`

## Rule

Discord and the Python agent worker exchange grounded Q&A jobs only through ingest-secret REST on the API. No message broker is required on this path. The API persists jobs; the agent answers; Discord polls for the result.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| OpenAPI agent question schemas | `packages/contracts/openapi.yaml` | enforced (submit/get/claim/complete) |
| OpenAPI ↔ mux contract test | `apps/api/test/contract` | enforced |
| Discord broker unit tests | `apps/discord/tests/unit/agent/` | enforced (HTTP submit/parse) |
| API agent handler tests | `apps/api/internal/agent` | enforced (submit/claim/complete/get) |
| Agent worker HTTP tests | `apps/agent/tests/` | enforced (`bun run test:agent` / `agent.yml`) |

## Provider

`apps/api` owns `agent_questions` (and the linked job row), `POST/GET /v1/agent/questions`, worker claim, and complete/failed. Design: [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md), [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md). App notes: agent routes under `apps/api` internal agent package.

## Consumers

| Consumer | Reliance |
| --- | --- |
| `apps/discord` | [mentions.md](/apps/discord/docs/mentions.md) — POST then poll |
| `apps/agent` | [http-transport.md](/apps/agent/docs/http-transport.md) — claim then complete |

## Related decisions

- [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md) — worker binary and agent boundary
- [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md) — HTTP claim extends D42

## Reopen

Evidence that HTTP claim/poll cannot meet latency or durability for production answering, or a product decision to restore a broker.
