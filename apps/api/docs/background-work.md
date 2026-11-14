# Durable background work

Current Go implementation reference. [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md) owns the worker/migration boundary; [D44](/apps/api/docs/decisions/D44-Leased-Work-With-Fencing.md) owns the accepted leased work queue with fencing token. Imported Python/PGMQ/pg_cron deployment descriptions do not describe this checkout.

## One lifecycle authority

`background_jobs` owns state, attempts, monotonic `lease_token`, live lease timestamps, immutable question deadline and current terminal operation/payload. `agent_questions` stores question/history/result; its queued/claimed/answered/failed status is derived by the API query. Terminal question state and result projection commit in one transaction.

[Job queries](/apps/api/db/queries/jobs.sql) lock a candidate with `FOR UPDATE SKIP LOCKED`. The [store](/apps/api/internal/platform/jobs/postgres.go) samples the database clock after the row lock and applies shared [lease rules](/apps/api/internal/platform/jobs/lease.go). Every worker mutation uses internal job identity plus the claimed token. Transactions finish before remote work begins.

| Transition                               | Rule                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| queued/retry_wait → running              | Due job; increment attempt and token                                                                    |
| expired running → running                | New token fences the abandoned worker                                                                   |
| running → succeeded/dead/repair_required | Valid live receipt; preserve current terminal acknowledgment                                            |
| running → retry_wait                     | Valid live receipt; release it and use bounded server backoff                                           |
| question deadline → dead                 | Atomic safe failure result; applies even before first claim                                             |
| queued/running/retry_wait → cancelled    | Internal operator command by public UUID; no worker receipt required; terminal results remain immutable |

Exact current terminal replay is read-only. A released retry receipt and any older token conflict. Generic re-enqueue may begin a new logical generation on its stable row, resetting attempts while preserving the token. Agent submissions with the same UUID and normalized body are idempotent; a different body conflicts.

## Scheduled admission and heartbeat retention

Daily maintenance uses **idempotent scheduled admission** through `jobs.Store.EnqueueScheduled`. Postgres delegates to `EnqueueScheduledJob`, whose insert-once rule preserves the complete existing row for a matching `job_key`, including terminal state, payload, attempts, and lease token. `MemoryStore` follows the same admission rule. `EnqueueDailyMaintenance` admits `gametime_fill` and `reconcile_dry_run` under UTC calendar-date keys on the existing hourly tick and logs each admission failure.

The hourly tick also calls `PruneBotHeartbeats` and `PruneFinishedAgentQuestions` independently of admission failures. Heartbeat **bounded retention** deletes only samples with `received_at` strictly earlier than seven days before the tick; a sample exactly at the cutoff remains. Finished `agent_question` jobs (`succeeded`, `dead`, `repair_required`, `cancelled`) whose `updated_at` is strictly earlier than thirty days are deleted with their `agent_questions` rows, in a bounded batch per tick. Other job kinds are kept. Migration `0013_operational_lookup_indexes.sql` adds the descending heartbeat lookup index and the partial expression index for quest delivery jobs.

`SiteActiveAlerts` and `SiteActiveAlertCount` use the same **derived operational alert projection**. Failed `agent_question` jobs are excluded from both queries; maintenance and delivery failures and the stale-heartbeat check remain.

## Processes and budgets

`cmd/worker` handles Discord delivery and maintenance, one job per lane per loop, with cancellation checks between lanes. [RunLeased](/apps/api/internal/platform/jobs/run.go) renews every 40 seconds under a 120-second lease and ten-minute attempt ceiling; it cancels and joins remote work on lease loss or shutdown. Clients must honor context cancellation. External effects still require idempotency/reconciliation; a database fence cannot reverse them.

Python claims agent questions over [HTTP](/docs/interfaces/agent-qa-http.md). Agent leases are 30 seconds, renew every 10 seconds, and share an immutable 100-second question deadline. Processing reserves the final five seconds for completion delivery. The existing Discord wait remains 120 seconds. A separate [deadline sweep](/apps/api/internal/worker/agent_deadline.go) runs every two seconds, processes at most 32 rows per pass and bounds each pass to two seconds; slow delivery does not block it.

These budgets require a running API/database/worker. They do not establish production throughput or guarantee recovery under an outage. A queue backlog can expire a question before a model starts.

## Quest Discord announcement

Quest editing uses **optimistic concurrency control** through `quests.updated_at`. Roster counts and Discord message, event, thread, and applied-revision bookkeeping preserve that token. Editorial updates and explicit status commands still advance it. Capacity updates use the existing quest lock as a **serialized aggregate invariant**: explicit capacities must be in `1..100` and cannot be below the filled count. Changing capacity recomputes `open` or `full` without changing other statuses.

