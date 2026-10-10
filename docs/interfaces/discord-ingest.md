# Interface: Discord ingest observations

**Status:** accepted  
**Provider:** `apps/discord` (normalizes Gateway events)  
**Consumers:** `apps/api` (`POST /v1/ingest/discord-event`, `POST /v1/ingest/heartbeat`)

## Rule

The bot forwards **normalized observations** to the API. Observations are not facts. Idempotency and durability for accepted work belong on the API side; the bot may keep only a transport buffer across short outages.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| Shared payload schema in contracts or OpenAPI | `packages/contracts/openapi.yaml` (`DiscordEvent`, `Heartbeat`) | **accepted** |

## Provider

Normalization and forward path: `apps/discord/docs/`.

## Consumers

Ingest acceptance and `work_queue` / dead-letter handling: `apps/api/docs/`.

## Related decisions

- [D1](/docs/decisions/D1-Discord-Announce-Ownership.md)
- [D19](/docs/decisions/D19-Machine-Principals.md)
- [D23](/docs/decisions/D23-One-Work-Table-Out-Of-Band-Alerts.md)

## Reopen

A second ingest shape is accepted without a shared schema, or the bot is treated as durable store of record.
