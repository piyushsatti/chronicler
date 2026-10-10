-- name: UpsertAgentQuestion :exec
INSERT INTO agent_questions (job_id, question, history, state)
SELECT b.id, sqlc.arg(question), sqlc.arg(history), 'queued'
FROM background_jobs b
WHERE b.public_id = sqlc.arg(job_id)
ON CONFLICT (job_id) DO NOTHING;

-- name: GetAgentQuestion :one
SELECT b.public_id AS job_id, aq.question, aq.history, aq.state, aq.result
FROM agent_questions aq
JOIN background_jobs b ON b.id = aq.job_id
WHERE b.public_id = sqlc.arg(job_id);

-- name: CompleteAgentQuestion :exec
UPDATE agent_questions
SET state = 'completed', result = sqlc.arg(result), updated_at = now()
WHERE job_id = (SELECT b.id FROM background_jobs b WHERE b.public_id = sqlc.arg(job_id));
