# Postgres schema and usage audit

**Status:** research snapshot (2026-10-18)  
**Scope:** `apps/api/db/` migrations, sqlc queries, dbgen consumers, seeds/fixtures  
**Out of scope:** Live production database introspection; full endpoint behavioral review ([endpoint-review.md](../../apps/api/docs/endpoint-review.md) owns that baseline)

## Scope and method

This audit answers:

1. What Postgres objects exist and how they group by product domain.
2. How the API reads and writes them today (legacy sqlc stack vs product `*_product.sql`).
3. Where documentation, migrations, and runtime wiring disagree (multi-generation drift).

**Evidence used:** squashed goose migration [0001_init.sql](../../apps/api/db/migrations/0001_init.sql) (**A1**; former 0002–0004 deltas folded in), [tables.md](../../apps/api/db/docs/tables.md), every file under `apps/api/db/queries/`, generated code in [dbgen/db.go](../../apps/api/internal/platform/dbgen/db.go), Go importers (`internal/*/postgres.go`, `product_postgres.go`, [wire.go](../../apps/api/internal/app/wire.go)), and [product_uow.go](../../apps/api/internal/app/product_uow.go).

**Not claimed:** That every sqlc query has integration coverage, or that QA seed load on a shared DB is safe without disposable Postgres.

---

## Schema authority and migration timeline

| Authority                       | Location                                                                                         | Role                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Executable DDL                  | [0001_init.sql](../../apps/api/db/migrations/0001_init.sql) (squashed **A1**)                    | Single goose file is production schema authority                  |
| Narrative inventory             | [db/docs/tables.md](../../apps/api/db/docs/tables.md)                                            | Domain-grouped table list aligned to `0001_init.sql` banners      |
| Vocabulary reference            | [schema-v2.md](../../apps/api/docs/schema-v2.md)                                                 | Label/check vocabulary from the port; **not** a second DDL source |
| Product GraphQL physical design | [design/graphql-product/migrations.md](../../apps/api/docs/design/graphql-product/migrations.md) | Acceptance expectations; must match or explain gaps vs goose      |

### Migration summary

| Migration       | File                                                        | What it does                                                                                                                                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 (squashed) | [0001_init.sql](../../apps/api/db/migrations/0001_init.sql) | End-state hobby schema after **A1**: dual-key rows, pointcrawl-only spatial (**C3**), inbox notifications, product idempotency receipts, typed `document_links` (including `summary_append_order`), `quest_display_status_at()` display wrapper, `quest_pointcrawl_nodes` (**N5B**), no legacy hex grid or dropped N1–N8 tables. |

**Former incremental files (removed at squash, cited here for research continuity only):** `0002_quest_display_status.sql` (display view), `0003_product_graphql.sql` (pre-cutover product DDL), `0004_summary_append_order.sql` (summary link ordering). Do not link them as live paths; [migrations.md](../../apps/api/docs/design/graphql-product/migrations.md) owns the target inventory narrative.

**Pattern choices** (see [db/docs/design.md](../../apps/api/db/docs/design.md)): TEXT + CHECK for evolving labels; axial integers instead of PostGIS; API uses `public_id` on the wire, not bigint `id`.

---

## Table inventory by domain

Full row-level inventory: [tables.md](../../apps/api/db/docs/tables.md). Summary by bounded context:

### Members and actor

Core identity: `members`, `member_settings`, `member_availability`, `dm_profiles`, social graph (`member_follows`, `dm_requests`, `request_decisions`), unlock catalog (`unlockables`, `member_unlocks`), `role_changes`, `notifications` (+ post-0003 `notification_events`). Legacy audit tables use `*_changes` naming in places.

### Documents

`documents`, `document_revisions`, `document_links` (legacy document-only edges; **0003+ typed targets** for quest/character/region), `document_readers`, `lieutenant_assignments`.

### Spatial

