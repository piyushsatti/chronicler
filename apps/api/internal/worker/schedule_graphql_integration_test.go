package worker

// WK01 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Exact scheduled-slot registry/idempotent admission/error propagation; no replaypurge.
// Dependencies: P04, J01, WK03.
// Acceptance: TASK-WK01, AUTH-shared, BATCH-shared. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/WK01.json.
