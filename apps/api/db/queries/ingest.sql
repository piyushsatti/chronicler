-- name: InsertDiscordActivityEvent :exec
INSERT INTO discord_activity_events (event_id, kind, discord_user_id, channel_id, occurred_at, amount)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (event_id) DO NOTHING;

-- name: InsertBotHeartbeat :exec
INSERT INTO bot_heartbeats (payload) VALUES ($1);
