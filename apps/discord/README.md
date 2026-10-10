# Discord

discord.js bot for Chronicler. It records guild activity and answers a mention through the agent.

## Layout

| Path                 | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `src/session.ts`     | Log in, mount activity and agent, shut down           |
| `src/activity/`      | Guild events posted to the API                        |
| `src/agent/`         | Mentions posted to the API, replies posted in Discord |
| `src/health.ts`      | Shard resume and re-identify logs                     |
| `tests/unit/`        | One module at a time, dependencies mocked             |
| `tests/integration/` | Real client code against a local HTTP fixture         |
| `tests/e2e/`         | `start()` with a scripted Discord client              |
| `tests/fixtures/`    | Shared payloads                                       |

App-local docs: [docs/README.md](/apps/discord/docs/README.md). Interfaces: [discord-sensor](/docs/interfaces/discord-sensor.md), [discord-ingest](/docs/interfaces/discord-ingest.md).

## Commands

From the repo root:

```bash
bun run --filter @pi/discord test
bun run --filter @pi/discord lint
bun run --filter @pi/discord build
bun run --filter @pi/discord dev
```
