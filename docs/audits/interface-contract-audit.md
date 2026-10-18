# Interface and contracts audit

**Status:** research snapshot (2026-10-18)  
**Scope:** `packages/contracts/`, GraphQL/OpenAPI consumers, API gqlgen binding, product GraphQL declarations  
**Out of scope:** Implementing cutover, regenerating all artifacts, frontend adapter migration

## Scope and method

This audit answers:

1. Why contracts appear in **many GraphQL files**, one **merged schema**, and one **monolithic `graphql.ts`**.
2. Where **v1 (mounted REST + legacy resolvers)** and **v2 (declared product GraphQL)** overlap or contradict.
3. Whether a **cleaner layout** is feasible without forking authority.

**Evidence:** split SDL under [packages/contracts/graphql/](../../packages/contracts/graphql/) (M1 domain layout; see [graphql/README.md](../../packages/contracts/graphql/README.md)), [schema.graphql](../../packages/contracts/schema.graphql), [codegen.ts](../../packages/contracts/codegen.ts), [openapi.yaml](../../packages/contracts/openapi.yaml), [field-routing.md](../../packages/contracts/field-routing.md), [apps/api/gqlgen.yml](../../apps/api/gqlgen.yml), [endpoint-review.md](../../apps/api/docs/endpoint-review.md), [design/graphql-product/README.md](../../apps/api/docs/design/graphql-product/README.md), import scans in `apps/web` and `apps/discord`.

---

## Authority layers

