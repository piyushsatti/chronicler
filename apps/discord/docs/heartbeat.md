# Heartbeat (`apps/discord`)

**App:** `apps/discord`  
**Implements:** [discord-ingest](/docs/interfaces/discord-ingest.md)

## Verdict

`mountShardHealth` posts shard state to `POST /v1/ingest/heartbeat` every 60 seconds. A failed POST is logged and does not stop the process. Heartbeat is on unless `BOT_HEARTBEAT_ENABLED=false`.

## How it works

`postHeartbeat` sends `X-Ingest-Secret` and a `HeartbeatStatus`: `gateway_ready`, `shard_state`, `host`, `build_sha`. The default interval is `DEFAULT_HEARTBEAT_INTERVAL_MS` (60 seconds). The request times out after 10 seconds.

`mountShardHealth` records, per shard, whether a reconnect ended in `shardResume` (Discord replayed the gap) or a fresh identify (the gap was not replayed). With `exitOnTerminal` — the value `start` passes — a terminal shard close or a gateway that stays non-ready exits the process.

`GUILD_ID` and `INGEST_SECRET` are required while heartbeat is on. Host and build come from `BOT_HOST` and `BOT_BUILD_ID` (falling through `CHRONICLER_BUILD_SHA`, `BUILD_SHA`, `BUILD_VERSION`, then `unknown`).

Tests: `tests/unit/health.test.ts`, `tests/unit/health.heartbeat.test.ts`.
