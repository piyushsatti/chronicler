# Interface: Durable work and out-of-band alerts

**Status:** accepted  
**Provider:** `apps/api`  
**Consumers:** operators / alert channel; `apps/discord` (transport buffer only)

## Rule

The API owns durable retryable work in one Postgres work table. Operator alerts must not share a failure domain with the process they watch (for example Discord webhook from a different path than the bot process). The bot’s in-memory or local retry is a transport buffer, not durability.

Daily maintenance uses **idempotent scheduled admission**. `jobs.Store.EnqueueScheduled` inserts each UTC date key once and preserves every field of an existing job, regardless of state. Repeated hourly admission must not revive a terminal job. Admission errors are logged. The same hourly tick prunes heartbeat samples strictly older than seven days and finished `agent_question` jobs (with their `agent_questions` rows) whose `updated_at` is strictly older than thirty days, in a bounded batch; admission failure does not skip pruning. Other `background_jobs` rows are kept.

The API derives active alerts from job and heartbeat evidence. Failed `agent_question` jobs are excluded from both alert lists and counts. Maintenance and delivery failures remain eligible.

## Enforcement

| Mechanism                            | Location                                                                                                         | Status           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| Work table + worker contract tests   | API tests                                                                                                        | **not enforced** |
| Insert-once scheduled admission      | `TestDailyMaintenancePreservesAdmittedStateAndUTCDate`, `TestDailyMaintenanceAdmissionDoesNotReviveTerminalJobs` | **enforced**     |
| Seven-day heartbeat cutoff           | `TestHourlyMaintenancePrunesOldHeartbeats`                                                                       | **enforced**     |
| Thirty-day finished agent-question cutoff | `TestHourlyMaintenancePrunesFinishedAgentQuestions`                                                         | **enforced**     |
| Matching actionable alert list/count | `TestActiveAlertsExcludeQuestionFailuresAndKeepActionableJobs`                                                   | **enforced**     |

## Provider

Work queue worker and alert emitter: `apps/api/docs/`.

## Consumers

A failed activity POST is dropped. There is no bot-local spool: [activity](/apps/discord/docs/activity.md).

## Related decisions

- [D23](/docs/decisions/D23-One-Work-Table-Out-Of-Band-Alerts.md)
- [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md)
- [D30](/docs/decisions/D30-Deletion-Is-Named-Per-Entity.md)

## Reopen

A message broker or bot-local durable store is accepted as the primary durability mechanism.
