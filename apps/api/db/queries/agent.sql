-- name: InsertQuestionJob :execrows
INSERT INTO background_jobs(public_id,job_key,kind,lane,state,payload,question_deadline_at)
VALUES(sqlc.arg(job_id)::uuid,'agent:'||sqlc.arg(job_id)::uuid::text,'agent_question','agent','queued',sqlc.arg(payload),clock_timestamp()+interval '100 seconds')
ON CONFLICT(public_id) DO NOTHING;

-- name: InsertAgentQuestion :exec
INSERT INTO agent_questions(job_id,question,history) VALUES($1,$2,$3);

-- name: GetAgentQuestion :one
SELECT b.id,b.public_id AS job_id,aq.question,aq.history,b.question_deadline_at,
 CASE WHEN b.state='succeeded' THEN 'answered' WHEN b.state IN ('dead','repair_required','cancelled') THEN 'failed'
 WHEN b.state='running' THEN 'claimed' ELSE 'queued' END::text AS state,aq.result
FROM agent_questions aq JOIN background_jobs b ON b.id=aq.job_id WHERE b.public_id=sqlc.arg(job_id);

-- name: PruneFinishedAgentQuestions :exec
WITH doomed AS (
  SELECT background_jobs.id FROM background_jobs
  WHERE background_jobs.kind='agent_question'
    AND background_jobs.state IN ('succeeded','dead','repair_required','cancelled')
    AND background_jobs.updated_at < sqlc.arg(cutoff)
  ORDER BY background_jobs.updated_at,background_jobs.id
  FOR UPDATE OF background_jobs SKIP LOCKED
  LIMIT sqlc.arg(batch_limit)::int
), deleted_questions AS (
  DELETE FROM agent_questions WHERE job_id IN (SELECT id FROM doomed)
)
DELETE FROM background_jobs WHERE id IN (SELECT id FROM doomed);
