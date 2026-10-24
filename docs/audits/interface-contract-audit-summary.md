# Interface / contracts audit — executive map

**Detailed findings:** [interface-contract-audit.md](interface-contract-audit.md)

Navigation only — themes link to evidence sections in the detailed audit.

---

## Themes at a glance

### Three layers: split SDL, merged schema, generated TS

You edit domain SDL under [packages/contracts/graphql/](../../packages/contracts/graphql/) (for example [member/types.graphql](../../packages/contracts/graphql/member/types.graphql)). [scripts/merge-graphql-schema](../../scripts/merge-graphql-schema) produces [schema.graphql](../../packages/contracts/schema.graphql). [codegen.ts](../../packages/contracts/codegen.ts) emits one `graphql.ts` at `src/generated/graphql.ts`, an ignored artifact absent from a clean checkout. Go gqlgen reads the same recursive split files.

→ [Authority layers](interface-contract-audit.md#authority-layers) · [Merge and codegen pipeline](interface-contract-audit.md#merge-and-codegen-pipeline)

### File naming is domain + operations, not one file per domain

Types live in `<domain>/types.graphql`; operations in `<domain>/operations.graphql`. Query/Mutation **roots** are declared in [_roots.graphql](../../packages/contracts/graphql/_roots.graphql); domains **extend** Query/Mutation. [commands.graphql](../../packages/contracts/graphql/commands.graphql) holds shared inputs only.

→ [GraphQL SDL layout](interface-contract-audit.md#graphql-sdl-layout)

### `graphql.ts` monolith is a tooling default, not a domain requirement

Single graphql-codegen target explains the large file. Splitting is possible (multi-file codegen or operations-near-adapters) but needs an owner choice — especially because web adapters do not import it today.

→ [TypeScript consumer surface](interface-contract-audit.md#typescript-consumer-surface)

### `V2` type suffixes mark product model debt

Many declared types (`QuestV2Type`, `HomeV2Type`, …) differ from legacy mapper shapes. HTTP versioning stays on `/v1`; suffixes are GraphQL naming debt to reconcile.

→ [GraphQL SDL layout](interface-contract-audit.md#graphql-sdl-layout) · [Naming and export inconsistencies](interface-contract-audit.md#naming-and-export-inconsistencies)

### Root file naming (M1)

Authoritative roots: [_roots.graphql](../../packages/contracts/graphql/_roots.graphql). Older docs and baseline JSON may still mention `roots.graphql` or `member-operations.graphql` as root owners — reconcile when touching endpoint review.

→ [Authority layers](interface-contract-audit.md#authority-layers)

### Clients barely use `@pi/contracts` generated types

Web uses inline GraphQL strings + adapters; Discord tests OpenAPI for ingest. Package exports exist for schema sharing more than runtime TS coupling.

→ [TypeScript consumer surface](interface-contract-audit.md#typescript-consumer-surface)

### v1 mounted API vs v2 declared contract

Full SDL + field-routing describe the target; OpenAPI + partial resolvers + legacy SQL implement a smaller slice. Endpoint review quantifies gaps.

→ [REST, OpenAPI, and field routing](interface-contract-audit.md#rest-openapi-and-field-routing) · [Multi-generation tech debt](interface-contract-audit.md#multi-generation-tech-debt)

---

## What needs attention

| Priority | Topic                                  | Why                                                     | Detail                                                                                         |
| -------- | -------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **P0**   | SDL vs implementation gap              | Large declared API; many roots stubbed or legacy-mapped | [Multi-generation tech debt](interface-contract-audit.md#multi-generation-tech-debt)           |
| **P0**   | `roots.graphql` drift                  | Docs/tests out of sync with repo layout                 | [Authority layers](interface-contract-audit.md#authority-layers)                               |
| **P1**   | field-routing / OpenAPI / SDL triangle | Three lists must move together on every wire change     | [REST, OpenAPI, and field routing](interface-contract-audit.md#rest-openapi-and-field-routing) |
| **P1**   | Web not on generated types             | Schema can drift from adapter query strings             | [TypeScript consumer surface](interface-contract-audit.md#typescript-consumer-surface)         |
| **P2**   | `V2` suffix policy                     | Cleaner names vs breaking rename                        | [Naming inconsistencies](interface-contract-audit.md#naming-and-export-inconsistencies)        |
| **P2**   | Split or keep monolithic `graphql.ts`  | DX vs build complexity                                  | [TypeScript consumer surface](interface-contract-audit.md#typescript-consumer-surface)         |

---

## Related audit

Postgres schema, dual sqlc stack, migration timeline: [postgres-schema-audit-summary.md](postgres-schema-audit-summary.md)
