-- name: InsertLifecycleObservation :execrows
INSERT INTO operational_observations (key, observed_at, state, payload)
SELECT 'job:' || j.public_id::text || ':token:' || j.lease_token::text || ':event:' || (sqlc.arg(fact)::jsonb->>'EventKind'),
       sqlc.arg(observed_at)::timestamptz, j.state, sqlc.arg(fact)::jsonb
FROM background_jobs j
WHERE j.public_id = (sqlc.arg(fact)::jsonb->>'JobID')::uuid
  AND j.job_key = sqlc.arg(fact)::jsonb->>'JobKey'
  AND j.kind = sqlc.arg(fact)::jsonb->>'Kind'
  AND j.state = sqlc.arg(fact)::jsonb->>'State'
  AND j.lease_token = (sqlc.arg(fact)::jsonb->>'LeaseToken')::bigint
  AND j.attempts = (sqlc.arg(fact)::jsonb->>'Attempt')::integer
  AND sqlc.arg(fact)::jsonb->>'EventKind' IN ('ENQUEUED','CLAIMED','RETRY_SCHEDULED','SUCCEEDED','FAILED','CANCELLED','EFFECT_ADMITTED')
ON CONFLICT (key) DO NOTHING;

-- name: GetOperationalObservation :one
SELECT key, observed_at, state, payload
FROM operational_observations
WHERE key = sqlc.arg(key)::text;

-- name: InsertConditionObservation :execrows
INSERT INTO operational_observations (key, observed_at, state, payload)
SELECT 'condition:' || (sqlc.arg(transition)::jsonb->>'Key') || ':version:' || (sqlc.arg(transition)::jsonb->>'Version'),
       (sqlc.arg(transition)::jsonb->>'ObservedAt')::timestamptz,
       sqlc.arg(transition)::jsonb->>'State', sqlc.arg(transition)::jsonb
WHERE sqlc.arg(transition)::jsonb->>'State' IN ('OPEN','RESOLVED')
  AND (sqlc.arg(transition)::jsonb->>'Version')::bigint > 0
ON CONFLICT (key) DO NOTHING;

-- name: CurrentConditionObservation :one
SELECT key, observed_at, state, payload
FROM operational_observations
WHERE payload->>'Key' = sqlc.arg(condition_key)::text
  AND key = 'condition:' || sqlc.arg(condition_key)::text || ':version:' || (payload->>'Version')
ORDER BY (payload->>'Version')::bigint DESC
LIMIT 1;

-- name: ListScheduledObservationOutcomes :many
WITH slots AS (
    SELECT (value->>'kind')::text AS kind, (value->>'slot')::timestamptz AS slot,
           (value->>'deadline')::timestamptz AS deadline
    FROM jsonb_array_elements(sqlc.arg(slots)::jsonb)
)
SELECT s.kind, s.slot AS expected_slot,
       CASE f.state WHEN 'running' THEN 'RUNNING' WHEN 'succeeded' THEN 'SUCCEEDED'
            WHEN 'retry_wait' THEN 'FAILED' WHEN 'repair_required' THEN 'FAILED'
            WHEN 'dead' THEN 'FAILED' WHEN 'cancelled' THEN 'FAILED' ELSE 'NEVER_RAN' END::text AS outcome,
       (f.payload->>'StartedAt')::timestamptz AS last_started_at,
       (f.payload->>'FinishedAt')::timestamptz AS last_finished_at,
       j.public_id AS job_id, f.payload->>'SafeErrorCode' AS safe_error_code
