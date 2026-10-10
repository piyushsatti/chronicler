# Contracts design — why

Shared GraphQL and REST surface for web, Discord, and the Go API. Prefer this over reconstructing intent from generated code.

## Why a package

Clients and the API must share one contract. Putting SDL and OpenAPI here means:

- Web and Discord generate from the same files the Go API implements.
- Reviewers argue about the wire shape once, not per app.
- The Go handlers are generated *from* this package — they are not the source.

Interface rule: [graphql-schema](../../../docs/interfaces/graphql-schema.md).

## Source-of-truth order

| Layer | Location | Role |
| --- | --- | --- |
| 1. Split SDL | `graphql/*.graphql` | Edit here. One file per slice + `scalars.graphql` + `roots.graphql`. |
| 2. Merge | `scripts/merge-graphql-schema` → `schema.graphql` | Committed artifact for codegen and `bun run check-schema`. |
| 3. REST | `openapi.yaml` | Commands, fixed lookups, auth/ingest under `/v1` (and a few non-`/v1` machine routes). |
| 4. Routing map | `field-routing.md` | Old GraphQL field → GQL / REST / DROP. Must stay in sync with SDL + OpenAPI ([D40](../../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md)). |

Do not hand-edit `schema.graphql` for product changes — change the split files and re-merge.

## Consumers

| Consumer | How |
| --- | --- |
| `apps/web` | GraphQL codegen / types from `@pi/contracts` |
| `apps/discord` | Same package; ingest/auth via OpenAPI paths |
| `apps/api` (Go) | gqlgen + OpenAPI-driven handlers generated from these files |

Local notes: `apps/web/README.md`, `apps/discord/docs/`, `apps/api/README.md`.

## How to evolve

1. Decide transport with [D40](../../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) (tree → GraphQL; command / fixed shape → REST; alias / empty → DROP).
2. Edit the matching `graphql/*.graphql` slice and/or `openapi.yaml`.
3. Update `field-routing.md` in the same change.
4. Run `scripts/merge-graphql-schema` (or `bun run export-schema`) and keep `schema.graphql` committed.
5. Regenerate client/API artifacts (`bun run --filter @pi/contracts build` and the Go generate path).

Version lives in the URL path (`/v1/...`), not in type or field name suffixes — see [patterns.md](patterns.md).

## Pointers

| Doc | Use when |
| --- | --- |
| [D40](../../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) | Choosing GraphQL vs REST vs DROP |
| [field-routing.md](../field-routing.md) | Mapping a legacy field or reviewing a PR |
| [graphql-schema](../../../docs/interfaces/graphql-schema.md) | Interface ownership and CI drift check |
| [patterns.md](patterns.md) | Naming, `ID`, versioning conventions |
