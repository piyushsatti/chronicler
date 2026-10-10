# Table inventory

Sections match comment banners in `migrations/0001_init.sql`. Pattern tags: [patterns.md](patterns.md).

## members / actor

| Table | Purpose | Pattern |
| --- | --- | --- |
| `members` | Discord-linked account; roles + status | root |
| `role_changes` | Audit trail for role array changes | events (legacy `*_changes`) |
| `member_settings` | UI/prefs facet of a member | 1:1 |
| `member_availability` | Weekly time windows for scheduling | ownership child (addressable) |
| `dm_profiles` | DM public profile + review status | 1:1 |
| `member_follows` | Member → member follow edge | pure M:N |
| `dm_requests` | Quest/seat request lifecycle to a DM | workflow |
| `unlockables` | Cosmetic unlock catalog entries | catalog |
| `member_unlocks` | Granted unlockables with source | enriched association |
| `notifications` | Per-member inbox; optional polymorphic subject | root-ish / polymorphic subject |

## documents

| Table | Purpose | Pattern |
| --- | --- | --- |
| `documents` | Codex / rules / briefs / community content | root |
| `document_revisions` | Snapshot history of document content | revisions |
| `document_links` | Typed edges between documents | enriched association |
| `document_readers` | Restricted visibility allow-list | pure M:N |
| `lieutenant_assignments` | Member duty over an NPC document | assignment |

## spatial

Axial integers; no PostGIS in product model ([design.md](design.md)).

| Table | Purpose | Pattern |
| --- | --- | --- |
| `regions` | Server / archon / uncharted region | root |
| `maps` | Named atlas map (hexgrid or pointcrawl) | root |
| `hexes` | Axial cell on a map (`col`/`row`) | root (map child) |
| `pois` | Point of interest on a hex | ownership child (addressable) |
| `hex_edges` | Same-map undirected edge graph | root-ish (keeps `public_id`) |
| `hex_entry_links` | Hex ↔ document relations | enriched association |
| `hex_changes` | Hex mutation history | events (legacy `*_changes`) |
| `archon_assignments` | Member duty over a region | assignment |
| `time_anchors` | Real UTC ↔ epoch-day rate anchors | root (time) |
| `game_calendar` | Singleton calendar definition JSON | infra (singleton) |
| `game_time_map` | Real date → game day lookup | infra |

## characters

| Table | Purpose | Pattern |
| --- | --- | --- |
| `backstories` | Shared backstory / cohort lore | catalog-ish root |
| `creation_catalog` | Species / class / background codes | catalog |
| `characters` | Player character; `player_xp` is cache | root |
| `character_ddb_mirrors` | Cached D&D Beyond payload | 1:1 |
| `character_progression_ledger` | Append-only XP deltas (truth) | ledger |
| `downtime_projects` | Character downtime goals | ownership child (addressable) |
| `verifications` | Approve/reject for polymorphic subjects | polymorphic / workflow |
| `character_logs` | Session notes; optional quest link | ownership child (addressable) |

`character_logs` is created after quests in DDL so `quest_id` can `ON DELETE SET NULL`.

## quests

| Table | Purpose | Pattern |
| --- | --- | --- |
| `quest_arcs` | Multi-quest arc container | root |
| `quests` | Scheduled table / signup board row | root |
| `quest_participants` | Signup lifecycle (status, character) | enriched association |
| `quest_hexes` | Expected / visited hex roles | enriched association |
| `quest_regions` | Quest ↔ region coverage | pure M:N |

## jobs and site

| Table | Purpose | Pattern |
| --- | --- | --- |
| `background_jobs` | Worker queue (lane, state, payload) | jobs |
| `idempotency_keys` | Dedup keys per endpoint + actor | infra |
| `agent_questions` | Human/agent Q tied 1:1 to a job | jobs / 1:1-to-job |
| `discord_activity_events` | Ingested Discord activity facts | events (external PK) |
| `bot_heartbeats` | Bot liveness payloads | infra |
| `site_settings` | Keyed site config / pinned documents | infra |
