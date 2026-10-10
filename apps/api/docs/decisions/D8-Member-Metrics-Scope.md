# D8: Member Metrics Scope

**Status:** decided 2026-07-15
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

`quest_rewards_v2` already grants `quests_played` milestones at quest close. Issue #150 risked duplicating that work with a parallel “participated” metric.

## Decision

**Read-model only.** Reuse the existing **`quests_played`** driver for **`attended`**. Add exactly one new count: **`summariesAuthored`** (published summaries by author, excluding soft-deleted). Expose both on `memberActivityStats`.

**`questsParticipated` is not a separate metric** — folded into attended to avoid gameable costless-signup padding.

**`hexesDiscovered` is dropped** now that [D7](/apps/api/docs/decisions/D7-Location-Gate-And-Fog-Cleanup.md) removed the ledger (derivable later from quest hexes ∩ participants if wanted).

**No new grant hooks** in this slice; cosmetic unlock wiring and summary milestones are fast-follow. Acceptance is stable, derivable counts.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Two new metrics plus grant hooks | Not chosen; scope shrinks #150 to one new count and one repo method |

## Consequences

Member activity stats align with live milestone logic. Hex discovery is not a first-class metric.

## Enforced by

Shared `count_played_for_member` for milestones and GraphQL; `summariesAuthored` query filters published and not deleted.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
