# Requirements — A quest is a five-state machine with two owners, and its written record outlives both

System: [quests-and-play.md](/docs/systems/quests-and-play.md)

## Requirements

| # | Requirement | Because |
| --- | --- | --- |
| R1 | The lifecycle is an explicit, named state machine, not an implicit one inferred from scattered checks: `open → full → played → closed`, with `cancelled` reachable only before play. | `closed` and `cancelled` are terminal. Nobody has to read five service files to find the graph; it is one dict. |
| R2 | Signup is a compare-and-swap on a row, not a read-then-write. | A single conditional `UPDATE` claims a slot or fails; the fallback on failure is a waitlist, never a rejection, until the quest has actually been played, closed, or cancelled. |
| R3 | The written record's identity is a nullable document id, never a slug or a `(quest, category, character)` tuple. | [`D2`](/apps/api/docs/decisions/D2-Multi-Quest-Summary-Identity.md) closed the latent bug in the old upsert-by-content-match approach outright. |
| R4 | DMs are excluded from writing character progression and character logs. | Admin and platform owner are not, and never can be, per [`D29`](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md). A `dm`-role holder with no relationship to a character does not adjust its XP, touch its logs, or force its D&D Beyond re-sync. [`D14`](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md) states the ordinary-principal rule; a survey found it violated live on both call sites at once. |
| R5 | Announce is backend-owned, both legs, and the multimedia half has never run. | [`D1`](/docs/decisions/D1-Discord-Announce-Ownership.md) settled who posts to Discord. Nothing settled whether the image branch should exist at all, because nothing in the codebase can create the `Asset` row it reads. |
| R6 | Rewards reuse existing ledgers; nothing quest-specific was built for them. | PCXP and cosmetic unlocks ride the same bank-ledger and unlock-catalog machinery every other write path already uses. |

## Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | Every character write checks the breadth [`D14`](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md) declares, so an unnamed or mismatched check is the exception, not the rule | An unaudited write path could still grant a `dm`-role holder access to a character with no relationship, the same defect shape a prior survey found and closed on the reward path |
| A2 | Nothing in the codebase can create an `Asset` row (FINDINGS 60), so the announce multimedia branch has never executed | If a writer exists that this page missed, an unaudienced image (FINDINGS 61: text is redacted, images are not) is already reaching a public Discord channel from inside a `[!dm]` callout |
| A3 | Every write to `filled_count` goes through `reserve_slot`/`release_slot`, never a direct `quest_participants` insert from elsewhere in the codebase | A future write path that bypasses those two methods silently desyncs the board's slot count from the true roster, and nothing today would notice or recompute it |
| A4 | Attendee counts per quest stay small (party-scale, not raid-scale), so one ledger append per attendee per reward inside `close_quest`'s single transaction is cheap | A quest with hundreds of attendees turns quest close into a long-held transaction and a lock-contention risk; nothing in the code caps roster size at close |
| A5 | Trusted DM-to-DM quest assignment (#148 R1) is acceptable because the DM population is small and mutually known | At a larger DM roster, a quest could be assigned to a DM who does not want it, with no notification and no decline path built |
