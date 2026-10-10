# Requirements index

Curated verdict snapshots for humans. **Obligation text and stable ids live in [by-system/](/docs/requirements/by-system)** — those tables are the authority; this page crosswalks or marks `index-only` rows that are not mirrored there.

Hub: [README.md](/docs/requirements/README.md). Systems map: [systems.md](/docs/systems.md) (14/14). Verdict meanings: **met** / **partial** / **absent** / **unknown** / **contradicted**.

## How to use

1. Open the system in [systems.md](/docs/systems.md); read obligations in the matching [by-system/](/docs/requirements/by-system) file.
2. Use a row below only when you need a one-line verdict without opening every system table.
3. When a by-system obligation’s verdict changes, update the crosswalk row here in the same change (or drop the row if the obligation moved).

## Core reliability

Stakeholder-facing slices from the historical RTM; not duplicated as rows in the fourteen system extracts.

| Index id | Requirement | Verdict | Authority |
| --- | --- | --- | --- |
| CR-R1 | Quest creation affordances and API authorization require DM | partial | **index-only** — spans quest authoring and live authz; no single by-system row states this end-to-end obligation. |
| CR-R2 | DM can save edits, submit profile, correct and resubmit without recreating identity | partial | [community-and-social R2](/docs/requirements/by-system/community-and-social.md) |
| CR-R3 | Verification reachable; character/profile and DDB evidence are actionable links | partial | [characters R4](/docs/requirements/by-system/characters.md) |
| CR-R4 | Character approval feedback uses owner-targeted in-app notification path | partial | **index-only** — no by-system row covers owner-targeted approval notifications. |
| CR-R5 | User-visible failures correlate to safe operation/stage/build info; off-host searchable | partial | **index-only** — observability contract is interface- and ops-shaped, not extracted to a system requirement table. |

## Authorization (sample)

| Index id | Requirement | Verdict | Authority |
| --- | --- | --- | --- |
| Authorization:R1 | One place answers every authz question | partial | **index-only** — cross-cutting authz themes; no dedicated by-system extract (see [live-authority](/docs/interfaces/live-authority.md)). |
| Authorization:R2 | Authority is live (revoked role stops next request) | met | **index-only** — ruled in [D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md); not copied into a by-system `R`/`L` row. |
| Authorization:R3 | One may-V-see-D specification for every caller | partial | [documents-and-audience R1](/docs/requirements/by-system/documents-and-audience.md) |
| Authorization:R4 | Every privileged decision leaves a record | met | **index-only** — audit-trail obligations are split across lifecycle and domain tables without one by-system row for “every privileged decision.” |
| Authorization:R5 | Unknown means denied | partial | **index-only** — default-deny pattern is not consolidated into one by-system requirement row. |
| Authorization:R6 | Frontend reflects, never computes, authority | partial | **index-only** — UI reflection of authority is a frontend/interface concern without a matching by-system `R` row. |
| Authorization:R7 | Every data boundary is named with its own authority | absent | **index-only** — boundary inventory lives in interface seams and decisions, not in the fourteen by-system tables. |

## Connections and capacity (sample)

| Index id | Requirement | Verdict | Authority |
| --- | --- | --- | --- |
| Connections-and-limits:R1 | Total Postgres connection budget stated as env var | met | **index-only** — connection budget is documented under API capacity and config, not in a by-system requirement table. |
| Connections-and-limits:R2 | Budget split across api/scheduler/CLI | met | **index-only** — same as R1; per-process shares are ops/API attribution, not a system extract row. |
| Connections-and-limits:R4 | Pool exhaustion is a fast identifiable rejection | met | **index-only** — typed pool rejection is an API capacity mechanism, not mirrored in by-system tables. |
| Capacity-envelope:C1 | Stated concrete concurrent-user target | met | **index-only** — load target lives in load-test config and [capacity](/apps/api/docs/capacity.md), not in by-system tables. |
| Capacity-envelope:C2 | Capacity number from a real load test | met | **index-only** — measured ceiling is recorded in [capacity](/apps/api/docs/capacity.md), not as a system `R`/`L` row. |
| Capacity-envelope:C3 | Pool exhaustion fails fast and visibly | met | **index-only** — overlaps Connections R4; neither obligation is duplicated in the fourteen by-system extracts. |

## Maintenance

Add or adjust index rows when a curated verdict snapshot is worth keeping. New **product obligations** belong in the relevant [by-system/](/docs/requirements/by-system) file first; cite that `R` or `L` id here, or tag `index-only` with one sentence if it deliberately stays out of system tables.
