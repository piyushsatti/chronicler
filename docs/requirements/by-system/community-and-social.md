# Requirements — Follow and request are gated by identity alone, and Identity and access does not know it

System: [community-and-social.md](/docs/systems/community-and-social.md)

## Requirements

| # | Requirement | Because |
| --- | --- | --- |
| R1 | A third access-control mode exists, and [Identity and access](/docs/requirements/by-system/identity-lifecycle.md) does not survey it. | `follow_person`, `unfollow_person`, and `create_request` check only that the caller is authenticated. There is no `ROLE_PERMS` capability for them and no `require_perm` call anywhere in the surface. The actor's own identity is the entire authority: self-service authorization, a legitimate third shape next to RBAC and ownership-plus-override, not a gap in either. |
| R2 | Profile and availability edits are a different, narrower kind of self-service. | They are still `require_perm`-gated by a held capability (`dm_profile.edit`, `availability.set`); what makes them self-service is that the target is always the caller, never a supplied id, so no permission check can be pointed at someone else's row. |
| R3 | Member metrics match what was decided. `attended` reuses the existing `questsPlayed` driver, `summariesAuthored` is the one new count, and `hexesDiscovered` was dropped. [`D8`](/apps/api/docs/decisions/D8-Member-Metrics-Scope.md) | Distilled from system Verdict. |

## Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | Leaving follow/request gated by identity alone stays acceptable because nothing scarce or abusable rides on either action today | If a follow or a request ever gates something limited, such as seat priority, the third access-control mode stops being harmless and needs a rate limit or a real permission the pattern does not currently have |
| A2 | The DM inbox (the deferred read that would make request resolution possible) lands before anything depends on a request meaning something beyond "asked" | Until it does, every created request is permanently pending from the platform's point of view; a requester has no way to learn a DM said yes or no anywhere but Discord or word of mouth |
| A3 | `community_stats`'s roughly dozen-query cost stays acceptable because it only runs on home and admin page loads, not per-entity or per-list-item | If it moves onto a hot or paginated path, the widest-reading read model in the system becomes the read model with the worst cost profile in the system |
| A4 | [`D8`](/apps/api/docs/decisions/D8-Member-Metrics-Scope.md)'s metrics scope, `attended` as `questsPlayed`, `summariesAuthored` new, `hexesDiscovered` dropped, stays the final word on member activity | Reviving `hexesDiscovered` needs a fresh derivation over `quest_hexes` intersected with `quest_participants`, not a ledger read, since the ledger it would have used is already gone |
