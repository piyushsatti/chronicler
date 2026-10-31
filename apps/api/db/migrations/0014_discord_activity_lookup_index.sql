-- +goose Up
CREATE INDEX discord_activity_events_member_kind_time_idx
  ON discord_activity_events
  (discord_user_id, kind, occurred_at DESC);

-- +goose Down
DROP INDEX discord_activity_events_member_kind_time_idx;
