# Discord

discord.js bot for Chronicler. It records guild activity and answers a mention through the agent.

## Layout

| Path                                    | Purpose                                               |
| --------------------------------------- | ----------------------------------------------------- |
| `src/session.ts`                        | Log in, mount activity and agent, shut down           |
| `src/activity/`                         | Guild events posted to the API                        |
| `src/agent/`                            | Mentions posted to the API, replies posted in Discord |
| `src/health.ts`                         | Shard resume and re-identify logs                     |
| `tests/unit/`                           | One module at a time, dependencies mocked             |
| `tests/integration/`                    | Real client code against a local HTTP fixture         |
| `tests/integration/live-ingest.test.ts` | Opt-in POSTs to a running Go `/v1/ingest/*`           |
| `tests/e2e/`                            | `start()` with a scripted Discord client              |
| `tests/fixtures/`                       | Shared payloads                                       |

App-local docs: [docs/README.md](/apps/discord/docs/README.md). Interfaces: [discord-sensor](/docs/interfaces/discord-sensor.md), [discord-ingest](/docs/interfaces/discord-ingest.md).

## Commands

From the repo root:

```bash
bun run --filter @pi/discord test
bun run --filter @pi/discord lint
bun run --filter @pi/discord build
bun run --filter @pi/discord dev
```

Unit tests (`tests/unit/`) run only under Node: their `vi.mock` module mocks do not apply under the Bun runtime (`bun --bun vitest`). Integration and e2e suites run under both.

### Live ingest (opt-in)

Default tests skip live network. With `chronicler-dev` API up (`scripts/dev-stack` or compose postgres+api on `127.0.0.1:8080`):

```bash
CHRONICLER_LIVE_INGEST=1 \
CHRONICLER_LIVE_API_URL=http://127.0.0.1:8080 \
CHRONICLER_LIVE_INGEST_SECRET=local-test-only-ingest-secret \
bun run --filter @pi/discord test:live-ingest
```

Does not call GraphQL or announce (D1). Product Discord delivery stays API-owned.
