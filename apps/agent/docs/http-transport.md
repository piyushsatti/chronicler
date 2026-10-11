# HTTP transport (`apps/agent`)

Q&A jobs use REST on `apps/api` with `X-Ingest-Secret`. The Python worker uses a **fenced lease** and idempotent terminal delivery. The authoritative wire schemas and bounds are in [OpenAPI](/packages/contracts/openapi.yaml); the product interface is [agent-qa-http](/docs/interfaces/agent-qa-http.md).

## Submit and poll

Discord submits `QuestionRequested` v1 to `POST /v1/agent/questions` and receives **202**. `GET /v1/agent/questions/{id}` returns **202** while open and **200** with the receipt-free `QuestionResult` when terminal. Questions are limited to 600 Unicode characters; optional history has at most 12 messages and 8 KiB of UTF-8 content. Submit, claim, renew, and retry request bodies are limited to 16 KiB. Claim responses and completion requests are limited to 64 KiB; renewal responses are limited to 16 KiB. Limits count encoded bytes, including JSON escaping.

## Worker protocol 1

- **Claim:** `POST /v1/agent/questions/claim` with `{"lease_protocol":1}` returns **204** for an empty queue or **200** with the question, `question_deadline_at`, and `lease`. Empty-body claims are rejected.
- **Renew:** `POST /v1/agent/questions/{id}/renew` with `{"lease_token":"7"}` returns the six-field `Lease` directly. It preserves the token, attempt, and attempt deadline.
- **Complete:** `POST /v1/agent/questions/{id}/complete` carries the result plus required `lease_token`. A **204** acknowledges the current terminal payload, including an identical replay after response loss. The worker serializes once and retries those exact bytes; it never replaces an uncertain success with a failure. Diagnostics are checked against Go’s normalized JSON byte size, including HTML characters and U+2028/U+2029 escaping, before the first send. Oversized diagnostics produce a safe failure without truncating the answer or sources.
- **Retry:** `POST /v1/agent/questions/{id}/retry` carries `lease_token` and `reason` (`transient_error` or `worker_shutdown`). The server chooses the retry delay. **204** releases ownership; a replay using that released receipt returns **409**.

`Lease` contains `token`, `attempt`, `expires_at`, `renew_after_seconds`, `attempt_deadline_at`, and `remaining_budget_seconds`. Tokens are positive decimal signed-int64 strings. Receipts are parsed strictly before running the question. A malformed question with a usable receipt receives a safe failure; an unusable receipt is left to server expiry and surfaces a contract error.

**409** ends the attempt without another result. **401/403** stops further claims. **422** surfaces a contract failure and stops the worker. Renewal transport failures stop the attempt because ownership could not be confirmed.

## Time and cancellation

The lease lasts 30 seconds and renews after 10 seconds. The whole question has an immutable 100-second budget from submission, including queue time and retries. The worker subtracts measured claim/renew RTT from the server's remaining budget and uses its monotonic event-loop clock. Timestamp differences describe the lease window; the worker never compares the server deadline to its own wall clock. Renewals can tighten, but cannot extend, the original local deadline.

Processing stops five seconds before the question deadline to reserve terminal delivery. An explicit stopped marker revokes the attempt before cancelling siblings. The worker checks it before freezing, sending, or releasing ordinary work, so a provider that suppresses cancellation cannot publish a new result. Model/archive awaits, renewal, and pending delivery are cancelled and joined on lease loss, shutdown, terminal acknowledgment, or deadline. Delivery requests also stop at the current lease expiry. `AGENT_HTTP_TIMEOUT_SECONDS` defaults to 5 and must be positive, finite, and at most 5.

Shutdown releases an unfinished attempt with `worker_shutdown` only after its work is joined. Once terminal delivery has started, shutdown leaves the immutable result and receipt to acknowledgment or server recovery. The API independently expires questions and publishes a safe terminal failure through its existing Go worker. Discord retains its current 120-second wait. No public cancel route is added.

## Scope and verification

The lease boundary preserves the existing admission, retrieval, grounding, source validation, and answer sequence. R10's known unsupported-answer fallback remains a separate answer-quality gap; lease correctness does not resolve it.

Mock HTTP tests cover receipts, response loss, renewal and delivery cancellation, shutdown, deadlines, payload bounds, and source compatibility. Native Postgres/API proof is recorded separately in the migration evidence. Production must run this worker with `AGENT_INLINE_COMPLETE` unset; that API flag remains a development stub.

Related: [architecture](/apps/agent/docs/architecture.md), [environment](/apps/agent/docs/environment.md), [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md).
