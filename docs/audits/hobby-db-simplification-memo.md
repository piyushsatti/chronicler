# Postgres schema — hobby simplification memo

**Status:** research snapshot (2026-10-18)  
**Audience:** Owner  
**Stance:** Low-traffic hobby TTRPG campaign tool, not enterprise scale.

**Scope:** [0001_init.sql](../../apps/api/db/migrations/0001_init.sql) (and 0002–0004), [tables.md](../../apps/api/db/docs/tables.md), [design.md](../../apps/api/db/docs/design.md), [D42](../../apps/api/docs/decisions/D42-Worker-And-Migrations.md), [endpoint-review](../../apps/api/docs/endpoint-review.md). Related: [postgres-schema-audit.md](postgres-schema-audit.md).

---

## Evidence snapshot

| Source | Fact |
|--------|------|
| Goose migrations | 4 files: `0001_init` (~45 tables), `0002` (view), `0003_product_graphql` (+24 tables), `0004` (summary link order) |
| Postgres extensions in DDL | Only `pgcrypto` |
| endpoint-review | QA seed targets **45** tables; baseline still cites **two** migrations — stale vs four files today |
| Runtime | Legacy `*.sql` wired; product `*_product.sql` assumes 0003+; product UoW stub |
| SCHEMA-HISTORY-01 | Do not rewrite goose history without reconciliation ([D44](../../apps/api/docs/decisions/D44-Leased-Work-With-Fencing.md), [background-work](../../apps/api/docs/background-work.md)) |

---

## 1. Single migration (squash 0001–0004)

**Feasibility:** Yes for true greenfield; risky if any DB has partial goose history.

[D42](../../apps/api/docs/decisions/D42-Worker-And-Migrations.md) assumes Postgres starts fresh. Squashing into one `0001_init.sql` matches a **wipe-all-dev-DBs** hobby policy.

**Pros:** One `goose up`; end-state DDL once; easier QA/docs; no 0002→0003 view replace story.

**Cons:** Cannot upgrade in-place DBs that applied old files; 0003 preflight/data steps become **end-state DDL only** (correct for empty DB); lose bisect history; tests asserting migration count need updates.

**Preserve in squashed init (substance, not 0003 procedure):** typed `document_links` + `summary_append_order`; normalized `member_settings`; post-purge `unlockables` model (or drop — see §4); `quest_display_status_at()`; idempotency PK + receipts **if** kept; pointcrawl **only if** not hex-only.

**Owner decision:** Squash now on wipe policy, or keep four files until product cutover is proven?

---

## 2. Table census (summary)

**45** tables in 0001; **+24** in 0003 → **~69** + `quest_display_status` view.

Legend: **KEEP** / **MERGE** / **DROP CANDIDATE** (hobby).

| Domain | KEEP examples | DROP / MERGE candidates (hobby) |
|--------|---------------|----------------------------------|
| Members | `members`, `notifications` | `member_follows`, `role_changes`, unlock tables, `notification_events` pipeline, audit tables from 0003 |
| Documents | `documents`, `document_links`, `document_readers` | `document_revisions` (MERGE if no codex history); `lieutenant_assignments` (MERGE) |
| Spatial | regions, maps, hexes, edges, entry links, pois | `hex_changes`, pointcrawl (0003), `game_time_map`, history tables |
| Characters | `characters`, progression ledger | `character_changes`, DDB attempts, heavy verification chain |
| Quests | arcs, quests, participants | `quest_changes`, reward entitlements/decisions (MERGE to ledger) |
| Jobs / site | `background_jobs`, `site_settings` | `job_redrives`, ingest facts, `operational_observations`, setting change history |

**Rough targets:** ~35–45 tables if dropping history/pointcrawl/cosmetics; ~25–30 if aggressive merge.

Full row-level census: expand from [tables.md](../../apps/api/db/docs/tables.md) and migration 0003 DDL.

---

## 3. Extensions and queues

| Tech | In repo today | Hobby recommendation |
|------|---------------|----------------------|
| **PostGIS** | Not in migrations; axial hex in [design.md](../../apps/api/db/docs/design.md) | **Reject** unless real-world geo overlays |
| **PGMQ** | Legacy Python semantics only; Go uses **`background_jobs`** | **Stay on `background_jobs`** + `SKIP LOCKED` |
| **pgvector** | Not in Postgres; agent uses LanceDB | N/A for API DB |
| **pgcrypto** | In 0001 | **Keep** |

---

## 4. Simplification themes

1. **One SQL stack** — legacy *or* product per domain; not both at hobby scale.
2. **Drop `*_changes` / audit event tables** unless staff compliance matters; keep `document_revisions` if codex versioning is core.
3. **Notifications:** inbox rows only; skip event + delivery ledger.
4. **Unlockables:** drop; use static config or code gates.
5. **Hex-only maps;** drop pointcrawl unless dungeon crawl is in scope.
6. **`agent_questions`:** keep separate (D42/D43) or merge into job payload (owner tradeoff).
7. **Idempotency:** narrow to agent + destructive paths; skip GraphQL receipt trigger if low traffic.
8. **Quest rewards:** ledger XP only; drop entitlements/decisions tables.
9. **Dual-key `id` + `public_id`:** keep — low cost, good boundary hygiene.

---

## 5. ASCII target hierarchy (hobby)

```
campaign (site)
├── site_settings
├── game_calendar (+ optional time_anchors; no game_time_map)
members
├── members, member_settings, dm_profiles [optional], member_availability [optional]
documents
├── documents, document_revisions [optional], document_links, document_readers
spatial (hex-only)
├── regions, maps, hexes, hex_edges, hex_entry_links, pois
characters
├── characters, character_progression_ledger, downtime_projects, character_logs, verifications
├── creation_catalog [or static], character_ddb_mirrors [optional]
quests
├── quest_arcs [optional], quests, quest_participants, quest_hexes/regions [optional]
work
├── background_jobs, agent_questions [or merged], idempotency_keys [narrow]
notifications
└── notifications (inbox only)
```

**Absent in target:** pointcrawl, most `*_changes`, unlockables, reward entitlements/decisions, ingest/ops/audit tables, notification event pipeline.

---

## Owner decisions

| # | Question | Hobby default |
|---|----------|---------------|
| A | Wipe + single init vs keep migration history | Wipe dev + single init |
| B | Product GraphQL DDL vs legacy mounted API | Pick one surface |
| C | Hex-only vs pointcrawl | Hex-only |
| D | Notification events vs inbox | Inbox only |
| E | Quest PCXP entitlements | Ledger only |
| F | Social / DM marketplace tables | Simplify or drop |
| G | DDB depth | Mirror optional |
| H | Separate `agent_questions` | Keep (D42) |
| I | GraphQL idempotency receipts | Minimal |
| J | Document revisions | Keep if codex is core |

---

## Bottom line

No PostGIS/PGMQ/pgvector in Postgres today. Complexity clusters in **0003 product cutover** while QA/review still describe **45 tables**. Squashing 0001–0004 is straightforward on **empty** databases: embed end-state DDL, **drop** history/pointcrawl/cosmetics/ops tables unless you commit to the full product GraphQL surface.
