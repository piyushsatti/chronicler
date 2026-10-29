# D47: Guest onboarding and player promotion

**Status:** decided 2026-10-29
**Kind:** boundary
**Owner:** `docs/decisions/`
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

The owner chose a guest role for new Discord sign-ins. Existing members retain their roles. Character approval establishes eligibility to join quests.

## Decision

Use an explicit role state transition through the existing CQRS commands and unit of work. First Discord sign-in explicitly inserts `guest`. Returning sign-ins preserve stored roles, and the database default for other creation paths remains `player`.

Guests can do everything a player can except sign up for quests (owner decision D1): availability, summary authoring, and reading. For Document audiences, `document.ScopeFromAuthority` adds `player` to a guest's viewer roles, so `role:player` documents admit guests in both the Go and SQL readability checks. The guest's claims do not gain `player`. Existing participation can still be withdrawn. A member holding both `guest` and `player` (set by an admin) is a player and may sign up.

When `decideVerification` approves a guest's character, the transaction locks the owning member, replaces `guest` with `player`, preserves other roles, and appends one role-history entry attributed to the verifier. Concurrent first approvals serialize on that member lock. Assessment, character state, role history, notification, and idempotency receipt commit together or roll back together.

Rejection and replay do not promote a member. Later character retirement or deletion never removes `player`. The admin role commands remain the authority for explicit role changes.

GraphQL roles remain strings. Existing vocabulary validation and the database constraint admit `guest`. The grant reconciler projects achievements and DM-tier unlocks, so this decision adds no Discord role mapping.

## Alternatives rejected

- Assigning `player` on first sign-in permits quest signup before character approval.
- Treating `guest` as `player` in `Claims.Has` would also admit quest signup; only the Document viewer scope widens.
- Promoting outside the verification transaction permits a partial approval or duplicate role history.
- Adding a GraphQL role enum changes the existing string contract without an owner decision.

## Consequences

This converges on the member row as the single role authority, read live at the request boundary. Web controls explain that character approval unlocks quest signup.

Migration `0012_guest_role.sql` must run before new guest inserts. Its downgrade refuses while any member retains `guest`, preserving those members' roles.

## Enforced by

- `TestGuestHasPlayerPermissionsExceptSignup` checks policy: guest signup is denied, guest-plus-player signup is allowed, and claims never gain `player`.
- `TestGuestScopeReadsPlayerAudience` checks that a guest reads `role:player` documents through the Go and SQL viewer scope.
- `TestNewDiscordMemberStartsGuestAndExistingRolesRemain` checks initial and returning identities.
- `TestGuestRoleMigrationPreservesMembersAndRejectsUnsafeDown` checks the migration.
- `TestApprovedCharacterPromotesGuestAtomically` checks promotion, rejection, replay, concurrent approvals, retirement, deletion, and rollback.

These database tests require disposable Postgres. Their presence does not establish an executed result. The phase report records which gates ran.

## Reopen triggers

- Character approval no longer defines quest-signup eligibility.
- A new role authority bypasses the member row or the verification transaction.
- An approved contract change replaces string roles.