FROM slots s
LEFT JOIN background_jobs j ON j.kind = s.kind
 AND j.job_key = 'maintenance:' || s.kind || ':' || to_char(s.slot AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
LEFT JOIN LATERAL (
    SELECT o.state, o.payload
    FROM operational_observations o
    WHERE o.key = 'job:' || j.public_id::text || ':token:' || (o.payload->>'LeaseToken') || ':event:' || (o.payload->>'EventKind')
      AND o.payload->>'JobID' = j.public_id::text
      AND o.payload->>'JobKey' = j.job_key AND o.payload->>'Kind' = j.kind
      AND (o.payload->>'Slot')::timestamptz = s.slot
      AND o.payload->>'StartedAt' IS NOT NULL
    ORDER BY (o.payload->>'LeaseToken')::bigint DESC, o.observed_at DESC, o.id DESC
    LIMIT 1
) f ON true
ORDER BY s.kind, s.slot;

-- name: ListOverdueScheduledObservations :many
WITH slots AS (
    SELECT (value->>'kind')::text AS kind, (value->>'slot')::timestamptz AS slot,
           (value->>'deadline')::timestamptz AS deadline
    FROM jsonb_array_elements(sqlc.arg(slots)::jsonb)
)
SELECT s.kind, s.slot AS expected_slot, s.deadline
FROM slots s
WHERE sqlc.arg(now)::timestamptz >= s.deadline
  AND NOT EXISTS (
    SELECT 1 FROM operational_observations o
    JOIN background_jobs j ON j.public_id::text = o.payload->>'JobID'
    WHERE o.key = 'job:' || j.public_id::text || ':token:' || (o.payload->>'LeaseToken') || ':event:SUCCEEDED'
      AND o.state = 'succeeded' AND o.payload->>'EventKind' = 'SUCCEEDED'
      AND o.payload->>'JobKey' = j.job_key AND o.payload->>'Kind' = s.kind
      AND j.job_key = 'maintenance:' || s.kind || ':' || to_char(s.slot AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      AND (o.payload->>'Slot')::timestamptz = s.slot
      AND o.payload->>'FinishedAt' IS NOT NULL
  )
ORDER BY s.kind, s.slot;

-- name: ListTerminalWorkObservations :many
SELECT j.public_id, j.kind, j.state, j.safe_error_code
FROM background_jobs j
WHERE j.state IN ('repair_required','dead') AND j.kind <> 'operator_alert'
ORDER BY j.id;

-- name: HasUnhealthyOperatorAlertDelivery :one
SELECT EXISTS (SELECT 1 FROM background_jobs WHERE kind = 'operator_alert' AND state IN ('repair_required','dead')) AS unhealthy;

-- name: ListProbeObservations :many
SELECT key, observed_at, state, payload
FROM operational_observations
WHERE starts_with(key, 'probe:')
ORDER BY key;

-- name: InsertWorkerHeartbeatSample :one
WITH captured AS MATERIALIZED (
    SELECT clock_timestamp() AS observed_at
), sample AS MATERIALIZED (
    SELECT 'heartbeat:worker:' || to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:00"Z"') AS key,
           observed_at
    FROM captured
), inserted AS (
    INSERT INTO operational_observations (key, observed_at, state, payload)
    SELECT key, observed_at, 'OBSERVED', '{"version":1,"kind":"worker_heartbeat"}'::jsonb
    FROM sample
    ON CONFLICT (key) DO NOTHING
    RETURNING key
)
SELECT sample.key, sample.observed_at,
       EXISTS (SELECT 1 FROM inserted) AS inserted
FROM sample;

-- name: ReadWorkerHeartbeatStatus :one
WITH captured AS MATERIALIZED (
    SELECT clock_timestamp() AS checked_at
), candidates AS MATERIALIZED (
    SELECT 'heartbeat:worker:' || to_char(date_trunc('minute', checked_at AT TIME ZONE 'UTC') - age_minutes * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS key,
           (date_trunc('minute', checked_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - age_minutes * interval '1 minute' AS minute
    FROM captured CROSS JOIN (VALUES (0), (1), (2), (3)) AS ages(age_minutes)
)
SELECT captured.checked_at,
       (SELECT max(valid.observed_at)
        FROM candidates
        CROSS JOIN LATERAL (
            SELECT o.observed_at
            FROM operational_observations o
            WHERE o.key = candidates.key
              AND o.state = 'OBSERVED'
              AND o.payload = '{"version":1,"kind":"worker_heartbeat"}'::jsonb
              AND o.observed_at >= candidates.minute
              AND o.observed_at < candidates.minute + interval '1 minute'
              AND o.observed_at <= captured.checked_at
            LIMIT 1
        ) AS valid) AS last_observed_at
FROM captured;
