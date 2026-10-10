# Frontend handoff — build against committed contracts

Paste-ready brief for a new chat that owns the web client. Sibling track (Go API + Discord quest loop) runs in parallel; do **not** wait on agent features.

## What’s already committed (consume these)

| Artifact | Path | Use |
| --- | --- | --- |
| Shared package | `packages/contracts` (`@pi/contracts`) | GraphQL codegen types, OpenAPI as source of truth for REST |
| Merged SDL | `packages/contracts/schema.graphql` | Web GraphQL codegen input |
| Split SDL | `packages/contracts/graphql/*.graphql` | Edit sources; refresh merge with `scripts/merge-graphql-schema` |
| OpenAPI | `packages/contracts/openapi.yaml` | REST under `/v1` (+ machine auth/ingest) |
| Field map | `packages/contracts/field-routing.md` | Old field → GraphQL / REST / DROP |
| Patterns | `packages/contracts/docs/patterns.md` | D40 transport rules, `ID` = UUID, no new `V2` names |
| Dual-key DB | `apps/api/db/docs/design.md`, `0001_init.sql` | Wire `public_id` (UUID) only; bigint `id` never leaves the API |
| Transport rule | `apps/api/docs/decisions/D40-GraphQL-Versus-REST.md` | Trees → GraphQL; commands / fixed shapes → REST |

Design notes for contracts: [`packages/contracts/docs/README.md`](../../packages/contracts/docs/README.md).

## What the frontend should consume

1. **`@pi/contracts`** — workspace dependency; generate client types from `schema.graphql` (`bun run --filter @pi/contracts build` / package codegen).
2. **`POST /v1/graphql`** — nested reads: quest board/detail, characters, documents, maps, members, home, admin trees. Select only fields the screen needs.
3. **REST under `/v1`** — commands and fixed-shape reads per `field-routing.md` / OpenAPI (e.g. `POST /v1/quests/{id}/transition`, `POST /v1/quests/{id}/close`, `POST /v1/quests/{id}/signup`, auth, site stats, config).
4. **Auth** — Discord OAuth at `/auth/discord` + callback (outside `/v1`); bearer JWT on member routes.

Do **not** invent parallel `/v2` paths or new `*V2*` type names on the wire.

## `/v1` rules (D40)

- Version lives **once** in the path: `/v1/graphql`, `/v1/quests/...`.
- GraphQL when a screen needs a **tree** in one round trip.
- REST when the call is a **command**, a **fixed-shape** lookup, or **static/config** aggregate.
- GraphQL `ID` and REST `{id}` are the row’s **`public_id` (UUID)**. Never bigint.
- Reads that write split into a command + follow-up read (see field-routing “Reads that write”).

## Known SDL debt (`*V2*`)

Merged and split SDL still carry many `*V2*` type/field names (`QuestV2Type`, `syncQuestDiscordV2` history in routing table, etc.). **Normative rule:** names drop the `V2` suffix; version is path-only. Treat remaining `*V2*` identifiers as **debt to clear** toward that rule — do not add new ones. Prefer wire names without `V2` when the Go API exposes cleaned names; until then, codegen from the committed SDL as-is and alias locally if needed.

## Discord / delivery (read-only for FE)

Quest Discord projection is **API-owned** ([D1](../decisions/D1-Discord-Announce-Ownership.md), [discord-sensor](../interfaces/discord-sensor.md)). Flow:

```text
quest command → bump discord_desired_revision + enqueue background_jobs
  → Go worker (lane discord) → Discord REST → discord_applied_revision
```

- `Quest.discordDelivery` (SDL: `QuestDiscordDeliveryV2Type`) exposes desired/applied revision and async delivery state. Treat DB save as complete; poll delivery only while nonterminal.
- `POST /v1/quests/{id}/discord/sync` (field-routing) expedites/ensures projection; not synchronous Discord success in queue mode.
- The Discord app is a **Gateway sensor** (activity + heartbeat). Mentions/agent are optional and default **off** (`AGENT_ENABLED=false`). They are **not** required for FE success.

There is no `apps/discord/docs/quest-sync.md`; delivery design lives in `apps/api/docs/background-work.md` and `apps/api/docs/worker-env.md`.

## What’s NOT ready (do not block FE scaffolding on these)

| Gap | Notes |
| --- | --- |
| Go API incomplete vs contracts | Many OpenAPI/field-routing routes not implemented yet (e.g. `POST /v1/quests`, `PATCH /v1/quests/{id}`, discord sync, full GraphQL trees). Scaffold against contracts; expect 404/stub until the sibling track lands slices. |
| Agent Q&A | Optional; config on/off; ship **after** frontend. Keep out of critical path (`AGENT_ENABLED=false` on Discord; API agent routes not required for product success). |
| Full Discord projection fidelity | Worker today can post a minimal channel message when `DISCORD_BOT_TOKEN` + `DISCORD_ANNOUNCE_CHANNEL_ID` are set; richer embeds/events are follow-on. |
| Production cutover of durable jobs | Background-work note still tracks historical Python/PGMQ cutover; greenfield Go uses `background_jobs` in Postgres. |

## Sibling track success (not your job, but the bar)

API + DB + Discord **listener** (Gateway sensor) + **posting quests via Discord** (worker REST) as a closed loop, with compose/local **E2E tests**. Agent stays gated off for that loop.

## Suggested FE start order

1. Wire `@pi/contracts` + GraphQL client to `POST /v1/graphql`.
2. Auth session against Discord OAuth + bearer.
3. Quest board / detail from GraphQL; show `discordDelivery` as async status when present.
4. Commands via REST (`transition`, `signup`, …) as OpenAPI lands in the running API.
5. Leave agent/mention UI out unless a later milestone turns the flag on.

## Quick links

- Contracts README: [`packages/contracts/README.md`](../../packages/contracts/README.md)
- Frontend system essay: [`docs/systems/frontend.md`](../systems/frontend.md)
- Discord bot system: [`docs/systems/discord-bot.md`](../systems/discord-bot.md)
