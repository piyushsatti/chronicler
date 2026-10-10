-- name: CreateAgentQuestion :exec
WITH inserted_job AS (
    INSERT INTO background_jobs (public_id, job_key, kind, lane, state, payload)
    VALUES (
        sqlc.arg(job_id),
        'agent:' || sqlc.arg(job_id)::text,
        'agent_question',
        'agent',
        'queued',
        '{}'::jsonb
    )
    ON CONFLICT (public_id) DO NOTHING
    RETURNING id
),
job_row AS (
    SELECT id FROM inserted_job
    UNION ALL
    SELECT id FROM background_jobs WHERE public_id = sqlc.arg(job_id)
    LIMIT 1
)
INSERT INTO agent_questions (job_id, question, history, state)
SELECT job_row.id, sqlc.arg(question), sqlc.arg(history), 'queued'
FROM job_row
ON CONFLICT (job_id) DO NOTHING;

-- name: GetAgentQuestion :one
SELECT b.public_id AS job_id, aq.question, aq.history, aq.state, aq.result
FROM agent_questions aq
JOIN background_jobs b ON b.id = aq.job_id
WHERE b.public_id = sqlc.arg(job_id);

-- name: ClaimAgentQuestion :one
WITH next AS (
    SELECT aq.id
    FROM agent_questions aq
    WHERE aq.state = 'queued'
    ORDER BY aq.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE agent_questions aq
SET state = 'claimed', updated_at = now()
FROM next
WHERE aq.id = next.id
RETURNING
    (SELECT b.public_id FROM background_jobs b WHERE b.id = aq.job_id) AS job_id,
    aq.question,
    aq.history;

-- name: CompleteAgentQuestion :exec
UPDATE agent_questions
SET state = sqlc.arg(state),
    result = sqlc.arg(result),
    updated_at = now()
WHERE job_id = (SELECT b.id FROM background_jobs b WHERE b.public_id = sqlc.arg(job_id))
  AND state IN ('queued', 'claimed');
