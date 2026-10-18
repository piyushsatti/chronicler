# Resolved owner policies and exact acceptance

**Status:** accepted design. Published schema/config and comment scaffolds do not implement these contracts. Runtime enforcement remains pending the owning implementation tasks and their tests.

Accepted owner policies: no DDB prerequisite for approval; quest PCXP is recorded on **close** into `character_progression_ledger` only (**E1**). **N3** retires DM request/follow social workflows — no `dm_requests`, `request_decisions`, or `member_follows`. Runtime implementation remains unverified until the owning acceptance tests pass.

## Optional DDB enrichment

Approval does not check presence, URL resolution, successful snapshot, snapshot age, link match or sync failure. Existing assessment authority, pending submission token and ordinary state rules remain. Linkless032, linked030, stale mirror at1Jan and failed latest sync all permit a matching pending approval by verifier005. None initiates a fetch. Sync remains owner-only optional enrichment updating `character_ddb_mirrors.payload` (**G2**, **N7** — no `character_ddb_attempts` table). Failure leaves last-good mirror unchanged. Retry requires an explicit owner command/new key; matching replay returns the recorded mirror state without refetch. Synthetic parser fixtures prove parser behavior only. The real dated public-premade capture in ddb-parser-contract.md supports offline shape/drift tests.

## Close and PCXP (ledger-only)

closeQuest requires input `{attendance,rewards}`. Actor is owning questDM or declared Quest admin/owner bypass; state must be played. attendance supplies played/no_show for known roster entries. Existing final attestations may be omitted, but every remaining signed_up/waitlisted row requires final attestation. No unknown characters or fabricated roster. rewards ≤ 100, unique characterID, positive GraphQL Int PCXP. Recipient must have resulting played attendance. No no_show award, cosmetic, achievement or DM-tier reward. Existing admin-only unlock grants remain separate. Empty rewards is a real no-award closure.

**Superseded by owner-decisions E1 / N2 (2026-10-18):** No `quest_reward_entitlements`, `quest_reward_decisions`, or separate claim mutation. Closing transaction: lock Quest; validate roster/attestation; apply final statuses; release signed_up capacity; record closed/closed_at; insert **progression ledger** rows (`kind` pcxp, `quest_id`, `reason` quest_reward, note, recorded_by) and update cached PCXP atomically; record desired Discord revision/stable job. No parallel entitlement bank and no reward-specific inbox kind.

Closing transaction (target): one UOW performs all ledger inserts for declared rewards; replay returns the original closure receipt without duplicate ledger rows. Inject ledger/cache failure after validation: rollback closed status, capacity release, ledger, cache, job desire, and receipt together. Award to no_show INVALID. Cosmetic/achievement reward input is rejected, never ignored.

Exact delta (adapted **E1**): 053 played with Ben 031 signed_up; close attendance 031 played and rewards 031 PCXP 4/note Victory at 14Oct12Z. Dee 003 closes: 053 closed/filled 0; Ben 031 receives ledger delta +4 in the same transaction; Ben PCXP becomes 9. Ava/admin/DM cannot append ledger on behalf of another owner. Inbox counts unchanged (no reward notification kind).

## Social request resolution

**Superseded by N3 (2026-10-18):** Request/follow/decide flows and `DM_REQUEST_DECIDED` notifications are **not** in squashed product schema. Retained acceptance prose in mounted fixtures is historical only.

## Ledger provenance and totals

`character_progression_ledger.delta` remains the signed PCXP truth for every row. Character reads derive pcxp from SUM(delta), checked for GraphQL Int range. `characters.player_xp` is a cache used for admission and consistency checks, never substituted for that sum on a read. A discrepancy reports the real ledger value on the Character projection and produces the explicit work consistency issue. No reader repairs the cache.

Migration adds ledger kind pcxp, nullable quest_id, note, recorded_by and metadata. Legacy reason is retained byte-for-byte. No title, summary frontmatter, prose reason, or attendance row is parsed to invent quest attribution, actor, note, or amount. Existing note/actor/questId therefore project null unless their new columns are actually supplied. ProgressionEntry.amount maps delta, kind maps stored kind, recordedAt maps created_at. A new player adjustment/claim supplies all declared provenance through the existing ledger writer. The reward-total reader sums only ledger rows whose quest_id is one of the requested IDs and reason is the command-owned quest_reward value. Unknown old quest attribution follows the coverage ruling below.

LEDGER-TRUTH (CHA04, C09 and S03 companions) seeds 030 with ledger entries +10/+2 and deliberately changes only cached player_xp to 11. Character.pcxp is 12. Worker consistency returns Expected 12/Actual 11. Closing 053 with 4 PCXP inserts one quest-linked ledger row in the close UOW; attributable total is 4 immediately. Replay changes neither total. Legacy unrelated +5 never becomes a quest reward. Overflows and corrupt dependency reads fail visibly before serialization.

## Accepted reward-total coverage ruling, 2026-10-16 (E1)

`QuestSummaryTotalsV2Type.itemGrants` is retired. `totalPcxpAwarded: Int` is nullable and `coverage: RewardCoverage!` is COMPLETE or LEGACY_UNKNOWN.

**Squash (E1 / N2):** No `quest_reward_decisions` or entitlement tables. For each selected **closed** quest, COMPLETE means the numeric total is the sum of ledger rows with that `quest_id` and reason `quest_reward`. LEGACY_UNKNOWN applies when pre-cutover closure left no reliable quest-linked ledger attribution (honest null total). Open/full/played/cancelled quests report 0/COMPLETE for **current** awarded total (no ledger rows yet). An unknown quest is NOT_FOUND. Authorization precedes totals. QUE05/`character.RewardTotalsReader` remains ledger authority; Quest does not maintain a parallel decision table.

REWARD-COVERAGE companions use legacy closed 051 without quest-linked ledger rows (LEGACY_UNKNOWN), played 053 (0/COMPLETE until close), and closed 055 with empty reward closure (0/COMPLETE). Close 053 with 4 PCXP inserts ledger rows in the same transaction; total becomes 4/COMPLETE without a separate claim step. Inject ledger insert failure: closed status, job desire, and receipt roll back together.
