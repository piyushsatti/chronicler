# Heartbeat (`apps/discord`)

**App:** `apps/discord`  
**Implements:** [discord-ingest](/docs/interfaces/discord-ingest.md)  
**Retained HTTP:** `POST /v1/ingest/heartbeat` (field-routing OP-040; OpenAPI `Heartbeat`; Go [`internal/ingest`](/apps/api/internal/ingest/ingest.go))

## Verdict

`mountShardHealth` posts shard state to `POST /v1/ingest/heartbeat` every 60 seconds. A failed POST is logged and does not stop the process. Heartbeat is on unless `BOT_HEARTBEAT_ENABLED=false`. The same timer also touches `/tmp/chronicler-bot-alive` so Compose can treat the bot as healthy. The admin "Bot heartbeat is stale" alert fires when no heartbeat with `gateway_ready: true` has arrived in the last 3 minutes (silent bot or never Gateway-ready), not merely when the newest row is old. No product GraphQL, announce, or agent path.

## How it works

`postHeartbeat` sends `X-Ingest-Secret` and a `HeartbeatStatus`: `gateway_ready`, `shard_state`, `host`, `build_sha`. The default interval is `DEFAULT_HEARTBEAT_INTERVAL_MS` (60 seconds; do not change without API watch agreement). The request times out after 10 seconds.

`mountShardHealth` records, per shard, whether a reconnect ended in `shardResume` (Discord replayed the gap) or a fresh identify (the gap was not replayed). With `exitOnTerminal` — the value `start` passes — a terminal shard close or a gateway that stays non-ready exits the process.

On mount and every timer tick (even with the ingest heartbeat off), the bot writes `/tmp/chronicler-bot-alive`. Production Compose runs `bun apps/discord/dist/healthcheck.js`, which exits 0 when that file is younger than 150 seconds. That is event-loop liveness, not a Discord call.

`GUILD_ID` and `INGEST_SECRET` are required while heartbeat is on. Host and build come from `BOT_HOST` and `BOT_BUILD_ID` (build defaults to `unknown`).

Tests: `tests/unit/health.test.ts`, `tests/unit/health.heartbeat.test.ts`, `tests/unit/healthcheck.test.ts`, `tests/unit/compose.test.ts`.
