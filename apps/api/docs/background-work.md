As-built living note. Scrubbed from quarry; prefer durable symbol/schema names over path:line.
Interfaces: see [docs/interfaces/](/docs/interfaces/README.md).

# Durable background work

Status: implemented on `feat/durable-background-jobs`; not deployed or approved
for production.

This page is the living implementation reference for Chronicler's background
work plane. It describes the code that is being built. The dated
[deployment proposal](/docs/interfaces/work-queue-durability.md) owns the
cutover, rollback, measured evidence, and acceptance checklist. The existing
production API, scheduler, bot, and database remain unchanged until that
checklist is reviewed and approved.

## What moves, and what does not

After approval, two processes move to Titan, the existing Saturn VM 101:

- a Python worker that delivers the Discord projection and runs maintenance
  jobs; and
- the Discord Gateway sensor bot.

The FastAPI/GraphQL service and Caddy stay on the existing droplet. PostgreSQL
and the queues stay on Supabase. An independent watchdog stays on the droplet
so a home-network or Saturn outage is observable from outside Saturn.

Moving the sensor bot alone does **not** move quest announcements. The bot only
observes Gateway activity and sends normalized events to the API. Quest
announcements currently belong to the API; queue mode moves that Discord REST
work to the worker.

```text
API state transaction -> background_jobs + Discord queue -> Titan worker -> Discord REST
Supabase pg_cron      -> scheduled slots + maintenance queue -> Titan worker -> PostgreSQL jobs
Discord Gateway      -> Titan bot -> SQLite WAL spool -> API ingest
terminal worker job  -> chronicler_dead_letter
```

## Stack

| Part | Implementation |
|---|---|
| API and producers | Python 3.12, FastAPI, Strawberry GraphQL, SQLAlchemy async, asyncpg |
| Durable transport | Supabase PostgreSQL, PGMQ logged queues, domain ledger tables |
| Scheduling | Supabase `pg_cron` calling a fixed-search-path database function every five minutes |
| Worker | Python `asyncio`, one serial consumer per active queue, HTTPX-based Discord REST code |
| Maintenance safety | Durable due slots plus existing PostgreSQL advisory locks |
| Sensor bot | Node.js 20, TypeScript, discord.js 14, `better-sqlite3` in WAL mode |
| Frontend status | React/Vite and the shared GraphQL contract |
| Supervision | systemd supervising separate digest-pinned Docker Compose services |
| Alerts | Existing webhook notifier with database-persisted alert transitions |

## Durable job model

PGMQ owns message availability and visibility timeouts. Chronicler does not
implement another lease. `background_jobs` is the durable domain ledger around
that transport and remains queryable after a message is archived.

| Store | Purpose |
|---|---|
| `background_jobs` | One logical job per stable `job_key`; payload version, identifiers-only payload, state, retry data, receipt, safe error, and redrive history |
| `job_runs` | Append-only record of each attempt, including attempt number, host, build SHA, and due slot |
| `scheduled_jobs` | Named schedule definitions and enable state |
| `scheduled_job_slots` | Durable, unique `(job_name, due_slot)` occurrences |
| `job_lane_controls` | Lane pause state and expected worker owner |
| `background_alert_states` | Alert activation and recovery state used to suppress repeated notifications |

The queues are private PostgreSQL objects and are not exposed through
PostgREST:

- `chronicler_discord_delivery`: active quest-projection work;
- `chronicler_maintenance`: active reconcile, game-time fill, and canary work;
- `chronicler_dead_letter`: terminal worker work, never consumed automatically.

Queue payload version 1 contains identifiers and routing metadata only. It must
not contain Discord tokens, document bodies, rendered embeds, upstream
responses, or other secrets.

### Job lifecycle and receipt fencing

```text
queued -> running -> succeeded
                  -> retry_wait -> queued
                  -> repair_required
                  -> dead -> operator redrive -> queued
queued/running/retry_wait -> cancelled
```

A claim records PGMQ's `msg_id` and `read_ct` before external work starts. Every
completion, retry, terminal transition, or archive is conditional on that same
receipt. If visibility expires and another worker claims the message, the old
worker's receipt is stale and its state transition is rejected. The abandoned
attempt consumes one failure budget; repeated crash-after-claim cycles therefore
reach the configured DLQ limit instead of reclaiming forever.

