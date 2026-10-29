-- +goose Up
CREATE INDEX bot_heartbeats_received_at_idx
  ON bot_heartbeats (received_at DESC);

CREATE INDEX background_jobs_quest_delivery_idx
  ON background_jobs (
    (payload ->> 'public_id'), updated_at DESC, public_id DESC
  )
  WHERE kind IN ('quest_discord_delivery', 'quest_discord');

-- +goose Down
DROP INDEX background_jobs_quest_delivery_idx;
DROP INDEX bot_heartbeats_received_at_idx;
