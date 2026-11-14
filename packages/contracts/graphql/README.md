# GraphQL contract layout (M1)

Domain folders under this directory are the **authoritative** split SDL. `scripts/merge-graphql-schema` and gqlgen discover every `**/*.graphql` file recursively (sorted by relative path), validate the combined schema, and write `packages/contracts/schema.graphql`.

## Layout

| Path                          | Role                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_roots.graphql`              | Sole `type Query` / `type Mutation` declarations. Deprecated layout placeholders keep empty roots valid; all product fields live on `extend type Query` / `extend type Mutation` in domain operation files. |
| `<domain>/types.graphql`      | Object types, inputs, enums, and unions for that bounded context. No root types or scalars.                                                                                                                 |
| `<domain>/operations.graphql` | `extend type Query` and `extend type Mutation` only (plus domain-local command inputs when not shared).                                                                                                     |
| `scalars.graphql`             | Shared scalars                                                                                                                                                                                              |
| `commands.graphql`            | Shared command inputs, `CommandMeta`, receipts                                                                                                                                                              |
| `product-reads.graphql`       | Shared connection/page result types used across domains                                                                                                                                                     |

Domains: `member/`, `document/`, `quest/`, `spatial/`, `character/`, `site/`, `notification/`.

## Editing workflow

1. Change the domain `types.graphql` and/or `operations.graphql` (or shared flat files above).
2. Run `bash scripts/merge-graphql-schema` from the repo root.
3. Run `bun run --filter @pi/contracts build` (codegen + TypeScript check).
4. Regenerate Go gqlgen when API resolvers are in scope (`apps/api`).

Do not reintroduce duplicate flat copies such as `member.graphql` at this directory root.

For **new** fields, follow [Conventions for new fields](../../../docs/interfaces/graphql-schema.md#conventions-for-new-fields): closed sets are enums; paged lists use `<Thing>ListResult` with `items`/`total`. Existing fields stay as-is.

## Spatial / pointcrawl (C3)

The `spatial/` domain declares **pointcrawl** map SDL only. Hex-grid types, map-view helpers, and hex mutations were removed at M1 per owner decision **C3** (details in `PHASE2-NOTES.md`). Quest ↔ map linkage uses pointcrawl junction fields per **N5** (`setQuestPointcrawlLinks`, `Quest.pointcrawlLinks`).

## Codegen

TypeScript codegen still emits one `src/generated/graphql.ts` from merged `schema.graphql`. Per-domain TS modules are out of scope for M1.

Audit: [interface-contract-audit.md](../../../docs/audits/interface-contract-audit.md). Locked decisions: [owner-decisions.md](../../../docs/audits/owner-decisions.md) (**M1**, **C3**).