The `quest_discord_delivery` job ([RESTSync](/apps/api/internal/delivery/discord_sync.go)) posts one plain message per quest, then edits it on later syncs. [BuildAnnouncement](/apps/api/internal/delivery/announce.go) puts the title in a masked quest link with angle brackets, followed by the brief body and optional `-#` role ping. Its Game Information block lists scheduling and duration, DM, title-cased status, APL (`Any` when unset), quest link, and event link (`Pending` until stored). The brief is `document.EffectiveBody` for an ordinary member who is neither author nor named in a marker, so `[!dm]` and `[!dm:@handle]` blocks never leave the API. If the post would pass Discord's 2000-character message limit ([Create Message](https://docs.discord.com/developers/resources/message#create-message)), only the body is cut with an ellipsis, at a word boundary when possible. The Game Information block stays intact.

Settings come from the admin panel (`site_settings`: `discord_announce_channel`, `quest_announcement_role`, `discord_voice_channels`; `public_origin` for links) and are read on every sync. `DISCORD_ANNOUNCE_CHANNEL_ID` applies only while the announce channel setting is empty; `DISCORD_BOT_TOKEN` and `GUILD_ID` stay deploy secrets. A quest that is neither cancelled nor deleted gets a [scheduled event](https://docs.discord.com/developers/resources/guild-scheduled-event#create-guild-scheduled-event) when its start is in the future. A configured voice channel selects VOICE (`entity_type` 2) with null metadata. Otherwise, EXTERNAL (`entity_type` 3) uses a null channel and the quest URL as its location, limited to 100 characters. Later syncs update the same event when the voice channel changes. The event starts at the quest's scheduled time and ends after `duration_hours`; its description links the announcement and the quest page. Events with a past start time are left alone. A thread named after the quest code is opened from the first post only ([Start Thread from Message](https://docs.discord.com/developers/resources/channel#start-thread-from-message)). Signups and withdrawals never enqueue this job.

Cancellation and deletion use **transactional outbox** and **desired-state reconciliation**. Deletion bumps the desired revision, tombstones the quest, and enqueues delivery in the command transaction. The delivery snapshot retains tombstones and stored Discord IDs. Existing announcements show `Cancelled` or `Deleted` in the Game Information status row; neither operation creates a missing message, event, or thread. The worker checks an existing event before applying the future-time guard. A scheduled event becomes canceled, an active event becomes completed, and a terminal event stays unchanged. Missing, malformed, or unsupported remote status returns `ErrDiscordEventState` and parks the job as `repair_required` without replacing IDs. Discord defines these transitions in its [scheduled-event reference](https://docs.discord.com/developers/resources/guild-scheduled-event).

Message creation uses **idempotent message creation** with a stable quest-derived nonce of at most 25 characters and `enforce_nonce: true`. Neither edits nor desired revisions change that nonce. Discord checks uniqueness only within the past few minutes, so this is not durable exactly-once delivery ([Create Message](https://docs.discord.com/developers/resources/message#create-message)). After each successful creation response, message, event, and thread ID persistence uses `context.WithoutCancel` with a five-second timeout. Further remote operations still honor the work context; lease and effect fencing remain in force. See [discord-sensor](/docs/interfaces/discord-sensor.md) for the ownership boundary.

## Schema and verification

The consolidated [initial schema](/apps/api/db/migrations/0001_init.sql) enforces nonnegative non-null tokens, running/non-running lease timestamps, completion pairs and agent-question deadlines. It defines the partial expiry/deadline indexes and omits duplicate question state. It provides a fresh-database baseline, not the former incremental migration's lock/preflight refusal or rollback guard.

Existing Goose histories remain unresolved (`SCHEMA-HISTORY-01`): an applied version 1 is not rerun, and former versions 2/3 have no matching current migration files. Reconciliation and production execution require separate reviewed operational approval. Fresh initial-DDL proof requires an admitted empty fixture; reusing a former end-state database does not establish it. No data import/discard, history rewrite, legacy production cutover, PGMQ, or TLS guarantee is implied.

Go unit/HTTP tests exercise the shared state rules and wire validation. Integration fixtures in `apps/api/test/integration/job_leases_test.go` and `agent_leases_test.go` exercise schema admission/rejection, Postgres concurrency and atomicity when run against an admitted disposable database. Report execution receipts separately from source coverage. Operational cutover and provider side-effect proofs remain separate gates.

Additional regressions cover `TestQuestRosterAndDeliveryPreserveEditorVersion`, `TestDailyMaintenancePreservesAdmittedStateAndUTCDate`, `TestDailyMaintenanceAdmissionDoesNotReviveTerminalJobs`, `TestHourlyMaintenancePrunesOldHeartbeats`, `TestOperationalLookupIndexesMigrationUpDown`, and `TestActiveAlertsExcludeQuestionFailuresAndKeepActionableJobs`. Their source presence does not establish a database execution receipt.
