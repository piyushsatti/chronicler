# Discord app docs (`apps/discord`)

## Verdict

`start` in `session.ts` logs in one discord.js client and mounts activity, heartbeat, and mentions. Activity and mentions stay off unless their flags are set. Heartbeat posts unless `BOT_HEARTBEAT_ENABLED=false`.

## Implements

| Interface | Role |
| --- | --- |
| [discord-sensor](/docs/interfaces/discord-sensor.md) | Gateway observer. Quest announce stays on the API. |
| [discord-ingest](/docs/interfaces/discord-ingest.md) | Posts normalized observations and heartbeats |

## Topics

| Doc | Use |
| --- | --- |
| [activity.md](/apps/discord/docs/activity.md) | Three guild events, one ingest POST |
| [heartbeat.md](/apps/discord/docs/heartbeat.md) | Shard state posted to the API |
| [mentions.md](/apps/discord/docs/mentions.md) | Default-off mention replies |

Parent app README: [../README.md](/apps/discord/README.md).
