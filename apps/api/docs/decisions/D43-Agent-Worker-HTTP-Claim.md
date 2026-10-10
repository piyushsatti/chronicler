# D43: Agent worker claims jobs over HTTP

**Status:** decided 2026-10-10  
**Kind:** local  
**Owner:** `apps/api/docs/decisions/`  
**Interface:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Context

D42 gave the API the agent question table and left answering to `apps/agent`. Discord already submits and polls over HTTP. The legacy RabbitMQ job bus is not part of the monorepo. The worker needs a durable pull path that does not reintroduce a broker.

## Decision

`apps/api` exposes an ingest-secret **claim** route that atomically leases the oldest queued agent question and returns a `question.requested` payload. The worker finishes with `POST /v1/agent/questions/{id}/complete` for both `question.completed` and `question.failed`. Submit must create the backing job row and question in one transaction.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Restore RabbitMQ between Discord and agent | Conflicts with “no queue broker by default”; Discord already HTTP-polls |
| API embeds the model | Violates D42 agent boundary |
| Worker polls Postgres with a shared DB URL | Couples Python to API schema and credentials |

## Consequences

OpenAPI documents claim and complete. Terminal DB states use the CHECK vocabulary (`answered` / `failed`). `AGENT_INLINE_COMPLETE` remains a local stub only.

## Enforced by

OpenAPI paths for claim/complete (Phase B stub, Phase C implemented). Integration tests for submit → claim → complete → GET (Phase C). Interface [agent-qa-http](/docs/interfaces/agent-qa-http.md).

## Reopen triggers

A second transport is required for production, or agent answering moves into the API process.
