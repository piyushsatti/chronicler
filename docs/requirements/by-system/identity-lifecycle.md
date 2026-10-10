# Requirements — How identity lifecycle should work

System: [identity-lifecycle.md](/docs/systems/identity-lifecycle.md)

## Requirements

| # | Requirement | Because |
|---|---|---|
| L1 | A session ends when exactly one of three things says so: expiry, logout, or revocation, whichever fires first, and each is distinguishable from the others. | An expiry-only model is indistinguishable from "never logged in": both must resolve to anonymous, but the reason should still be knowable. |
| L2 | Expiry is a designed experience, not an error cascade. The member sees a clear "your session ended, sign in again" moment, at or before the actual expiry, not a silent slide into degraded/anonymous behavior on whatever page they happen to be on. | An opportunistic, un-signalled expiry lets a stale tab keep sending a dead token that the server quietly treats as anonymous, with no user-visible cue. |
| L3 | A specific, compromised token can be killed before its natural expiry, without waiting out the full TTL and without requiring a role change to trigger a recheck. | A bearer token with no revocation path stays valid for its full TTL even once known-compromised. |
| L4 | **Withdrawn, owner ruling 2026-07-30.** No requirement for an in-app account-death transition exists. `MemberStatus.BANNED`/`INACTIVE` stay declared and unwritten by application code; that is accepted design, not a defect awaiting a fix. Banning, when it happens, is a manual SQL update against production, outside the app entirely. | There is no account-disable path in the app and none is wanted; adding one would be building a mechanism for a state the product does not need to reach through code. |
| L5 | Every identity-lifecycle transition (mint, refresh, logout, revoke, deactivate) leaves a record: who, when, why. | Role mutations already carry this precedent (`role_changes`); session and account-status transitions should carry the same one. |
| L6 | Provisioning a member (birth) and authorizing what that member may do (role changes) are handled by separate mechanisms, not conflated. | Keeps identity creation and privilege assignment independently reasoned-about rather than coupled through one code path. |

**L3 does not re-litigate R2.** `Authorization.md` R2 asks whether *role* authority should be live
on every request. L3 asks a narrower question: whether a *specific token* can be killed regardless
of whether authority resolution is live. A system could adopt L3 without adopting R2 (a denylist
checked at Identify, claims otherwise unchanged) or adopt R2 without L3 (live role authority makes a
demoted token harmless, but a token for a still-privileged member stays valid). Both are legitimate
answers; this page does not pick between them, and the live-authority fork itself belongs to R2, not
here.

**L2 depends on L1's distinctions existing.** A single "session ended" message cannot be correct for
expiry, logout, and revocation at once if the product wants different next actions for each (e.g.,
revocation might warrant "contact an admin," expiry just "sign in again"). Whether the UX
differentiates the three is a product decision layered on top of L1's technical distinction; L1
only requires the distinction be knowable.
