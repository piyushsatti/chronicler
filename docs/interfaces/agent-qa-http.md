# Interface: agent-qa-http

**Status:** accepted  
**Provider:** `apps/api`  
**Consumers:** `apps/discord`, `apps/agent`

## Rule

Discord and the Python agent worker exchange grounded Q&A jobs only through ingest-secret REST on the API. No message broker is required on this path. The API persists jobs; the agent answers; Discord polls for the result.

## Enforcement

| Mechanism                      | Location                                    | Status                                                      |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| OpenAPI agent question schemas | `packages/contracts/openapi.yaml`           | defined (submit/get/claim/renew/retry/complete)             |
| OpenAPI ↔ mux contract test    | `apps/api/test/contract`                    | enforced                                                    |
| Discord broker unit tests      | `apps/discord/tests/unit/agent/`            | enforced (HTTP submit/parse)                                |
| Discord agent contract test    | `apps/discord/tests/unit/interface/agent.test.ts` | enforced (limits, WAIT_MS vs deadline)                |
| API agent handler tests        | `apps/api/internal/agent`                   | unit-tested (protocol, bounds, receipt and replay behavior) |
| Agent worker HTTP tests        | `apps/agent/tests/`                         | enforced (`bun run test:agent` / `agent.yml`)               |

## Provider

`apps/api` owns the sole lifecycle authority in `background_jobs` and the question/result projection in `agent_questions`. It serves submit/get and receipt-fenced claim/renew/retry/complete. Design: [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md), [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md). App notes: agent routes under `apps/api` internal agent package.

## Lease protocol 1

Claim requires `{"lease_protocol":1}`. Empty legacy claims return 422 before taking work. Claim returns the question plus `question_deadline_at` and six-field `lease`; renewal returns that lease directly. Completion adds `lease_token` to the result, with body UUID equal to the path. Exact current terminal replay returns 204; changed results, superseded tokens and released retry receipts return 409. Workers relinquish ownership after retry 204 or 409. Terminal results are immutable; failed answers atomically set the job to `dead`.

The owner selected 30-second agent leases, 10-second renewal and an immutable 100-second whole-question deadline, preserving the existing 120-second Discord wait. Queue time and retries consume the same budget. Agent `attempt_deadline_at` equals `question_deadline_at`; renewal preserves both. Consumers subtract request round-trip time from server remaining budget and reserve five seconds for bounded completion delivery. A separate Go worker sweep commits safe overdue failures; GET remains read-only.

Request limits: submit/claim/renew/retry 16 KiB; completion 64 KiB. Response limits: claim 64 KiB; renewal 16 KiB. [OpenAPI](/packages/contracts/openapi.yaml) defines field bounds and normalization. No public cancellation route or historical attempt ledger is added. [D44](/apps/api/docs/decisions/D44-Leased-Work-With-Fencing.md) records migration and external-effect limits.

## Consumers

| Consumer       | Reliance                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| `apps/discord` | [mentions.md](/apps/discord/docs/mentions.md) — POST then poll                |
| `apps/agent`   | [http-transport.md](/apps/agent/docs/http-transport.md) — claim then complete |

## Archive evidence

The answer worker reads Archive MCP evidence. Archive obtains current anonymous bodies from GraphQL `effectiveBody`, with candidate eligibility checked on every read. Bootstrap snapshots pin candidate identities and file integrity; they cannot authorize disclosure of frozen text.

The Archive reads only document IDs from the database view `archive_documents_v1` (migration `0015`), which applies SQL `document_readable` for an anonymous viewer. Bodies come from the anonymous GraphQL `effectiveBody`, so Go remains the only marker projector ([D50](/docs/decisions/D50-Archive-Uses-Current-Anonymous-Projections.md)). See [Archive](/apps/agent/docs/archive.md) and the [local stack](/deploy/docs/agent-archive-local.md).

## Related decisions

- [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md) — worker binary and agent boundary
- [D44](/apps/api/docs/decisions/D44-Leased-Work-With-Fencing.md) — accepted leases, fencing and two-minute journey
- [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md) — HTTP claim extends D42

## Reopen

Evidence that HTTP claim/poll cannot meet latency or durability for production answering, or a product decision to restore a broker.