Regions, maps, hex grid (`hexes`, `hex_edges`, `hex_entry_links`, `hex_changes`), POIs, archon assignments, game calendar/time map, **pointcrawl** tables added in 0003 for product spatial SQL.

### Characters

`characters`, progression ledger (source of truth for XP), DDB mirror, downtime, verifications, catalogs (`creation_catalog`, `backstories`).

### Quests

`quests`, arcs, participants, hex/region associations, reward decisions/entitlements, `quest_changes` history (0003).

### Jobs, site, ingest

`background_jobs`, `agent_questions`, idempotency (endpoint-scoped keys), `site_settings` + history, Discord ingest (`discord_activity_events`, `bot_heartbeats`), `operational_observations`.

---

## Query layer map

**Codegen:** [sqlc.yaml](../../apps/api/sqlc.yaml) compiles **all** `db/queries/*.sql` into a **single** [dbgen.Queries](../../apps/api/internal/platform/dbgen/db.go) type — legacy and product are separated by **source file**, not by Go package.

### Legacy stack (production wiring today)

| SQL file                                                         | Generated              | Primary Go consumers                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [agent.sql](../../apps/api/db/queries/agent.sql)                 | `agent.sql.go`         | [internal/agent/postgres.go](../../apps/api/internal/agent/postgres.go)                                                                                                                                                                                |
| [characters.sql](../../apps/api/db/queries/characters.sql)       | `characters.sql.go`    | [internal/character/postgres.go](../../apps/api/internal/character/postgres.go)                                                                                                                                                                        |
| [documents.sql](../../apps/api/db/queries/documents.sql)         | `documents.sql.go`     | [internal/document/postgres.go](../../apps/api/internal/document/postgres.go)                                                                                                                                                                          |
| [ingest.sql](../../apps/api/db/queries/ingest.sql)               | `ingest.sql.go`        | [internal/ingest/postgres.go](../../apps/api/internal/ingest/postgres.go)                                                                                                                                                                              |
| [jobs.sql](../../apps/api/db/queries/jobs.sql)                   | `jobs.sql.go`          | [internal/platform/jobs/postgres.go](../../apps/api/internal/platform/jobs/postgres.go), agent locks                                                                                                                                                   |
| [members.sql](../../apps/api/db/queries/members.sql)             | `members.sql.go`       | [internal/member/postgres.go](../../apps/api/internal/member/postgres.go), [worker/maintenance.go](../../apps/api/internal/worker/maintenance.go)                                                                                                      |
| [notifications.sql](../../apps/api/db/queries/notifications.sql) | `notifications.sql.go` | [internal/notification/postgres.go](../../apps/api/internal/notification/postgres.go)                                                                                                                                                                  |
| _(removed at **A1** / **N8**)_                                   | —                      | `observations.sql` and `operational_observations` dropped from [0001_init.sql](../../apps/api/db/migrations/0001_init.sql); operator visibility via `background_jobs` per [work-contract](../../apps/api/docs/design/graphql-product/work-contract.md) |
| [quests.sql](../../apps/api/db/queries/quests.sql)               | `quests.sql.go`        | [internal/quest/postgres.go](../../apps/api/internal/quest/postgres.go), [delivery/postgres_revision.go](../../apps/api/internal/delivery/postgres_revision.go)                                                                                        |
| [spatial.sql](../../apps/api/db/queries/spatial.sql)             | `spatial.sql.go`       | [internal/spatial/postgres.go](../../apps/api/internal/spatial/postgres.go), worker calendar maintenance                                                                                                                                               |
| [site.sql](../../apps/api/db/queries/site.sql)                   | `site.sql.go`          | [internal/site/postgres.go](../../apps/api/internal/site/postgres.go) (member count); `GetSiteSetting` unused                                                                                                                                          |

