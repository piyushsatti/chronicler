# Requirements — The data model has ten nouns, not forty-five, and each owns a door

System: [data-model.md](/docs/systems/data-model.md)

## Requirements

| # | Requirement | Because |
| --- | --- | --- |
| R1 | The target is ten aggregate roots, not forty-five table-scoped repositories. | [`D26`](/apps/api/docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md) collapses the table-per-repository shape into 10 roots, plus a handful of plain reference tables that get no boundary at all. |
| R2 | The boundaries are not a redesign. Every one is copied from a same-transaction pair the code already documents, or a composite foreign key already in the DDL. Nothing was invented. | Distilled from system Verdict. |
| R3 | The fix is a boundary, and the boundary is enforced by a test, not a habit. | A build that lets code reach across a boundary fails; a build that doesn't, doesn't. |
| R4 | Relationships follow the same rule. Inside a boundary, load freely. Across one, hold an id and nothing else. | Distilled from system Verdict. |

## Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | The 12 documented same-transaction pairs and the composite foreign keys are a complete map of where consistency must hold | A boundary is drawn in the wrong place, and the fix is to correct that boundary, not to abandon the pattern |
| A2 | An import-graph test can distinguish "root's own repository" from "everything else" cleanly enough to enforce without constant exemptions | The boundary needs exemptions to ship, which [`D26`](/apps/api/docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md) names as the signal that the boundary itself is misdrawn |
| A3 | No same-transaction pair crosses two roots in a way that cannot be modelled as an ordinary cross-root transaction (write root A, then write root B, both succeed or the caller compensates) | A genuine two-root invariant exists, and one of the ten roots is wrong, not just its implementation |
| A4 | Reference tables (`unlockables`, `backstories`, `creation_catalog`, `terrain_movement_rules`) truly carry no invariant of their own | One of them gains a real consistency rule later (e.g. an unlock grant that must agree with a member's unlocked-items row) and needs promotion to an aggregate it currently isn't |
| A5 | Migrating one aggregate root at a time, never partially, is achievable without two live conventions coexisting past a single merge | A root ships half-migrated across more than one merge, and the codebase runs two door-policies for the same tables at once, which is worse than the 45-repo status quo it replaces |
