# D26: Ten Roots Not Forty Five Repos

**Status:** decided 2026-07-28
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

Forty-five repository classes map ~one table each. Same-transaction pairs and composite FKs in DDL already define real consistency boundaries. Owner rejected a shared `get_by_id` mixin (2026-07-28) that would make 45 repos tolerable without asking why there are 45.

## Decision

**Collapse to 10 aggregate roots** (plus plain lookup tables and `idempotency_keys` infrastructure). Boundaries are transcribed from documented same-transaction writes and DDL — not invented.

| Root | Absorbs (count today) |
| --- | --- |
| Map | hexes, edges, POIs, pointcrawl, map changes (**9**) |
| Member | profiles, availability, roles, settings, unlocks, verifications (**7**) |
| Document | revisions, readers, links, assets, asset_links, lieutenant assignments (**6**) |
| Character | DDB mirror, downtime, progression ledger, logs (**5**) |
| Quest | regions, participants, hexes (**4**) |
| Region, Activity, Time, Social, QuestArc | smaller pairs |

**Reference data** (`unlockables`, `backstories`, `creation_catalog`, terrain rules) — lookups only, no root.

**Enforcement:** import-graph test fails the build when code outside a root's repository imports that root's inner ORM models — not docstring convention (17 wordings of "flush never commit", 7 repos silent).

**GQL-SQL-5:** `relationship()` only **inside** an aggregate; cross-aggregate edges are id columns only — empty v2 relationship graph was deliberate boundary absence, not neglect.

Migrate **one root completely per change** ([D25](/apps/api/docs/decisions/D25-Expected-Failures-Are-Values.md) same rule). Map first.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Generic repository / shared `get_by_id` mixin | Leaves any code reaching any table; same-transaction pairs stay "by hope" |
| 45 repos with better docstrings | Survey shows conventions decay; not enforceable |
| Event sourcing aggregates | State lives in rows; consistent with [D16](/apps/api/docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md) |
| ORM relationships across aggregate edges | Hole in boundary — enables `quest.document.revisions` writes |

## Consequences

Quest `filled_count` and participant rows commit behind one door. Resolvers stop importing inner repos directly.

## Enforced by

Import-graph pytest (or future lint); aggregate migrations delete absorbed repo modules.

## Reopen triggers

- Aggregate half-migrated across more than one merge.
- Same-transaction pair found that crosses two roots without a modeled cross-root transaction.
- Root grows past ~15 public methods after migration (`QuestsRepo` at 28 is the warning).

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
