# D44: Leased work queue with fencing token

**Status:** accepted 2026-10-10  
**Kind:** local  
**Owner:** `apps/api/docs/decisions/`  
**Interface:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Decision

The owner approved the public leased-worker seam and preserving the existing two-minute Discord journey. Use the established **leased work queue with fencing token** pattern. `background_jobs` alone owns lifecycle, attempts, deadlines and monotonic receipt tokens. `agent_questions` holds request/result data and derives its public status from the backing job. No broker or duplicate question state machine is introduced.

A transaction locks the backing row, samples `clock_timestamp()` after that lock, checks the receipt and time bounds, then commits related state/result writes together through `uow.Runner.Do`. A claim increments the signed-64-bit token and attempt count. Tokens cross HTTP as positive decimal strings. Expired claims may be reclaimed; stale workers cannot renew, retry or finish. The eighth exhausted claim becomes terminal. Generic stable-key re-enqueue resets attempts but preserves the token.

## Timing and wire contract

| Concern         | Agent questions                                                               | Go delivery/maintenance jobs             |
| --------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| Lease / renewal | 30 seconds / 10 seconds                                                       | 120 seconds / 40 seconds                 |
| Deadline        | Immutable 100 seconds from submission, including queue and retries            | 10 minutes per attempt                   |
| Result delivery | Stop model work 5 seconds before deadline; bound delivery to remaining budget | Context cancellation plus receipt checks |
| Caller          | Existing Discord 120-second wait                                              | Existing durable jobs                    |

These are accepted budgets, not measured production latency guarantees. Model and provider calls must use the remaining budget; renewal never extends the question deadline. A separate bounded Go worker sweep terminalizes overdue queued/running/retry questions with a safe `question.failed` result. Reads stay read-only. A full worker or database outage can still prevent a response within the caller budget.

[OpenAPI](/packages/contracts/openapi.yaml) is the wire authority. Claim requires `lease_protocol: 1`; empty legacy claims fail before taking work. Claim returns the request plus `question_deadline_at` and a lease. Renew returns the lease directly. Complete carries `lease_token` and a body `job_id` equal to the path. Retry carries the token and an enumerated reason; the API owns backoff. Submit/poll remain receipt-free.

Choose the lean acknowledgment contract: identical normalized terminal completion with the current token returns 204 without another write. Changed payloads and expired, superseded or released receipts return 409. Retrying an already released retry receipt returns 409; workers relinquish ownership after either 204 or 409. `question.failed` commits job `dead` and the failure result together. The retained operator cancellation command uses the public job UUID without a worker receipt, including never-claimed queued work and released retries. It locks the row, samples the database clock and atomically projects question cancellation. Succeeded/dead/repair-required/cancelled rows stay immutable. This decision adds no public cancellation route.

## Migration and compatibility

The consolidated [initial schema](/apps/api/db/migrations/0001_init.sql) defines lease tokens, live timestamp checks, completion pairs, question deadlines and partial indexes. `agent_questions` has no lifecycle state column. This is a fresh-database baseline; the former incremental `0002_job_leases.sql` lock/preflight refusal and rollback guard are absent from the current migration set.

Existing Goose histories are unresolved (`SCHEMA-HISTORY-01`). Applying the current files does not rerun an already-applied version 1 or reconcile former versions 2/3. Do not convert or discard existing work or rewrite migration history. Existing-data reconciliation, production migration execution and enabling consumers require their own reviewed operational approval. Initial-DDL execution must be verified on a separately admitted empty database; prior end-state fixtures do not prove it.

Workers and API must adopt protocol 1 together. A stale binary receives 422 instead of taking unfenced work. There is no historical attempt ledger: replay after a newer attempt is a conflict. Add such a ledger only if historical replay becomes an explicit requirement.

## Limits and verification

Database fencing cannot undo a remote Discord/model effect; provider-side operations still need their own idempotency and reconciliation. Go workers cancel and await their active work; each lane processes a bounded batch so scheduling can advance, and question expiry uses an independent loop.

Pure state/HTTP tests cover stale receipts, reclaim, exact replay, bounds, cancellation ordering and deadlines. Disposable Postgres integration tests cover contention, post-lock clock sampling, terminal projection atomicity and rollback. Source/unit checks alone do not prove database execution, consumer timing, deployment, or production effectiveness.
