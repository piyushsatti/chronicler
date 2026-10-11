# D18: The Member Row Is The Session

**Status:** decided 2026-07-27, revised same day
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

[D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md) assumed `members.status` could kill sessions; status was read but not written in app code. Tokens had no `jti`, no server logout, and no denylist — browser delete left JWTs valid up to expiry.

Owner revision: **per-device sign-out is wanted.** Deactivation via status as a third kill mechanism was later withdrawn (2026-07-30): banning is manual SQL; no in-app account-disable path.

## Decision

**The member row is the session record.** Kill mechanisms use columns already loaded on every request ([D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md)) — **zero extra queries.**

| Column                       | Effect                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `members.tokens_valid_after` | Invalidates every token issued before timestamp (compare to `iat`)            |
| `members.revoked_jtis`       | Bounded set of `(jti, exp)` — **one device** sign-out                         |
| `members.status`             | Was intended for ban/deactivate; product path withdrawn per 2026-07-30 ruling |

Tokens gain a server-issued **`jti`**. **Sign out (this device)** appends `jti` to `revoked_jtis`. **Sign out everywhere** bumps `tokens_valid_after`. Requires a **backend logout endpoint** (client-only delete today).

**IDENT-4:** `session_events` ledger ([D16](/apps/api/docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md)) records server actions (mint, revocation, status change); not token expiry.

**IDENT-5:** dev token minter fail-closed on database-name allowlist (reuse seed guard pattern) plus ledger on permitted mints.

## Alternatives rejected

| Alternative                             | Why not                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| Separate `sessions` table per token     | Extra write per login and lookup per request; grows without bound |
| Redis / shared cache denylist           | No store; member row already read                                 |
| Secret rotation or shorter expiry alone | Break-glass or window-shrink, not per-device revocation           |
| Per-device sign-out rejected            | **Withdrawn** — owner stated per-device sign-out is desired       |

## Consequences

Revocation becomes observable and enforceable at the boundary. Session event ledger grows per login.

## Enforced by

Member-row fields compared on each authenticated request; logout mutations when implemented.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
