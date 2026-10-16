package main

// S04 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Mounted action/readback/sql history+notification rollback/replay/concurrency/retire proof; load/embed only ROOT-PUBLISH-FIXTURES versioned testdata JSON, never ignored plans/builders in CI/runtime; exact hash/reference closure.
// Dependencies: S03, ROOT-PUBLISH-FIXTURES.
// Acceptance: TASK-S04, AUTH-shared, BATCH-shared. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/S04.json.
