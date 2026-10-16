package document

// DOC04 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Bind sqlc/pgx SQL and exact row mapping; expose owning aggregate Writers; no commit; declare/implement StoreSummary and FindAvailableSlug; exact typed-link publicUUID mapping via exclusivearc and single author_id D5 lookup.
// Dependencies: DOC03, ROOT-GEN-SQL.
// Acceptance: TASK-DOC04, AUTH-document, BATCH-document. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/DOC04.json.
