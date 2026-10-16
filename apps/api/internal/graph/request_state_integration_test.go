package graph

// G04 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Request-scoped authority memoization/singleflight and explicit post-commit invalidation; no identity-only fallback or DB request lock.
// Dependencies: P05, G02.
// Acceptance: TASK-G04, AUTH-shared, BATCH-shared. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/G04.json.
