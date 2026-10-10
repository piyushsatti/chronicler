# Legacy mapping (`apps/agent`)

**App:** `apps/agent`  
**Implements:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Verdict

Maps pre-monorepo Q&A packages onto `pi.chronicler.*` and records retired Rabbit transport names. Historical trees live outside this git root under operator dumps; they are not authority for runtime.

## Packages

| Legacy module | Target |
| --- | --- |
| `chronicler_agent.*` | `pi.chronicler.agent.*` |
| `chronicler_archive.*` | `pi.chronicler.archive.*` |
| `chronicler.services.qa.*` | `pi.chronicler.qa.*` |
| Discord `src/bot/qa/*` (AMQP broker) | `apps/discord/src/agent/*` (HTTP broker) |
| FastAPI in-process Q&A routes | `apps/api` REST `/v1/agent/questions*` |

## Entrypoints

| Legacy script | Target |
| --- | --- |
| `chronicler-agent` (Rabbit consumer) | `chronicler-agent` (HTTP claim loop, Phase C) |
| `chronicler-agent-eval` | `chronicler-agent-eval` |
| `chronicler-archive` | `chronicler-archive` (Phase C) |
| `chronicler-archive-reindex-dev` | same name (Phase C) |
| `chronicler-archive-benchmark` | same name (Phase C) |

## Env rename

| Legacy | Monorepo |
| --- | --- |
| `RABBITMQ_URL` + `QA_EXCHANGE` + `QA_JOBS_QUEUE` | `API_URL` + `INGEST_SECRET` (+ claim interval) |
| `QA_EVENTS_QUEUE` (Discord consume) | Discord poll `GET /v1/agent/questions/{id}` |
| Archive / LiteLLM / tokenizer pins | Unchanged names; see [environment.md](/apps/agent/docs/environment.md) |

## Deploy

| Legacy | Monorepo |
| --- | --- |
| `deploy/bot-agent/runtime/compose.yaml` (Rabbit + archive + agent) | [agent-archive-local.md](/deploy/docs/agent-archive-local.md) (HTTP; Phase B outline, Phase C fill) |

## Related

- [architecture.md](/apps/agent/docs/architecture.md)
- [port-gap-audit.md](/apps/agent/docs/port-gap-audit.md)
