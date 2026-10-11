# Activity (`apps/discord`)

**App:** `apps/discord`  
**Implements:** [discord-sensor](/docs/interfaces/discord-sensor.md), [discord-ingest](/docs/interfaces/discord-ingest.md)

## Verdict

When `SNIFFER_ENABLED=true`, `mountActivity` forwards three guild gateway events to `POST /v1/ingest/discord-event`. A failed POST is logged and dropped. This process has no spool and no retry.

## How it works

`mountActivity` returns immediately unless `config.snifferEnabled` is set. Listeners accept events whose guild is `config.guildId`. Bot-authored activity is skipped. Each accepted payload becomes a `SniffedEvent` and `deliverActivity` calls `postDiscordEvent`.

| Gateway event              | Normalizer                                   | `event_id`                                     | `amount`                     |
| -------------------------- | -------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| `messageCreate`            | `normalizeMessageCreate`                     | Discord message id                             | `1`                          |
| `voiceStateUpdate`         | `VoiceSessionTracker.handleVoiceStateUpdate` | `voice:<userId>:<joinedAtMs>`                  | whole minutes in the channel |
| raw `MESSAGE_REACTION_ADD` | `normalizeReactionDispatch`                  | `reaction:<sessionKey>:<sequence>:<messageId>` | `1`                          |

Voice joins stay in a process-local `VoiceSessionTracker`. A restart forgets open joins. On `ClientReady`, `reconcile` closes sessions missing from the guild voice cache and emits `voice:recovery:…` when at least one minute elapsed. Sessions under one minute produce no event.

`postDiscordEvent` sends `X-Ingest-Secret` and waits 10 seconds. `deliverActivity` allows 8 posts in flight (`MAX_IN_FLIGHT`). Past that cap, or on any non-2xx or network error, the event is logged and dropped.

The body matches `DiscordEvent` in [openapi.yaml](/packages/contracts/openapi.yaml): `event_id`, `kind`, `discord_user_id`, `channel_id`, `occurred_at`, `amount`. `kind` is `message`, `voice`, or `reaction`.

Tests: `tests/unit/activity/mount.test.ts`, `normalize.test.ts`, `forward.test.ts`.

## Configuration

Required when the sniffer is on: `GUILD_ID`, `INGEST_SECRET`, `API_URL`, `BOT_API_ALLOWED_ORIGIN`, and `BOT_DISCORD_TOKEN` (or `DISCORD_TOKEN`). `SNIFFER_ENABLED` defaults off. `BOT_ALLOW_INSECURE_API_URL=true` permits an `http` origin outside tests.
