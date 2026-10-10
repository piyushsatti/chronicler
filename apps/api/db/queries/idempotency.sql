-- name: PurgeIdempotencyKeys :exec
DELETE FROM idempotency_keys WHERE created_at < now() - interval '7 days';
