# D11: Live Authority At The Boundary

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

Both in their smallest form. No policy engine, no session store, no denylist, no version column.

## Decision

**Authority is live, read from the member row on every request at the boundary. No cache, no TTL.
Roles leave the token.** *(Amended 2026-07-31; originally ruled with a short-TTL cache in front of
the read, see "Rejected, and why" below.)*

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Token-only authority (status quo) | Contradicts R2, which is already written. `revocation_v2.py` exists to close a named security-review finding; with `jwt_expiry_hours = 24`, a banned or demoted member keeps `role.grant`, `verification.decide`, `region.edit`, `map.link_entry` and `bounty.create` for a day. |
| Naive live read | Correct but wasteful: the frontend does not batch, so a quest page's ~17 operations become ~17 full member-row reads for someone whose roles have not changed in months. |
| Claims versioning (`members.authority_version`) | Proposed and withdrawn the same day. `SELECT authority_version FROM members WHERE id=?` costs exactly what `SELECT roles, status FROM members WHERE id=?` costs: same row, same index, same round trip. The version column buys nothing it does not already have, while adding a migration and a transactional coupling ("bump in the same transaction, or you leave a window"). Owner rejected it; the rejection was right for a sharper reason than the one originally given. |
| Read-through cache with TTL *(withdrawn `OWNER 2026-07-31`)* | Originally adopted here to turn 17 authority reads per page into 1, across requests. `OWNER 2026-07-31` ruled revocation must be immediate: a demoted, banned, or role-changed member loses privileged access on the very next request, with no lag window. Any TTL, however short, is a lag window, so the cache is withdrawn. What remains is per-request sharing (the context-object row above), which does not carry authority across requests and so introduces no lag. |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A written ADR supersedes this decision.
