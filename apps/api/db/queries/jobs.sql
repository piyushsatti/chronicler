-- name: EnqueueJob :exec
INSERT INTO background_jobs (job_key,kind,lane,state,payload,next_run_at)
VALUES ($1,$2,$3,'queued',$4,clock_timestamp())
ON CONFLICT(job_key) DO UPDATE SET state='queued',payload=EXCLUDED.payload,attempts=0,error_message=NULL,safe_error_code=NULL,
 next_run_at=clock_timestamp(),updated_at=clock_timestamp(),completion_operation=NULL,completion_payload=NULL
WHERE background_jobs.state<>'running' AND background_jobs.kind<>'agent_question';

-- name: LockClaimableJob :one
SELECT * FROM background_jobs
WHERE lane=$1 AND ((state IN ('queued','retry_wait') AND next_run_at<=clock_timestamp()) OR (state='running' AND lease_expires_at<=clock_timestamp()))
ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 1;

-- name: LockJob :one
SELECT * FROM background_jobs WHERE id=$1 FOR UPDATE;

-- name: LockPublicJob :one
SELECT * FROM background_jobs WHERE public_id=$1 FOR UPDATE;

-- name: JobClock :one
SELECT clock_timestamp()::timestamptz AS now;

-- name: SaveLeasedJob :execrows
UPDATE background_jobs SET state=sqlc.arg(state),attempts=sqlc.arg(attempts),lease_token=sqlc.arg(lease_token),
 lease_expires_at=sqlc.narg(lease_expires_at),claimed_at=sqlc.narg(claimed_at),attempt_deadline_at=sqlc.narg(attempt_deadline_at),
 next_run_at=sqlc.arg(next_run_at),completion_operation=sqlc.narg(completion_operation),completion_payload=sqlc.narg(completion_payload),
 error_message=sqlc.narg(error_message),safe_error_code=sqlc.narg(safe_error_code),updated_at=sqlc.arg(updated_at)
WHERE id=sqlc.arg(id);

-- name: LockExpiredQuestion :one
SELECT * FROM background_jobs WHERE kind='agent_question' AND state IN ('queued','running','retry_wait')
 AND question_deadline_at<=clock_timestamp() ORDER BY question_deadline_at,id FOR UPDATE SKIP LOCKED LIMIT 1;

-- name: ProjectQuestionResult :execrows
UPDATE agent_questions SET result=$2,updated_at=clock_timestamp() WHERE job_id=$1;

-- name: EnqueueScheduledJob :execrows
INSERT INTO background_jobs (job_key,kind,lane,state,payload,next_run_at)
VALUES ($1,$2,$3,'queued',$4,clock_timestamp())
ON CONFLICT(job_key) DO NOTHING;
