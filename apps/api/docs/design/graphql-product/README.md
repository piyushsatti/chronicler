# Product GraphQL design

Pattern: modular monolith, CQRS, unit of work, specification, transactional outbox and request-scoped DataLoader. These accepted contracts define the planned Go backend. Split SDL and configuration are published; new source placeholders contain package declarations and comments only. Runtime migration and behavior remain unimplemented until their owning tests pass. Existing useful code stays in place until its scheduled replacement.

The [GraphQL interface](/docs/interfaces/graphql-schema.md) owns the shared schema boundary. The [transport interface](/docs/interfaces/graphql-product-transport.md) owns the request envelope and retained protocol split. [Contract publication](/apps/api/docs/graphql-contract.md) distinguishes source discovery from generated/executable/runtime acceptance.

## Exact declarations

- [go-seams.json](/apps/api/docs/design/graphql-product/go-seams.json) is the single exact Go declaration/provider/caller inventory. [interfaces.json](/apps/api/docs/design/graphql-product/interfaces.json) specifies all root service methods. These are declarations for implementation, not generated Go.
- [Behavior](/apps/api/docs/design/graphql-product/behavior.md), [interfaces](/apps/api/docs/design/graphql-product/interfaces.md), [transport](/apps/api/docs/design/graphql-product/transport-contract.md) and [performance](/apps/api/docs/design/graphql-product/performance.md) define authority, failures, transaction effects, batching and bounded execution.
- [Migrations](/apps/api/docs/design/graphql-product/migrations.md), [Document storage](/apps/api/docs/design/graphql-product/document-storage-contract.md), [settings storage](/apps/api/docs/design/graphql-product/settings-storage-contract.md) and [unlock storage](/apps/api/docs/design/graphql-product/unlock-catalog-storage-contract.md) define physical changes. Actual migrations remain the executable schema authority.
- [Generation order](/apps/api/docs/design/graphql-product/generation-order-contract.md) and [fixture publication](/apps/api/docs/design/graphql-product/fixture-publication-contract.md) define source prerequisites and the versioned acceptance source boundary. The native disposable migration tests run before downstream repositories rely on the schema.

## Acceptance sources

Reviewed concrete inputs live in apps/api/cmd/api/testdata/product with their original basenames. P04/S03/S04 load those versioned sources, never ignored planning files or Python builders. The physical inventory and storage map are acceptance expectations. They do not replace actual migration DDL. Full readbacks, capture declarations, replay chains and exact positive/negative/rollback cases are embedded in the owning JSON files. A necessary fixture change reopens dependent review.

Temporary per-file task status, command receipts, handoffs and acceptance execution records remain in the local implementation run. They are not another product-rule authority or runtime dependency. No frontend migration, production deployment or T230 design-gap resolution is included.