The worker does not retain a checked-out database connection while waiting on
Discord HTTP. The Discord lane and maintenance lane each have concurrency one.
Control-plane failures such as temporary database unavailability use full-jitter
retry capped at 60 seconds; job failure budgets are consumed only after a job
has been claimed and classified.

| Lane | Visibility | Attempts | Retry policy |
|---|---:|---:|---|
| Discord | 120 seconds | 8 transient attempts | full jitter, 5 seconds to 15 minutes; honor Discord `Retry-After` |
| Maintenance | 30 minutes | 5 attempts | full jitter, 30 seconds to 30 minutes; advisory lock remains a second guard |

Maintenance advisory-lock contention consumes the same bounded attempt budget;
it is not an unbounded special retry path.

Network failures, timeouts, and provider 5xx responses retry. Discord 401/403
pauses the lane and raises one configuration alert without consuming every
job's retry budget. Unknown payload versions are terminal. Ambiguous creates
and a 404 for a stored Discord identity become `repair_required`, because a
blind retry could duplicate or overwrite a remote object.

Terminal worker failures are copied to `chronicler_dead_letter` and archived
from the active queue in one database transaction. A redrive is manual,
requires a reason, retains the logical job ID, and increments `redrive_count`.
The dead-letter queue is not an automatic retry queue.

## Quest Discord projection

In queue mode, a successful API mutation means the Chronicler transaction was
committed. It does not mean Discord is already current.

One producer primitive runs inside the mutation's existing transaction. It:

1. locks the quest;
2. increments `discord_desired_revision` only when rendered Discord state has
   changed;
3. creates or reactivates stable logical job `quest-discord:<quest UUID>`; and
4. calls `pgmq.send` only when no active message already represents that job.

The worker reads the current quest and brief after claiming; queued content is
never a stale rendered snapshot. It records the revision it actually applied.
If the desired revision advanced during delivery, conditional completion
immediately leaves another pass queued rather than marking the projection
current.

The quest stores overall delivery state plus independent message, thread, and
scheduled-event state. This lets a retry preserve completed legs. New drafts
produce no job. Publish creates the first desired projection. Unpublish creates
a withdrawal projection. Cancellation retains a visible cancelled message and
terminates the scheduled event according to Discord's allowed transitions.

The renderer reads quest-brief `asset_links`, but the current application has
no asset-link write service or GraphQL mutation to hook. A future asset-link
mutation must call `record_document_change` in the same transaction. Until that
surface exists, any approved out-of-band asset-link change must be followed by
the explicit `enqueue-all` projection rebuild; this is an implementation gap,
not an assumed automatic fanout.

`QuestV2.discordDelivery` exposes the job ID, desired and applied revisions,
overall state, per-leg state, next retry time, and safe error information. The
frontend treats the database save as complete, displays asynchronous delivery
state, and polls only while the state is nonterminal.

`syncQuestDiscordV2` remains a compatibility mutation. In `direct` mode it uses
the legacy synchronous path. In `queue` mode it ensures or expedites the current
desired revision and returns acceptance/job metadata without claiming
synchronous Discord success. `DISCORD_DELIVERY_MODE=direct` remains the default
until the production cutover is separately approved.

For an ordinary `retry_wait` state, that mutation makes the existing PGMQ
message immediately eligible without resetting its failure budget. Dead and
repair-required jobs remain operator-gated and require the CLI repair/redrive
flow.

Announce ownership stays on the API: [discord-sensor](/docs/interfaces/discord-sensor.md).

## Scheduling and catch-up

The database function `public.ensure_chronicler_due_jobs(now)` is revoked from
`PUBLIC` and uses a fixed search path. A named `pg_cron` entry will call it
every five minutes only after an explicit operator enable step.

| Job | Due slot |
|---|---|
| `reconcile` | latest eligible 03:00 UTC daily slot |
| `gametime_fill` | latest eligible 03:30 UTC daily slot |
| `worker_canary` | latest five-minute slot |