**Central wiring:** [internal/app/wire.go](../../apps/api/internal/app/wire.go) binds **legacy** repositories for the mounted GraphQL/REST API. [product_uow.go](../../apps/api/internal/app/product_uow.go) is a **stub** — product GraphQL UoW is not production-bound yet.

### Product stack (`*_product.sql`)

| SQL file                                                                       | Approx. scale     | Runtime adapter                                                                                   | Notes                                                                                                    |
| ------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [member_product.sql](../../apps/api/db/queries/member_product.sql)             | ~48 named queries | [member/product_postgres.go](../../apps/api/internal/member/product_postgres.go)                  | Furthest along: reads + many writes; some SQL only in dbgen (e.g. community directory, DM review append) |
| [character_product.sql](../../apps/api/db/queries/character_product.sql)       | ~41 queries       | [character/product_postgres.go](../../apps/api/internal/character/product_postgres.go)            | **Reads only** in adapter; writes covered by integration tests                                           |
| [site_product.sql](../../apps/api/db/queries/site_product.sql)                 | 7 queries         | [site/product_postgres.go](../../apps/api/internal/site/product_postgres.go)                      | **Two reads** (`SiteCommunitySnapshot`, `SiteMemberDiscovery`); settings writes test-only                |
| [document_product.sql](../../apps/api/db/queries/document_product.sql)         | ~31 queries       | [document/product_postgres.go](../../apps/api/internal/document/product_postgres.go) stub         | SQL validated in `product_sql_integration_test.go`                                                       |
| [quest_product.sql](../../apps/api/db/queries/quest_product.sql)               | ~44 queries       | [quest/product_postgres.go](../../apps/api/internal/quest/product_postgres.go) stub               | Test-only                                                                                                |
| [spatial_product.sql](../../apps/api/db/queries/spatial_product.sql)           | ~67 queries       | [spatial/product_postgres.go](../../apps/api/internal/spatial/product_postgres.go) stub           | Legacy [spatial/postgres.go](../../apps/api/internal/spatial/postgres.go) still serves live map reads    |
| [notification_product.sql](../../apps/api/db/queries/notification_product.sql) | 7 queries         | [notification/product_postgres.go](../../apps/api/internal/notification/product_postgres.go) stub | Event-backed model vs legacy row notifications                                                           |

Product repositories also carry **phase-3 declaration tests** (`product_repository_phase3_test.go`, `product_types.go`) that lock GraphQL DTO shapes to Go — parallel to sqlc, not a replacement.

---

## Dual-stack analysis

### What “v1 vs v2” means in the database

| Generation                 | SQL                 | Schema emphasis                                                                          | API binding                                    |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Legacy / mounted API       | `*.sql` (no suffix) | Pre–product GraphQL shapes; simpler notification rows; narrower spatial reads            | [wire.go](../../apps/api/internal/app/wire.go) |
| Product / declared GraphQL | `*_product.sql`     | 0003+ history tables, typed links, pointcrawl, notification events, idempotency receipts | Mostly integration tests + partial adapters    |

Both stacks compile into **one** `dbgen.Queries`. There is no compile-time enforcement that legacy and product queries stay mutually consistent on shared tables.

### Shared tables, divergent access patterns

1. **Quests** — Legacy [quests.sql](../../apps/api/db/queries/quests.sql) uses `quest_display_status` / view; product [quest_product.sql](../../apps/api/db/queries/quest_product.sql) adds board paging, arcs, rewards, history via `quest_changes`.
2. **Documents** — Legacy links are document-centric; product SQL assumes **typed `document_links`** from 0003/0004 (including `summary_append_order`).
3. **Notifications** — Legacy [notifications.sql](../../apps/api/db/queries/notifications.sql) counts/marks rows; product [notification_product.sql](../../apps/api/db/queries/notification_product.sql) joins `notification_events` and subject proof tables.
4. **Spatial** — Legacy [spatial.sql](../../apps/api/db/queries/spatial.sql) (~36 SQL clauses) vs product [spatial_product.sql](../../apps/api/db/queries/spatial_product.sql) (~367 clauses) including pointcrawl mutations.

