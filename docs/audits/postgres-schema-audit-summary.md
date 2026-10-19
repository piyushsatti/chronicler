# Postgres audit — executive map

**Detailed findings:** [postgres-schema-audit.md](postgres-schema-audit.md)

This page is navigation only. Each theme links to the section that holds evidence and tables.

---

## Themes at a glance

### Schema authority lives in goose migrations

Four migrations define the live database: baseline (`0001`), quest display view (`0002`), product GraphQL DDL (`0003`), and document link ordering (`0004`). Narrative docs and graphql-product migration notes must track those files, not the other way around.

→ [Schema authority and migration timeline](postgres-schema-audit.md#schema-authority-and-migration-timeline)

### ~45 tables group into six product domains

Members, documents, spatial, characters, quests, and jobs/site/ingest share dual-key and pattern conventions documented in [tables.md](../../apps/api/db/docs/tables.md).

→ [Table inventory by domain](postgres-schema-audit.md#table-inventory-by-domain)

### Two sqlc stacks share one dbgen package

Legacy `*.sql` files power **today’s** wired API via [wire.go](../../apps/api/internal/app/wire.go). Parallel `*_product.sql` files target declared product GraphQL; most adapters are stubs or test-only except member (and partial character/site).

→ [Query layer map](postgres-schema-audit.md#query-layer-map) · [Dual-stack analysis](postgres-schema-audit.md#dual-stack-analysis)

### Product SQL is ahead of runtime wiring

Large generated surfaces (`spatial_product`, `quest_product`, `document_product`, …) are exercised heavily in `product_sql_integration_test.go` but not bound in production. [product_uow.go](../../apps/api/internal/app/product_uow.go) remains unimplemented.

→ [Dual-stack analysis](postgres-schema-audit.md#dual-stack-analysis) · [Risks and gaps](postgres-schema-audit.md#risks-and-gaps)

### Seeds prove breadth, not behavior

`qa.jsonl` covers all application tables; endpoint review documents repair and acceptance. That does not substitute for per-operation or product-SQL coverage.

→ [Seeds, fixtures, and QA](postgres-schema-audit.md#seeds-fixtures-and-qa)

### Documentation and baselines are partially stale

Endpoint review predates migrations 0003/0004; `schema-v2.md` is vocabulary, not DDL.

→ [Doc drift and stale references](postgres-schema-audit.md#doc-drift-and-stale-references)

---

## What needs attention

| Priority | Topic                             | Why                                                                             | Detail                                                               |
| -------- | --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **P0**   | Dual-stack on shared tables       | Legacy and product SQL can diverge on quests, documents, notifications, spatial | [Dual-stack analysis](postgres-schema-audit.md#dual-stack-analysis)  |
| **P0**   | Production still on legacy wiring | Product GraphQL DDL exists; UoW stub                                            | [Query layer map](postgres-schema-audit.md#query-layer-map)          |
| **P1**   | Member product partial coverage   | Some `member_product` queries have no Go caller yet                             | [Query layer map](postgres-schema-audit.md#query-layer-map)          |
| **P1**   | Refresh endpoint-review baseline  | Migration count and product work moved since 2026-10-13                         | [Doc drift](postgres-schema-audit.md#doc-drift-and-stale-references) |
| **P2**   | Unused legacy sqlc queries        | Dead code vs planned use unclear                                                | [Query layer map](postgres-schema-audit.md#query-layer-map)          |
| **P2**   | Observations adapter stub         | Schema + sqlc without runtime consumer                                          | [Risks and gaps](postgres-schema-audit.md#risks-and-gaps)            |

---

## Related audit

Contracts / GraphQL surface (split SDL, codegen, consumers): [interface-contract-audit-summary.md](interface-contract-audit-summary.md)
