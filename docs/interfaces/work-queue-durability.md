# Interface: Durable work and out-of-band alerts

**Status:** accepted  
**Provider:** `apps/api`  
**Consumers:** operators / alert channel; `apps/discord` (transport buffer only)

## Rule

The API owns durable retryable work in one Postgres work table. Operator alerts must not share a failure domain with the process they watch (for example Discord webhook from a different path than the bot process). The bot’s in-memory or local retry is a transport buffer, not durability.

## Enforcement

| Mechanism                          | Location  | Status           |
| ---------------------------------- | --------- | ---------------- |
| Work table + worker contract tests | API tests | **not enforced** |

## Provider

Work queue worker and alert emitter: `apps/api/docs/`.

## Consumers

A failed activity POST is dropped. There is no bot-local spool: [activity](/apps/discord/docs/activity.md).

## Related decisions

- [D23](/docs/decisions/D23-One-Work-Table-Out-Of-Band-Alerts.md)
- [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md)

## Reopen

A message broker or bot-local durable store is accepted as the primary durability mechanism.