### Double-writer and cutover risk

Until product UoW replaces legacy wiring, **only one stack should mutate a given invariant** per transaction boundary. Today production mutations still flow through legacy repos for most domains; product write SQL exists but often runs only in tests. Risk rises when:

- GraphQL resolvers begin calling product adapters on tables still read through legacy mappers (inconsistent projections).
- Both stacks write the same row without shared specifications (e.g. notification read state vs event ledger).

**Owner decision (not resolved here):** cutover order per domain and whether legacy sql files are deleted or frozen read-only.

---

## Seeds, fixtures, and QA

| Asset               | Path                                               | Role                                                                                                                       |
| ------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Local dev seed      | [seed/local.sql](../../apps/api/db/seed/local.sql) | Small hand seed (seven tables cited in endpoint review)                                                                    |
| QA generator output | [seed/qa.jsonl](../../apps/api/db/seed/qa.jsonl)   | 637 insert specs across 45 tables; repaired 2026-10-13/14 per [endpoint-review.md](../../apps/api/docs/endpoint-review.md) |
| Integration harness | `dbtest` + Docker Postgres                         | Applies migrations + seed; not a schema authority                                                                          |

QA seed proves **table coverage**, not endpoint or product-SQL completeness. Loader uses `ON CONFLICT DO NOTHING` — not a full reset semantics.

---

## Doc drift and stale references

| Reference                                                                                 | Issue                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [endpoint-review.md](../../apps/api/docs/endpoint-review.md) migration count              | Baseline dated 2026-10-13 cites two migrations; repo now has **four** (0003 product, 0004 summary order). Reconcile baseline JSON when refreshing review. |
| [schema-v2.md](../../apps/api/docs/schema-v2.md)                                          | Vocabulary doc; easy to confuse with live goose DDL.                                                                                                      |
| graphql-product [migrations.md](../../apps/api/docs/design/graphql-product/migrations.md) | Acceptance spec; audit diff against 0003/0004 when changing either side.                                                                                  |
| Historical Python/Alembic                                                                 | Mentioned in endpoint review as **non-authoritative** for Go schema.                                                                                      |

---

## Risks and gaps

1. **Implementation lag** — Product SQL + dbgen generated ahead of `product_postgres.go` for document, quest, spatial, notification domains.
2. **Single dbgen namespace** — Easy to call the wrong generation’s query against the same table without code review discipline.
3. **Unused legacy queries** — e.g. `CountQuestParticipants`, some spatial list/count helpers — dead or future use unclear.
4. **Observations** — Schema + sqlc exist; runtime adapter stub.
5. **Idempotency** — 0003 constraints + product command design; legacy paths may not uniformly enforce replay keys.
6. **Endpoint review staleness** — Mounted API assessment predates latest squash merge; rerun when claiming production readiness.

---

## Recommendations

Themes for owner prioritization (implementation not included in this audit):

1. **Publish a cutover matrix** — Domain × (legacy R/W, product R/W, GraphQL root status, migration done).
2. **Freeze legacy write paths** per domain as product adapters land; delete duplicate SQL only after resolver + test proof.
3. **Refresh endpoint-review baseline** after migration count and product wiring changes.
4. **Disposable DB policy** — Keep QA load and integration tests off shared `DATABASE_URL` chains (already documented in endpoint review; enforce in runbooks).
5. **Align graphql-product migration doc** with goose 0003/0004 or record explicit deltas.

---

## Cross-links

- Interface / GraphQL contract audit: [packages/contracts/docs/audits/interface-contract-audit.md](interface-contract-audit.md)
- API coverage baseline: [endpoint-review.md](../../apps/api/docs/endpoint-review.md)
- Table patterns: [db/docs/patterns.md](../../apps/api/db/docs/patterns.md)
