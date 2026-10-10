# Requirements — Ownership is one relation in code, and two live writes bypass it anyway

System: [characters.md](/docs/systems/characters.md)

## Requirements

| # | Requirement | Because |
| --- | --- | --- |
| R1 | A character has exactly one owner, `characters.owner_id`, set once at creation and checked in code on every write. | It is never an editable table row. [`D14`](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md) |
| R2 | No principal besides the owning player may mutate a player character. | Admins and verifiers may inspect it and record verification decisions, but may not edit it or initiate D&D Beyond sync. This is the explicit player-character exception to [`D29`](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md), owner ruling 2026-09-16. |
| R3 | The owner-only boundary covers the whole aggregate: profile/guild/status writes, progression and logs, verification submission, downtime, and D&D Beyond re-sync. | Distilled from system Verdict. |
| R4 | Whether a character is trusted gates exactly one thing: quest signup. | A verifier's approve/reject is the only source of that trust, and there is no frontend page for a verifier to act on, only raw GraphQL. |
| R5 | Character is one of ten aggregate roots. Its progression ledger, D&D Beyond mirror, downtime projects, and session logs commit inside the same boundary; nothing outside it touches those tables directly. [`D26`](/apps/api/docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md) | Distilled from system Verdict. |

## Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | Every character write that checks ownership uses one of [`D14`](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md)'s declared breadths, so an unnamed check is the exception rather than the rule | The two live defects here are not isolated; other character writes carry the same silent over-permission, undetected until the next survey |
| A2 | A four-value `character_status` enum with no `rejected` state is acceptable, so a rejection is recoverable only by reading the `verifications` ledger | A rejected character is indistinguishable from a never-reviewed one to anything reading `characters.status` alone, and a submitter has no status to check beyond "still pending" |
| A3 | `ALLOWED_HOSTS` stays hand-maintained and correctly tracks every legitimate D&D Beyond host | A DDB domain change breaks every sync silently until someone edits the allowlist, or a legitimate host is missing from the start and fails with no code change staged for it |
| A4 | "Any `dm` may sync" and "any `dm` may adjust XP" were reachable in production because no other check narrowed them before this survey | If some other gate exists that this page missed, the defect analysis in [`D14`](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md) and the two findings below is itself wrong |
