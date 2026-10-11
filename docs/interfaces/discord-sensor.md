# Interface: Discord as sensor

**Status:** accepted  
**Provider:** `apps/api` (authoritative announces and writes to Discord)  
**Consumers:** `apps/discord` (Gateway observer only)

## Rule

The Discord bot is a read-only sensor and activity forwarder. It never announces quests, never creates scheduled events, and never authors campaign facts. The API owns Discord announcement and scheduled-event creation. Authoritative records are authored on the website.

## Enforcement

| Mechanism                                                                    | Location                                                            | Status       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------ |
| No announce, scheduled-event, GraphQL, or database client in the Discord app | [sensor.test.ts](/apps/discord/tests/unit/interface/sensor.test.ts) | **enforced** |

## Provider

API announce paths and Discord webhook/outbound calls. Local design: `apps/api/docs/`.

## Consumers

Gateway observation: [activity](/apps/discord/docs/activity.md).

## Related decisions

- [D1](/docs/decisions/D1-Discord-Announce-Ownership.md)

## Reopen

The bot is granted a write path for announces or scheduled events, or Discord becomes a source of authoritative campaign facts.
