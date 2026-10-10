# D41: Go API Token Claims

**Status:** decided 2026-10-09
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** `/auth/discord*`

## Context

The old API minted a JWT at Discord OAuth login with member id, roles, archon regions, and lieutenant NPCs. Middleware alone cannot see live revocation; privileged commands must recheck the database.

## Decision

The Go API owns `/auth/discord` and `/auth/discord/callback`. The login token is a signed JWT (HS256) with claims:

| Claim | Meaning |
| --- | --- |
| `member_id` | UUID of the member row |
| `roles` | role strings at mint time |
| `archon_regions` | region ids the member archons |
| `lt_npcs` | NPC document ids the member is lieutenant for |

A missing or invalid bearer token makes the caller **anonymous**. It does not return 401 on public reads. Privileged commands recheck roles and assignments in the database after claims are parsed.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Cookie sessions | Old clients already use bearer JWT in JSON body from OAuth |
| Middleware-only auth | Cannot see revocation after mint |

## Consequences

`internal/login` mints tokens. `internal/platform/auth` parses them. Commands that need live privilege call a recheck helper.

## Enforced by

Contract tests on `/auth/discord/callback` and unit tests that a forged token is treated as anonymous.

## Reopen triggers

Token shape changes, or a second auth provider is added.
