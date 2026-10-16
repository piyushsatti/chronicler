package worker

// WK02 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Authoritative TimeFillWriter/consistencyChecker, noUnixguess/unknownkindsuccess; remove purge_idempotency registration and dispatch plus every PurgeIdempotencyKeys caller/import; orphan jobs fail UNKNOWN_MAINTENANCE_KIND without business deletion; exclusively own WORK-RECEIPT-RETENTION in maintenance_graphql_integration_test.go after SQL retirement and regeneration.
// Dependencies: WK03, J01, SPA06, DB01, WK05, WK01, LEGQ-REPLAY-PURGE.
// Acceptance: TASK-WK02, AUTH-shared, BATCH-shared. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/WK02.json.
