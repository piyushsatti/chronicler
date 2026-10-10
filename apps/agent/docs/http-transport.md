# HTTP transport (`apps/agent`)

**App:** `apps/agent`  
**Implements:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Verdict

All Q&A job movement uses REST on `apps/api` with `X-Ingest-Secret`. Discord submits and polls. The Python worker claims and completes. RabbitMQ is not part of this path.

## Discord → API

| Step | Method | Body / behavior |
| --- | --- | --- |
| Submit | `POST /v1/agent/questions` | `QuestionRequested` v1 (`type: question.requested`, UUID `job_id`, question, optional history) → **202** |
| Poll | `GET /v1/agent/questions/{id}` | **202** / **204** while open; **200** + `QuestionResult` when terminal |

Anchors: Discord `submitQuestion`; OpenAPI `QuestionRequested` / `QuestionResult`.

History (when present): `{ messages: [{role, content}], incomplete: boolean }` — max 12 messages, 8 KiB UTF-8 content, job body ≤ 16 KiB. Question ≤ 600 characters.

## Worker → API (target; Phase C)

| Step | Method | Behavior |
| --- | --- | --- |
| Claim | `POST /v1/agent/questions/claim` | Atomically take oldest `queued` row; return same shape as a Discord job payload |
| Complete | `POST /v1/agent/questions/{id}/complete` | Body `question.completed` or `question.failed`; persist terminal result |

Claim response must satisfy worker parse rules: `version == 1`, `type == question.requested`, UUID `job_id`, non-empty question.

## Job lifecycle (target states)

| DB `agent_questions.state` | Meaning |
| --- | --- |
| `queued` | Accepted; waiting for worker |
| `claimed` | Leased by a worker via claim |
| `answered` | Terminal success (`question.completed` stored in `result`) |
| `failed` | Terminal failure (`question.failed` stored in `result`) |
| `cancelled` | Reserved; not used by Discord path today |

GET returns **200** only for terminal success/failure with a stored result body. Open jobs return **202**.

## States in practice

| DB `agent_questions.state` | GET |
| --- | --- |
| `queued` / `claimed` | **202** |
| `answered` / `failed` | **200** + result JSON |

Submit creates `background_jobs` + `agent_questions` together. Claim sets `claimed`. Complete sets `answered` or `failed`.

## Dev stub

`AGENT_INLINE_COMPLETE=1` on the API may answer immediately with a stub string for local Discord tests. Production must leave it unset and run `apps/agent`.

## Related

- [architecture.md](/apps/agent/docs/architecture.md)
- [environment.md](/apps/agent/docs/environment.md)
- API decision: [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md)
