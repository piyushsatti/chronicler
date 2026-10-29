# D48: Former DMs retain owned quest management

**Status:** decided 2026-10-29
**Kind:** boundary
**Owner:** `docs/decisions/`
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

Quest management uses the quest's recorded DM identity. Creating a quest separately checks current approved DM authority, with existing privileged overrides. The audit asked whether losing DM authority should also remove management of existing quests.

## Decision

Owner ruling, 2026-10-29: "keep today's behaviour. A former DM still manages the quests they own."

Retain ownership-based authorization through the existing authorization Specification. Losing the DM role or approved DM-profile status does not remove the ability to update, transition, close, select participants for, delete, or synchronize one's existing quests. Foreign-quest ownership checks and existing admin/platform-owner overrides remain in force. Creating another quest still uses the current approved-DM gate and existing privileged overrides.

## Alternatives rejected

- Requiring current DM authority for owned-quest management contradicts the owner ruling and prevents former DMs from closing or maintaining existing quests.
- Adding a separate former-DM permission duplicates the recorded quest ownership rule.

## Consequences

This converges on the quest's recorded DM as the single ownership authority for its management. Demotion changes creation eligibility without changing ownership. The audit's finding 22 is dropped as a defect; this decision records the accepted behavior.

## Enforced by

`TestFormerDMRetainsOwnedQuestManagement` pins owned management, foreign denial, and creation denial after role removal or loss of profile approval. `Policy.decideQuestReadRule` and `Policy.decideQuestContentRule` own those checks.

## Reopen triggers

- The owner chooses to transfer or suspend existing quest ownership on demotion.
- A management operation authorizes former DMs through a different ownership rule.
