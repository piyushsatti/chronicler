-- name: InsertQuestionJob :exec
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
