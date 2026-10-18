# Bulk reads and performant CRUD — memo

**Status:** research snapshot (2026-10-18)  
**Scope:** GraphQL contracts, [graphql-product performance](../../apps/api/docs/design/graphql-product/performance.md), resolvers, product SQL, [endpoint-review](../../apps/api/docs/endpoint-review.md).

Related: [interface-contract-audit.md](interface-contract-audit.md), [postgres-schema-audit.md](postgres-schema-audit.md).

---

## 1. Current state (intent vs runtime)

| Layer | Status |
| ----- | ------ |
| **Contracts** | Root lists use `*ListResult { items, total }` with `limit`/`offset`; shared `*Page` in [product-reads.graphql](../../packages/contracts/graphql/product-reads.graphql); notifications use keyset `NotificationConnection`; batch command `setMemberRolesBatch` |
| **Design docs** | DataLoader, chunk ≤100, offset+total, complexity/depth caps — [performance.md](../../apps/api/docs/design/graphql-product/performance.md), [behavior.md](../../apps/api/docs/design/graphql-product/behavior.md) |
| **G02 loaders** | [product_loaders.go](../../apps/api/internal/graph/product_loaders.go) **stub** |
| **Product resolvers** | `*-operations.resolvers.go` largely **stub** |
| **Legacy resolvers** | Roots call `Services.*.List`; nested fields often **N+1** (`Get`/`ByID` per row) |
| **sqlc product SQL** | Batch/list queries exist (e.g. `ProductQuestBatchRead`, `ProductBatchMembers`) |
| **Product postgres** | **Member** batch reads implemented; quest/document batch on interfaces, limited impl |
| **Transport** | Product via **POST `/v1/graphql`**; no HTTP GraphQL batching |

Endpoint review: ignored filters on quest board/members; page-length used as totals in places; phase-two pagination/perf **not certified**.

---

## 2. Named patterns (use these)

| Pattern | Rule |
| ------- | ---- |
| **Request-scoped DataLoader** | One registry per request; dedupe keys; **≤100 keys/chunk**; one set SQL per entity family |
| **List + total** | Root lists: filtered SQL + count (or CTE); default limit 50, max 100; reject invalid args |
| **Keyset** | **Notifications only** (`before` cursor) — not generic lists without ADR |
| **Batch mutation** | e.g. `setMemberRolesBatch`: **one transaction**, all-or-nothing |
| **CQRS** | Reads → `ProductQueries` / batch SQL; writes → `ProductCommands` + one UoW tx per command |
| **Session per task** | No shared tx across concurrent resolver goroutines; flush loaders after self-affecting mutations |

---

## 3. Hobby-scale rules (performant bulk)

1. One GraphQL request per screen tree — no REST fan-out for the same graph.
2. Root lists always return **items + total**; apply SDL filters in SQL.
3. Nested fields on lists → **loaders → ReadBatch* → sqlc unnest/ANY**, never per-row `Get`.
4. Pagination args are part of the **loader cache key** (e.g. quest id + participant status + limit + offset).
5. Enforce depth/complexity/response size before DB ([performance.md](../../apps/api/docs/design/graphql-product/performance.md)).
6. Quest UI: bounded `questBoard` / `quests(limit:50)`; use `questStateCounts` for dashboards.
7. Bulk role changes: **`setMemberRolesBatch` only** (≤100); other “bulk” = separate idempotent commands.

---

## 4. Request path (target)

```
Client → POST /v1/graphql
      → transport validate (depth, cost, no DB)
      → authority snapshot (P07)
      → LoaderRegistry on context (G02)
      → root List* (1–2 SQL: rows + total)
      → nested fields → DataLoader → ReadBatch* → sqlc batch
      → map to GraphQL → JSON (≤2MiB)
```

**Today:** nested path often skips loaders → N+1 despite batch SQL existing.

---

## 5. Anti-patterns (forbid)

- `Get`/`ByID` inside list iteration in resolvers.
- Legacy `BatchLoader` that loops single-row queries.
- Unbounded lists or ignored filter/sort args.
- Page length reported as `total`.
- REST fan-out mirroring one GraphQL tree.
- Partial commit on atomic batch mutations.

---

## 6. Follow-up for implementation

1. Wire **G02** + product resolvers to existing **member/quest/document** batch SQL.
2. Deprecate new nested fields without loader + `ReadBatch*`.
3. Align **DefaultLimits()** with design caps (complexity/depth).
4. Reconcile endpoint-review filter gaps with QUE07/MEM07 acceptance.
5. SQL-counter tests for Homepage / NestedQuests before claiming perf met.

---

## Owner decision

**Convergence:** product GraphQL path becomes the **only** mounted read/write path for campaign data, with loaders mandatory for any field that appears on list rows — matches contract refactor and single DB stack from [hobby-db-simplification-memo.md](hobby-db-simplification-memo.md).