The unique `(job_name, due_slot)` constraint collapses repeated cron ticks.
After multi-day downtime, only the latest missed daily reconcile and game-time
fill slots are produced because both handlers reconcile current state. Cron
does not imply catch-up; the function implements this policy explicitly.

Reconcile detecting drift is a successful execution with a separate drift
alert. It is not a queue transport failure.

The droplet watchdog checks schedule activation, latest slot outcomes, queue
age/depth, expired visibility, dead/repair transitions, canary freshness,
truthful bot heartbeat, bot-spool capacity/pause state, and database
reachability. Alert state is persisted so an unchanged incident keeps one
pending activation and one pending recovery. The worker owns immediate
Discord-configuration and reconcile-drift transitions; the watchdog also
re-observes a paused Discord lane and any unacknowledged configuration
transition so notification retries survive a worker stop. The watchdog owns
aggregate dead-letter and repair transitions so the same terminal job does not
generate two alert streams.
Queue age is calculated from ledger work whose `next_attempt_at` is already
due. Raw PGMQ depth and oldest-message age remain diagnostic fields, but a
message intentionally hidden for retry backoff cannot by itself raise a stale
queue alert.
Database-unreachable and database-recovered transitions cannot use that ledger,
so the droplet watchdog keeps one atomic local receipt at
`WATCHDOG_STATE_PATH`. The receipt is persisted in a root-provisioned bind
directory writable only by UID 65532, contains only two booleans, retries a
transition until notify returns 2xx, and is removed
after the recovery notification succeeds.

## Bot boundary

The sensor bot is a separate process. It has no database credential and does
not consume the API work queue. Activity forwarding is
[activity](/apps/discord/docs/activity.md): three guild events posted to
`POST /v1/ingest/discord-event` with `X-Ingest-Secret`. A failed POST is
dropped. There is no bot-local spool.

## Connectivity and credentials

| Path | Protocol and authentication | Network requirement |
|---|---|---|
| API -> Supabase | PostgreSQL/asyncpg over CA-verified TLS; existing API role | droplet outbound database port |
| pg_cron -> queues | In-database SQL and PGMQ functions | none |
| worker -> Supabase | PostgreSQL/asyncpg over CA-verified TLS; scoped worker login; expected-owner fence | Titan outbound database port |
| worker -> Discord | HTTPS/TLS 443; Discord REST token and configured IDs | Titan outbound 443 |
| bot -> Discord | WSS/HTTPS TLS 443; Gateway token and configured guild | Titan outbound 443 |
| bot -> API | HTTPS/TLS 443; `X-Ingest-Secret` | Titan outbound 443 |
| API -> bot | no path | no inbound Titan port |
| watchdog -> Supabase/notify | PostgreSQL TLS plus authenticated HTTPS to one configured ntfy topic | droplet outbound only |

The worker, bot, and off-Saturn watchdog use separate root-owned mode-0600
environment files. The watchdog file contains only its scoped database,
verified-HTTPS notify, pool, mode, and threshold settings. The bot environment
must never contain a database URL. Externally registered guild,
channel, role, application, and credential values are operator-supplied; this
repository does not infer or create them.

Alert delivery supports the existing ntfy contract through
`ALERT_WEBHOOK_URL`, one fixed `ALERT_NTFY_TOPIC`, and a write-only
`ALERT_WEBHOOK_BEARER_TOKEN`. The request has a five-second default deadline and
no in-request retry. The notification is acknowledged in the database only
after a 2xx response; otherwise the same later watchdog observation retries
the still-pending activation or recovery without creating a new transition.
The database-reachability exception uses the watchdog's local receipt with the
same 2xx acknowledgement rule because Postgres cannot record its own outage.
Notification is at-least-once: a process crash after ntfy accepts a request but
before the receipt is acknowledged can duplicate that transition. No unchanged
healthy tick creates a fresh notification.
A new constrained credential and an
authenticated Titan/droplet publish are still acceptance gates—CT 117's
root-held publisher credential must not be copied.

## Deployment envelope

[`deploy/titan-background/`](/docs/interfaces/work-queue-durability.md) is an uninstalled
review artifact. The two services:

- require exact `repository@sha256:digest` images;
- run as UID/GID 65532 with read-only roots, all capabilities dropped, and
  `no-new-privileges`;
