# Interface: Discord as sensor

**Status:** accepted  
**Provider:** `apps/api` (authoritative announces and writes to Discord)  
**Consumers:** `apps/discord` (Gateway observer only)

## Rule

The Discord bot is a read-only sensor and activity forwarder. It never announces quests, never creates scheduled events, and never authors campaign facts. The API owns Discord announcement and scheduled-event creation. Authoritative records are authored on the website.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| No announce / write-back mutations for bot principal | GraphQL auth registry / bot code review | **not enforced** |

## Provider

API announce paths and Discord webhook/outbound calls. Local design: `apps/api/docs/`.

## Consumers

Discord app docs: [durable spool](/apps/discord/docs/durable-spool.md), [service notes](/apps/discord/docs/service-notes.md).

## Related decisions

- [D1](/docs/decisions/D1-Discord-Announce-Ownership.md)

## Reopen

The bot is granted a write path for announces or scheduled events, or Discord becomes a source of authoritative campaign facts.
