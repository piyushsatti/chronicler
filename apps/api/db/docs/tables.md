# Table inventory

**Squashed init (A1, 2026-10-18):** single `0001_init.sql` per [owner-decisions](/docs/audits/owner-decisions.md) and [graphql-product migrations.md](/apps/api/docs/design/graphql-product/migrations.md). Pattern tags: [patterns.md](patterns.md).

## members / actor

| Table                 | Purpose                                        | Pattern                        |
| --------------------- | ---------------------------------------------- | ------------------------------ |
| `members`             | Discord-linked account; roles + status         | root                           |
| `member_settings`     | Normalized UI/prefs facet of a member          | 1:1                            |
| `member_availability` | Weekly time windows for scheduling             | ownership child (addressable)  |
| `dm_profiles`         | DM public profile + review status              | 1:1                            |
| `unlockables`         | Achievement / DM-tier unlock catalog (**N1**)  | catalog                        |
| `member_unlocks`      | Granted unlockables with source                | enriched association           |
| `notifications`       | Per-member inbox only (**D1** / **N4**)        | root-ish / polymorphic subject |

Dropped from pre-squash 0001: `role_changes`, `member_follows`, `dm_requests` (**N2** / **N3**).

## documents

| Table                    | Purpose                                    | Pattern              |
| ------------------------ | ------------------------------------------ | -------------------- |
| `documents`              | Codex / rules / briefs / community content | root                 |
| `document_revisions`     | Snapshot history (**J1**)                  | revisions            |
| `document_links`         | Typed edges (document/quest/character/region targets + summary append order) | enriched association |
| `document_readers`       | Restricted visibility allow-list           | pure M:N             |
| `lieutenant_assignments` | Member duty over an NPC document           | assignment           |

## spatial (C3 pointcrawl-only)

No hex grid tables (`hexes`, `pois`, `hex_edges`, …). See [design.md](design.md).

| Table                    | Purpose                                 | Pattern                       |
| ------------------------ | --------------------------------------- | ----------------------------- |
| `regions`                | Server / archon / uncharted region      | root                          |
| `maps`                   | Named atlas map (`map_kind = pointcrawl`) | root                        |
| `pointcrawl_nodes`       | Node on a map (x/y, optional submap)    | root (map child)              |
| `pointcrawl_edges`       | Same-map edge graph                     | root-ish (keeps `public_id`)  |
| `pointcrawl_entry_links` | Node ↔ document location/subject links  | enriched association          |
| `archon_assignments`     | Member duty over a region               | assignment                    |
| `time_anchors`           | Real UTC ↔ epoch-day rate anchors       | root (time)                   |
| `game_calendar`          | Singleton calendar definition JSON      | infra (singleton)             |
| `game_time_map`          | Real date → game day lookup             | infra                         |

## characters

| Table                          | Purpose                                 | Pattern                       |
| ------------------------------ | --------------------------------------- | ----------------------------- |
| `backstories`                  | Shared backstory / cohort lore          | catalog-ish root              |
| `creation_catalog`             | Species / class / background codes      | catalog                       |
| `character_catalog_picks`      | Normalized character ↔ catalog picks    | pure M:N                      |
| `characters`                   | Player character; `player_xp` is cache  | root                          |
| `character_ddb_mirrors`        | Cached DDB payload JSONB (**G2**)       | 1:1                           |
| `character_progression_ledger` | Append-only XP deltas (truth, **E1**)   | ledger                        |
| `downtime_projects`            | Character downtime goals                | ownership child (addressable) |
| `verifications`                | Approve/reject for polymorphic subjects | polymorphic / workflow        |
| `character_logs`               | Session notes; optional quest link      | ownership child (addressable) |

## quests

| Table                      | Purpose                              | Pattern              |
| -------------------------- | ------------------------------------ | -------------------- |
| `quest_arcs`               | Multi-quest arc container            | root                 |
| `quests`                   | Scheduled table / signup board row   | root                 |
| `quest_participants`       | Signup lifecycle (status, character) | enriched association |
| `quest_pointcrawl_nodes`   | Expected / visited pointcrawl roles (**N5B**) | enriched association |
| `quest_regions`            | Quest ↔ region coverage              | pure M:N             |

Replaces `quest_hexes`.

## jobs and site

| Table                     | Purpose                              | Pattern              |
| ------------------------- | ------------------------------------ | -------------------- |
| `background_jobs`         | Worker queue (lane, state, payload)  | jobs                 |
| `idempotency_keys`        | Product receipts (**I2**)            | infra                |
| `agent_questions`         | Human/agent Q tied 1:1 to a job      | jobs / 1:1-to-job    |
| `discord_activity_events` | Ingested Discord activity facts      | events (external PK) |
| `bot_heartbeats`          | Bot liveness payloads                | infra                |
| `site_settings`           | Keyed site config / pinned documents | infra                |

## views / functions

| Object                     | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `quest_display_status_at()` | Immutable quest display status at `as_of`   |
| `quest_display_status`     | View wrapping `quest_display_status_at(now())` |
| `document_readable()`      | Document audience predicate (D3/D28)         |