- publish no ports and use rotated JSON logs;
- have initial limits of 0.75 CPU/384 MiB for the worker and 0.5 CPU/256 MiB
  for the bot; and
- use systemd as the sole supervisor while Compose restart policies stay off.

Only `/var/lib/chronicler/bot` is a writable persistent volume. Startup
preflight verifies image pinning, secret file ownership/mode, CA presence,
absence of bot database credentials, an HTTPS allowlisted bot API origin,
queue-only worker mode, and the spool directory owner/mode and non-symlink
status. Each systemd unit invokes only its own preflight scope so worker and bot
restart/rollback remain independent. The off-Saturn watchdog separately receives a read-only root, dropped
capabilities, bounded CPU/memory, and one UID-65532-owned receipt directory.

The reviewed database connection ceiling is 15. Queue mode reserves API (6+2),
worker (2+1), watchdog (1+0), two one-connection operator CLIs (1+0 each), and
one migration connection: 8 + 3 + 1 + 2 + 1 = 15. Direct compatibility mode
retains the legacy scheduler (2+1) alongside the watchdog (1+0), for a
15-connection envelope under the same ceiling. The worker must remain stopped
until the legacy scheduler is stopped, so the two three-connection profiles
never overlap. Authenticated session-pooler
behavior and the provider's actual ceiling remain acceptance checks, not
assumptions.

## Operations and code map

The database CLI is `python -m chronicler.cli.background_jobs`. It supports
`list`, `show`, `redrive`, `cancel`, `pause-lane`, `resume-lane`, explicit
schedule enable/disable, and published-quest fanout. Mutations require
`--reason`; clearing placement ownership additionally requires
`--clear-owner`.

The migration also creates a credential-free
`chronicler_background_producer` group role. The verified API login must receive
that group before queue mode; it can transact with the background ledger and
send only to `chronicler_discord_delivery`, but cannot read/claim/archive queue
messages or send maintenance/DLQ work.

The Titan worker credential cannot enable or disable schedules and cannot
update authored quest fields. It can update only Discord provider references,
applied-revision/delivery columns, and the maintenance handler's time map.
Run `enable-schedule` and `disable-schedule` only from the operator CLI with an
approved migration/admin database credential that can access `cron`; never put
that credential in Titan's worker environment.

| Concern | Source |
|---|---|
| Migration, PGMQ queues, due function, worker role | ``apps/api`/db/migrations/versions/b7d4f2a1c9e0_durable_background_jobs.py` |
| Models and state vocabulary | ``apps/api`/db/v2/models/background_jobs.py` |
| Claim, fencing, retry, DLQ, redrive | ``apps/api`/db/v2/repos/background_jobs_repo.py` |
| Producer API | ``apps/api`/services/background_jobs.py` |
| Quest desired-state producer/fanout | ``apps/api`/services/quest_discord_jobs.py` |
| Worker | ``apps/api`/cli/background_worker.py` |
| Operator CLI | ``apps/api`/cli/background_jobs.py` |
| Watchdog | ``apps/api`/cli/watchdog.py`, ``apps/api`/services/background_watch.py` |
| Titan envelope | `deploy/titan-background/` |

## Open gates

Code and local tests are not production proof. Production remains blocked on:

- applying the migration to disposable PGMQ/pg_cron PostgreSQL and verifying
  syntax, grants, forced-RLS policies, scoped-role denial, and transactional
  enqueue behavior;
- authenticated Supabase session-pooler TLS, connection-budget, reconnect, and
  cross-client advisory-lock tests;
- test-guild crash-window tests for message, thread, and event creation,
  including live verification that message-started thread replay adopts the
  existing thread after a process death before ID commit;
- proving the legacy-compatible base quest read/cancel operations and separate
  additive delivery-status read against both old and new API images;
- fault tests for DB, Discord, API, home-network, process, and Titan reboot;
- verifying the off-Saturn watchdog can reach the approved notify service; and
- a reviewed, explicit production cutover approval.

Do not enable production producers, consumers, pg_cron, or Discord destinations
from this page. Follow the dated [deployment proposal and rollback sequence](/docs/interfaces/work-queue-durability.md).