| Layer | Path | Human-edited? | Role |
| ----- | ---- | ------------- | ---- |
| Split SDL | [graphql/**](../../packages/contracts/graphql/) | **Yes** | Authoritative product GraphQL source (recursive discovery; M1 domain folders) |
| Merged SDL | [schema.graphql](../../packages/contracts/schema.graphql) | **No** | Committed merge for TS codegen + drift checks |
| TS types | [src/generated/graphql.ts](../../packages/contracts/src/generated/graphql.ts) | **No** | `@graphql-codegen/typescript` single output |
| Package export | [src/index.ts](../../packages/contracts/src/index.ts) | Minimal | Re-exports all generated types |
| REST | [openapi.yaml](../../packages/contracts/openapi.yaml) | **Yes** | Machine routes + GraphQL transport POST |
| Routing map | [field-routing.md](../../packages/contracts/field-routing.md) | **Yes** | Legacy REST operation → GraphQL / HTTP / DROP |
| Go executable schema | [apps/api/internal/graph/generated.go](../../apps/api/internal/graph/generated.go) | Generated + hand resolvers | Implements **subset** of declared roots today |
| Product declarations | [go-seams.json](../../apps/api/docs/design/graphql-product/go-seams.json), phase-3 `product_types.go` | **Yes** (design) | Planned backend; not fully wired |

**Interface rule:** [docs/interfaces/graphql-schema.md](../interfaces/graphql-schema.md) — one SDL under `packages/contracts/graphql`; clients must not fork schema.

**M1 update (2026-10-18):** Roots live in [_roots.graphql](../../packages/contracts/graphql/_roots.graphql); domain `*/operations.graphql` extend Query/Mutation. [endpoint-review-baseline.json](../../apps/api/docs/endpoint-review-baseline.json) may still fingerprint legacy flat paths until refreshed.

---

## GraphQL SDL layout

**Pre-M1 snapshot:** sixteen flat `*.graphql` files at the repo root of `graphql/`. **M1 layout:** seven domain directories (`member/`, `document/`, …) each with `types.graphql` and `operations.graphql`, plus [_roots.graphql](../../packages/contracts/graphql/_roots.graphql), [product-reads.graphql](../../packages/contracts/graphql/product-reads.graphql), [commands.graphql](../../packages/contracts/graphql/commands.graphql), [scalars.graphql](../../packages/contracts/graphql/scalars.graphql).

**Root definition rule (M1):** Only `_roots.graphql` declares `type Query` and `type Mutation`. Domain operation files **extend** those roots. Merge order is **lexicographic path sort** (see merge script).

### “V2” in type names

Many declared types use a **`V2` suffix** (e.g. `QuestV2Type`, `HomeV2Type`, `SiteStatsV2Type` in [site/types.graphql](../../packages/contracts/graphql/site/types.graphql), [document/types.graphql](../../packages/contracts/graphql/document/types.graphql)). This marks the **product GraphQL model** vs older wire shapes still implied by legacy API mappers — not URL `/v2` versioning ([patterns.md](../../packages/contracts/docs/patterns.md): version in path `/v1`, not in field suffixes is the rule for HTTP; GraphQL type suffixes are a separate legacy naming debt). **C3:** hex-grid spatial SDL was removed from [spatial/types.graphql](../../packages/contracts/graphql/spatial/types.graphql) at M1.

---

## Merge and codegen pipeline

```
graphql/*.graphql  ──►  scripts/merge-graphql-schema  ──►  schema.graphql (committed)
                              │
                              ▼
                        validateSchema(parse + merge)
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
  codegen.ts (TS)                          gqlgen (Go)
         │                                         │
         ▼                                         ▼
src/generated/graphql.ts                  internal/graph/generated.go
         │                                         │
         ▼                                         ▼
@pi/contracts dist                         resolvers + legacy services
```

Merge script behavior ([scripts/merge-graphql-schema](../../scripts/merge-graphql-schema)): recursive `*.graphql` discovery, sorted paths, per-file `# --- path ---` banner, **refuses symlinks**, validates full schema before write.

**Do not hand-edit** [schema.graphql](../../packages/contracts/schema.graphql) for product changes — edit split files and re-run merge ([design.md](../../packages/contracts/docs/design.md)).

---

## TypeScript consumer surface

[codegen.ts](../../packages/contracts/codegen.ts) configures **one** output file:

```typescript
'./src/generated/graphql.ts': { plugins: ['typescript'], ... }
```

Result: ~2,884 lines, all `export type` / enums in one module ([package.json](../../packages/contracts/package.json) exports only `./dist` + schema + regions — not per-domain subpaths).

### Must `graphql.ts` stay monolithic?

| Option | Description | Tradeoffs |
| ------ | ----------- | --------- |
| **A. Status quo** | Single codegen target | Simple build; large diffs; editors choke on one file; matches one schema |
| **B. Multi-file codegen** | Multiple `generates` entries (e.g. per domain slice) | Smaller files; must avoid duplicate type names; needs `import type` graph or `preset: import-types` |
| **C. Re-export barrels only** | Still one codegen run, post-process split (custom script) | Extra maintenance; not standard codegen |
| **D. Consumers use schema + operations codegen** | `typescript-operations` near adapters | Better for web than dumping full schema types; more moving parts |

**Observation:** [apps/web](../../apps/web) feature adapters use **`graphqlRequest` with inline query strings** and **Zod** (or hand types) — they do **not** import `@pi/contracts` generated types today (grep shows no `@pi/contracts` in `apps/web/src`). The monolith primarily serves **potential** shared typing and package `dist` — not current web runtime.

[apps/discord](../../apps/discord) depends on workspace `@pi/contracts` in package.json but **runtime validation** cited in tests loads [openapi.yaml](../../packages/contracts/openapi.yaml) directly for ingest ([ingest.test.ts](../../apps/discord/tests/unit/interface/ingest.test.ts)).

---

## REST, OpenAPI, and field routing

[openapi.yaml](../../packages/contracts/openapi.yaml) declares machine protocols: ingest, agent questions, **POST /v1/graphql** transport, health, etc. Product reads/commands are **not** duplicated as 164 REST routes — cutover intent is documented in [product-cutover.md](../../packages/contracts/docs/product-cutover.md) and [D40](../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md).

[field-routing.md](../../packages/contracts/field-routing.md) maps **legacy REST operation identities** (123+) to GraphQL field names, retained HTTP, or DROP. [endpoint-review.md](../../apps/api/docs/endpoint-review.md) records that many routed operations were **not mounted** at the 2026-10-13 baseline while OpenAPI listed a smaller mounted set.

**Drift triangle:** split SDL declares broad product API → field-routing accepts breaking map → executable API + OpenAPI still reflect **partial** implementation.

---

## Naming and export inconsistencies

1. **GraphQL type `V2` suffix** vs documented preference against version suffixes on wire ([patterns.md](../../packages/contracts/docs/patterns.md) — HTTP `/v1` is the version carrier).
2. **`roots.graphql` documentation** vs `member-operations.graphql` + extensions reality.
3. **Package description** says “region config”; exports include `schema.graphql`, `regions.json`, not GraphQL operations types as secondary entrypoints.
4. **Go product types** (`product_types.go`, repository phase-3 tests) mirror contract JSON — third naming surface alongside gqlgen models and SDL.
5. **check-schema / aggregate drift** — [graphql-schema interface](../interfaces/graphql-schema.md) notes pending controlled regeneration for aggregate parity enforcement.

---

## Multi-generation tech debt

| Generation | Artifacts | Runtime today |
| ---------- | --------- | --------------- |
| Legacy GraphQL roots | gqlgen schema from split SDL; resolvers in [internal/graph/](../../apps/api/internal/graph/generated.go) | Mounted; 12+ hard-coded empty roots per endpoint review |
| Legacy REST | OpenAPI subset + mux tests | Partial CRUD; some no-ops |
| Product GraphQL declaration | Full split SDL + field-routing + go-seams | SQL/product repos mostly **ahead** of resolvers |
| Client adapters | Web inline GraphQL + Zod | Not on generated `@pi/contracts` types |

This explains “no clarity across generations”: **authority is unified in split SDL**, but **consumers and backend implement different slices**.

---

## Risks

1. **False confidence from large SDL** — Declared fields exceed tested resolver + SQL behavior.
2. **Monolithic TS diff noise** — Any SDL change rewrites entire `graphql.ts` if clients adopt it later.
3. **Doc references to missing `roots.graphql`** — Contract tests may fail or mislead until updated.
4. **field-routing vs OpenAPI vs SDL** — Three lists to keep aligned on every change ([design.md](../../packages/contracts/docs/design.md) step 3).
5. **Web not on generated types** — Schema can drift from adapter strings without codegen failure in web CI.

---

## Recommendations

Owner decisions flagged where convergence is required:

1. **Retire `roots.graphql` references** — Update docs, contract tests, baseline fingerprints to “member-operations owns roots” or reintroduce a thin `roots.graphql` that only re-exports (explicit decision).
2. **V2 type rename policy** — Plan systematic rename to domain names without suffix when breaking change is acceptable, or document `V2` as permanent product namespace.
3. **Choose client typing strategy** — (a) adopt `@pi/contracts` in web with operations codegen near adapters, or (b) formally declare adapters as authority and slim package exports to schema-only.
4. **If splitting `graphql.ts`** — Prefer graphql-codegen multi-output with shared `schema.graphql` input; pilot one domain (e.g. `member`) before full split.
5. **Regeneration gate** — Finish `check-schema` + GraphQL contract tests in CI per interface doc before next cutover phase.
6. **Single cutover checklist** — Link field-routing OP ids → SDL field → sqlc product query → resolver method (cross-link [postgres audit](postgres-schema-audit.md)).

---

## Cross-links

- Postgres usage and dual sqlc stack: [postgres-schema-audit.md](postgres-schema-audit.md)
- Transport rule: [D40](../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md)
- API coverage: [endpoint-review.md](../../apps/api/docs/endpoint-review.md)
