# Contracts

Shared GraphQL and REST contracts for web, Discord, and the Go API.

Design rationale and wire patterns: [`docs/`](docs/) — start at [`docs/README.md`](docs/README.md).

## Layout

| Path                | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| [`docs/`](docs/)    | Why / patterns (teachable notes)                            |
| `graphql/`          | Source SDL: domain `types`/`operations`, `_roots.graphql`, shared scalars/commands |
| `schema.graphql`    | Merged SDL (`scripts/merge-graphql-schema`) for web codegen |
| `openapi.yaml`      | REST routes under `/v1` and auth/ingest                     |
| `field-routing.md`  | Old field → GraphQL / REST / DROP map                       |
| `codegen.ts`        | GraphQL codegen for TypeScript clients                      |
| `src/generated/`    | Generated client types                                      |
| `package.json`      | Workspace package `@pi/contracts`                           |

## Commands

```bash
scripts/merge-graphql-schema   # refresh schema.graphql from graphql/
bun run --filter @pi/contracts build
```

The Go API is generated from these files. It is not the source of the contract.

The split SDL is the accepted product contract. Recursive discovery is validated before the root-controlled aggregate is replaced. [Consumer breaking changes](/packages/contracts/docs/product-cutover.md) and [field routing](/packages/contracts/field-routing.md) describe the planned cutover; publication does not implement the backend or migrate frontend adapters.
