# Agent + Archive local stack

## Verdict

Local/dev topology for HTTP-first Q&A: Go API, Archive MCP, agent worker, external LiteLLM. **No RabbitMQ.**

Compose: [../compose/agent-archive.yml](/deploy/compose/agent-archive.yml).

## Services

| Service            | Build                           | Role                            |
| ------------------ | ------------------------------- | ------------------------------- |
| `archive`          | `apps/agent/Dockerfile.archive` | LanceDB index + MCP tools       |
| `agent`            | `apps/agent/Dockerfile`         | Claim/complete worker + harness |
| API (external)     | existing API compose / process  | Job store + anonymous GraphQL   |
| LiteLLM (external) | operator gateway                | Chat + embeddings               |

## Bootstrap

1. Start API with `INGEST_SECRET` and GraphQL serving public documents.
2. Export env from [apps/agent/docs/environment.md](/apps/agent/docs/environment.md) (minimum: secrets, LiteLLM, tokenizer pins, `ARCHIVE_MCP_TOKEN`).
3. `docker compose -f deploy/compose/agent-archive.yml up --build`
4. Empty LanceDB: run `chronicler-archive-reindex-dev` with a public snapshot, or wait for index interval + live GraphQL sync once bootstrap vars are set.

## Smoke path

1. `POST /v1/agent/questions` with ingest secret (or Discord with `AGENT_ENABLED=true`).
2. Agent container claims and completes.
3. `GET /v1/agent/questions/{id}` returns `question.completed` or `question.failed`.

## Related

- [deployment runbook](/deploy/docs/deploy-runbook.md)
- Interface: [agent-qa-http](/docs/interfaces/agent-qa-http.md)
