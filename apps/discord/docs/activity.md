# Activity (`apps/discord`)

**App:** `apps/discord`  
**Implements:** [discord-sensor](/docs/interfaces/discord-sensor.md), [discord-ingest](/docs/interfaces/discord-ingest.md)

## Verdict

When `SNIFFER_ENABLED=true`, `mountActivity` forwards three guild gateway events to `POST /v1/ingest/discord-event`. A failed POST is logged and dropped. This process has no spool and no retry.

## How it works

`mountActivity` returns immediately unless `config.snifferEnabled` is set. Listeners accept events whose guild is `config.guildId` and whose cached channel permissions grant `@everyone` `ViewChannel`. Unknown channels or permissions and private threads are skipped. Bot-authored activity and Discord system messages are skipped. This authorization check needs no additional setting or Discord fetch. Each accepted payload becomes a `SniffedEvent` and `deliverActivity` calls `postDiscordEvent`.

| Gateway event              | Normalizer                                   | `event_id`                                     | `amount`                     |
| -------------------------- | -------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| `messageCreate`            | `normalizeMessageCreate`                     | Discord message id                             | `1`                          |
| `voiceStateUpdate`         | `VoiceSessionTracker.handleVoiceStateUpdate` | `voice:<userId>:<joinedAtMs>`                  | whole minutes in the channel |
| raw `MESSAGE_REACTION_ADD` | `normalizeReactionDispatch`                  | `reaction:<sessionKey>:<sequence>:<messageId>` | `1`                          |

Voice joins stay in a process-local `VoiceSessionTracker`. A restart forgets open joins. Moving from a public channel to a private channel closes the public interval without tracking the private channel. Moving back starts a new public interval. Voice transitions, channel updates, `@everyone` role updates, and readiness reconciliation discard tracked intervals whose channel is now private or has unknown permissions. Permission updates reconcile the cached voice states immediately and start fresh intervals for newly public channels. On `ClientReady`, `reconcile` accepts only public voice states and closes missing public sessions with `voice:recovery:…`. Minutes are rounded, and intervals rounding below one minute produce no event.

`postDiscordEvent` sends `X-Ingest-Secret` and waits 10 seconds. `deliverActivity` allows 8 posts in flight (`MAX_IN_FLIGHT`). Past that cap, or on any non-2xx or network error, the event is logged and dropped.

The body matches `DiscordEvent` in [openapi.yaml](/packages/contracts/openapi.yaml): `event_id`, `kind`, `discord_user_id`, `channel_id`, `occurred_at`, `amount`. `kind` is `message`, `voice`, or `reaction`.

Tests: `tests/unit/activity/mount.test.ts`, `normalize.test.ts`, `forward.test.ts`.

## Configuration

Required when the sniffer is on: `GUILD_ID`, `INGEST_SECRET`, `API_URL`, `BOT_API_ALLOWED_ORIGIN`, and `BOT_DISCORD_TOKEN` (or `DISCORD_TOKEN`). `SNIFFER_ENABLED` defaults off. `BOT_ALLOW_INSECURE_API_URL=true` permits an `http` origin outside tests.
