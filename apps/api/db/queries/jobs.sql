-- name: EnqueueJob :exec
INSERT INTO background_jobs (job_key, kind, lane, state, payload, next_run_at)
VALUES ($1, $2, $3, 'queued', $4, now())
ON CONFLICT (job_key) DO UPDATE
SET state = 'queued',
    payload = EXCLUDED.payload,
    attempts = 0,
    error_message = NULL,
    next_run_at = now(),
    updated_at = now()
WHERE background_jobs.state <> 'running';

-- name: ClaimJob :one
UPDATE background_jobs AS j
SET state = 'running', attempts = j.attempts + 1, updated_at = now()
WHERE j.id = (
    SELECT b.id FROM background_jobs AS b
    WHERE b.lane = $1 AND b.state IN ('queued', 'retry_wait') AND b.next_run_at <= now()
    ORDER BY b.next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING j.id, j.job_key, j.kind, j.lane, j.state, j.attempts, j.payload, j.next_run_at;

-- name: SucceedJob :exec
UPDATE background_jobs SET state = 'succeeded', updated_at = now() WHERE id = $1;

-- name: RetryJob :exec
UPDATE background_jobs
SET state = 'retry_wait', next_run_at = $2, error_message = $3, updated_at = now()
WHERE id = $1;

-- name: FailJob :exec
UPDATE background_jobs
SET state = $2, error_message = $3, updated_at = now()
WHERE id = $1;
