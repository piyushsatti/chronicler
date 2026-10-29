# Interface: Discord ingest observations

**Status:** accepted  
**Provider:** `apps/discord` (normalizes Gateway events)  
**Consumers:** `apps/api` (`POST /v1/ingest/discord-event`, `POST /v1/ingest/heartbeat`)

## Rule

The bot forwards **normalized observations** to the API. Observations are not facts. Idempotency and durability for accepted work belong on the API side; the bot may keep only a transport buffer across short outages.

The bot calls the API over the internal network. The production Caddy proxy answers `/v1/ingest/*` with 404 before proxying; agent, GraphQL, authentication and health paths retain their proxy routing. Ingest still requires its machine credential at the API boundary. Production startup requires `INGEST_SECRET` and `JWT_SECRET` to be at least 32 characters each.

## Enforcement

| Mechanism                                                          | Location                                                                                                                     | Status                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Activity and heartbeat bodies match `DiscordEvent` and `Heartbeat` | [ingest.test.ts](/apps/discord/tests/unit/interface/ingest.test.ts) against [openapi.yaml](/packages/contracts/openapi.yaml) | **enforced**                               |
| Public ingest rejection and unchanged proxy directives             | `TestCaddyBlocksOnlyPublicIngestRoutes` in [config tests](/apps/api/internal/platform/config/caddy_ingest_test.go)           | **enforced** by a Caddyfile text assertion |
| Production machine-secret minimum                                  | `TestValidateProductionRequiresStrongMachineSecrets` in [config tests](/apps/api/internal/platform/config/validate_test.go)  | **enforced**                               |

## Provider

Normalization and forward path: [activity](/apps/discord/docs/activity.md). Heartbeat: [heartbeat](/apps/discord/docs/heartbeat.md).

## Consumers

Ingest acceptance and `work_queue` / dead-letter handling: `apps/api/docs/`.

## Related decisions

- [D1](/docs/decisions/D1-Discord-Announce-Ownership.md)
- [D19](/docs/decisions/D19-Machine-Principals.md)
- [D23](/docs/decisions/D23-One-Work-Table-Out-Of-Band-Alerts.md)

## Reopen

A second ingest shape is accepted without a shared schema, or the bot is treated as durable store of record.
