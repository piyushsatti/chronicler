# Go worker environment

The worker binary (`apps/api/cmd/worker`) consumes Postgres-backed jobs when `DATABASE_URL` is set. HTTP client timeout is 30s.

## Discord delivery (quest loop)

| Variable | Purpose |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Bot token used for `Authorization: Bot …` on Discord REST (worker posts quest messages) |
| `DISCORD_ANNOUNCE_CHANNEL_ID` | Target channel for quest projection messages |
| `DISCORD_DELIVERY_DRY_RUN` | When `1`/`true`, apply `discord_applied_revision` without calling Discord. Required for local compose when token/channel are empty |

Without token + channel **and** without dry-run, sync returns an error; the job retries then dead-letters. Applied revision does **not** advance.

Idempotency: the first successful POST stores `quests.discord_message_id`; later deliveries `PATCH` that message instead of posting again.

### Coalesce while running

`background_jobs` coalesce uses a stable `job_key` (`quest-discord:{public_id}`) and refreshes payload only when state is not `running`. A burst during a slow Discord call therefore does not overwrite the in-flight row.

After each successful delivery, the worker **reconciles**: if `discord_desired_revision > discord_applied_revision`, it enqueues again with the latest desired revision so the lag is closed on the next claim.

### Compose roles

Local stack: [deploy/compose.yaml](/deploy/compose.yaml).

| Service | Token | Role |
| --- | --- | --- |
| `worker` | `DISCORD_BOT_TOKEN` | Discord REST announce (or dry-run) |
| `discord` | `BOT_DISCORD_TOKEN` | Gateway sensor only; posts to `/v1/ingest/*`. Does not announce quests ([D1](/docs/decisions/D1-Discord-Announce-Ownership.md)) |

Staging E2E against a live channel needs a real worker token + channel id and `DISCORD_DELIVERY_DRY_RUN` unset/false. No live Discord test runs in CI (httptest mocks).

## Integration tests

Postgres-backed Go tests (`-tags=integration`) start an ephemeral `postgres:16-alpine` with [testcontainers-go](https://golang.testcontainers.org/), run goose + seed, then connect. Docker must be running. They do **not** require a pre-started compose DB.

Optional: set `DATABASE_URL` to reuse an existing Postgres (migrate+seed still applied). Leave it unset for the default container path.

## API process

| Variable | Purpose |
| --- | --- |
| `CHRONICLER_ENV` | `development` (default) or `production`. Production requires Postgres |
| `REQUIRE_DATABASE` | When truthy, fail startup if Postgres is unavailable (even in development) |

## Maintenance lane

Scheduled jobs (`purge_idempotency`, `gametime_fill`, `reconcile_dry_run`) enqueue on the `maintenance` lane hourly. Handlers live in `internal/worker/maintenance.go`.

See [background-work.md](/apps/api/docs/background-work.md) for the full durability design (Python port reference).
