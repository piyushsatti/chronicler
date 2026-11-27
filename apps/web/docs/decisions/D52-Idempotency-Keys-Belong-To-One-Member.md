# D52: Idempotency Keys Belong To One Member

**Status:** decided 2026-11-27 (ruled-provisional 2026-11-14)
**Kind:** local
**Owner:** `apps/web/docs/decisions/`
**Interface:** n/a

## Context

The shared session-fenced mutation hook (issue #97) stores one idempotency key per payload so a retry of a failed command reuses its key. The ticket did not say what happens to stored keys when the session changes while a command is pending or failed. Keeping them lets a key outlive its account; dropping them on every token change lets a retry after a token refresh apply twice.

## Decision

Pattern: idempotency key, scoped per actor. The client follows the scope the API already uses (`idempotency_keys` is unique on endpoint, actor and key).

- Stored keys are kept while the signed-in **member id** stays the same. A new token or a role change for the same member keeps them.
- Stored keys are dropped when the member id changes or the visitor signs out.
- A command refused by the fence reports an error to the caller. It never fails silently.
- The busy guard is not reset by a token or role change for the same member while a call is in flight.

Decided by the lead agent under the owner's 2026-11-14 delegation. The owner confirmed it on 2026-11-27 after a review of the IETF Idempotency-Key draft, Stripe and AWS practice (reuse the key on retry, scope it to the caller, reject a reused key with a different payload): "If that's how standards and systems have defined this, please let's do that."

Web writes take their key from `useFencedMutation` (`useCommandFence` for hooks that keep their own mutation state; `useMemberKeys` for the settings save, which must survive a token refresh mid-flight, and for the editor, whose multi-step save retires each step's key on its own). Client-only ids that are never sent as keys come from `newClientId()` in `src/utils/clientId.ts`.

## Alternatives rejected

| Alternative                        | Why not                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| Keep keys across any session change | A key made for one member is offered for another                     |
| Drop keys on every token change    | A retry after a token refresh gets a new key and can apply twice     |
| Key the store by token             | Same double-apply case; a token is not the actor                     |

## Consequences

A retry is safe across token refresh. Keys never cross accounts on the client; the API's per-actor uniqueness stays the second line of defence.

## Enforced by

`useFencedMutation` and its tests, which land with issue #97. Until then: **not enforced**.

## Reopen triggers

- The API changes the scope of `idempotency_keys` away from per-actor.
- One browser session may act as more than one member at once.
