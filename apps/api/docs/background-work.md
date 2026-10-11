# Durable background work

Current Go implementation reference. [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md) owns the worker/migration boundary; [D44](/apps/api/docs/decisions/D44-Leased-Work-With-Fencing.md) owns the accepted leased work queue with fencing token. Imported Python/PGMQ/pg_cron deployment descriptions do not describe this checkout.

## One lifecycle authority

`background_jobs` owns state, attempts, monotonic `lease_token`, live lease timestamps, immutable question deadline and current terminal operation/payload. `agent_questions` stores question/history/result; its queued/claimed/answered/failed status is derived by the API query. Terminal question state and result projection commit in one transaction.

[Job queries](/apps/api/db/queries/jobs.sql) lock a candidate with `FOR UPDATE SKIP LOCKED`. The [store](/apps/api/internal/platform/jobs/postgres.go) samples the database clock after the row lock and applies shared [lease rules](/apps/api/internal/platform/jobs/lease.go). Every worker mutation uses internal job identity plus the claimed token. Transactions finish before remote work begins.

| Transition | Rule |
| --- | --- |
| queued/retry_wait → running | Due job; increment attempt and token |
| expired running → running | New token fences the abandoned worker |
| running → succeeded/dead/repair_required | Valid live receipt; preserve current terminal acknowledgment |
| running → retry_wait | Valid live receipt; release it and use bounded server backoff |
| question deadline → dead | Atomic safe failure result; applies even before first claim |
| queued/running/retry_wait → cancelled | Internal operator command by public UUID; no worker receipt required; terminal results remain immutable |

Exact current terminal replay is read-only. A released retry receipt and any older token conflict. Generic re-enqueue may begin a new logical generation on its stable row, resetting attempts while preserving the token. Agent submissions with the same UUID and normalized body are idempotent; a different body conflicts.

## Processes and budgets

`cmd/worker` handles Discord delivery and maintenance, one job per lane per loop, with cancellation checks between lanes. [RunLeased](/apps/api/internal/platform/jobs/run.go) renews every 40 seconds under a 120-second lease and ten-minute attempt ceiling; it cancels and joins remote work on lease loss or shutdown. Clients must honor context cancellation. External effects still require idempotency/reconciliation; a database fence cannot reverse them.

Python claims agent questions over [HTTP](/docs/interfaces/agent-qa-http.md). Agent leases are 30 seconds, renew every 10 seconds, and share an immutable 100-second question deadline. Processing reserves the final five seconds for completion delivery. The existing Discord wait remains 120 seconds. A separate [deadline sweep](/apps/api/internal/worker/agent_deadline.go) runs every two seconds, processes at most 32 rows per pass and bounds each pass to two seconds; slow delivery does not block it.

These budgets require a running API/database/worker. They do not establish production throughput or guarantee recovery under an outage. A queue backlog can expire a question before a model starts.

## Schema and verification

[Goose migration 0002](/apps/api/db/migrations/0002_job_leases.sql) locks both relevant tables and refuses any running job or preexisting agent work before schema changes. Existing-state reconciliation and production migration execution are separate decisions. No data import/discard, legacy production cutover, PGMQ, or TLS guarantee is implied.

Go unit/HTTP tests exercise the shared state rules and wire validation. Integration fixtures in `apps/api/test/integration/job_leases_test.go` and `agent_leases_test.go` exercise Postgres concurrency and atomicity when run against an admitted disposable database. Report execution receipts separately from source coverage. Operational cutover and provider side-effect proofs remain separate gates.
