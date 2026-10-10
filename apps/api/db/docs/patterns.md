# Schema patterns

Locked conventions from `0001_init.sql`. New tables should pick a row from this menu, not invent a fourth junction style.

## Naming

| Pattern | Convention | Examples |
| --- | --- | --- |
| Aggregate root | Plural domain noun | `members`, `quests`, `hexes`, `documents` |
| Pure M:N | `{left}_{right}` | `member_follows`, `member_unlocks`, `quest_regions` |
| Role / duty M:N | `*_assignments` | `lieutenant_assignments`, `archon_assignments` |
| 1:1 extension | `{root}_{facet}`; PK = parent FK | `member_settings`, `dm_profiles`, `character_ddb_mirrors` |
| Ledger | `*_ledger` | `character_progression_ledger` |
| Domain events | `*_events` | `discord_activity_events` |
| Content snapshots | `*_revisions` | `document_revisions` |
| Catalog / code table | `*_catalog` (not a root) | `creation_catalog` |
| Workflow entity | Domain noun (not a junction) | `dm_requests`, `verifications`, `notifications` |
| Jobs / infra | Clear operational noun | `background_jobs`, `idempotency_keys` |

**History suffix:** prefer `*_events` for **new** history tables. Legacy `role_changes` / `hex_changes` keep `*_changes` unless renamed in a dedicated migration.

## Pattern catalog

### Root

Addressable aggregate. Has `id` + `public_id`. Owns children and nested joins. API nests under this noun.

### Pure M:N

Edge only: two (or more) FKs + optional timestamps. **Composite PK, no surrogate, no `public_id`.** Nested under an owning root in the API; never fetched by UUID.

Examples: `member_follows`, `document_readers`, `quest_regions`.

### Enriched association

M:N (or ownership join) with lifecycle / role columns. Still **composite PK, no `public_id`** when nested under the root.

Examples: `quest_participants` (status), `quest_hexes` (role), `member_unlocks` (source), `document_links` / `hex_entry_links` (relation).

### Role / duty assignment

Same shape as pure M:N; name signals duty (`*_assignments`). Composite PK.

### 1:1 extension

Facet of a root. **PK = parent FK**, `ON DELETE CASCADE`, **no `public_id`**. Loaded with the parent; not a separate URL resource.

### Ledger / events / revisions

Append-oriented history. Usually has own `id` + `public_id` when rows are addressable or cited in audit APIs.

| Kind | Intent |
| --- | --- |
| Ledger | Numeric / delta truth (`character_progression_ledger`) — shape shared, table per domain ([D16](../../docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md)) |
| Events | Domain or ingest facts (`discord_activity_events`; PK may be external `event_id`) |
| Revisions | Full content snapshots (`document_revisions`) |
| Changes (legacy) | Same family as events; keep suffix until migrated |

Do **not** collapse into one polymorphic `audit_events` blob table — typed FKs and per-domain read gating stay ([D16](../../docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md)).

### Catalog

Reference / code data. May have `public_id` for admin or client lookups; not an aggregate root. Lookups only in the Go boundary sense ([D26](../../docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md)).

### Jobs / infra

Operational tables: queues, idempotency, heartbeats, singleton config (`game_calendar`, `site_settings`). `public_id` only when the API addresses the row (jobs, agent questions).

### Polymorphic

`subject_type` + `subject_id` (bigint) without a single-parent FK. Used sparingly when the subject spans roots (`verifications`, notification `subject_*`). Placement is member-owned or infra, not “child of every possible subject”.

### Workflow entity

Looks like a join but has its own lifecycle (status, resolution). Gets `id` + `public_id`. Example: `dm_requests` — not a junction.

## When `public_id` applies

| Has `public_id`? | When |
| --- | --- |
| Yes | Independently addressable from HTTP/GraphQL (roots, workflow entities, many ledgers/events/revisions, jobs clients can poll). |
| No | Pure / enriched nested joins (composite PK); 1:1 facets; infra keyed by natural keys (`idempotency_keys`, `site_settings.key`, `game_time_map.real_date`). |

Edge case: `hex_edges` keeps `public_id` while edges may remain API-addressable — do not drop without a product decision that edges are never fetched by UUID (see comment in `0001_init.sql`).

## Junction keys (summary)

1. FKs always reference bigint `id` (never `public_id`).
2. Independently addressable join rows → may carry `id` + `public_id`.
3. Pure / enriched nested joins → composite PK only; nest under the owning root in the API.
