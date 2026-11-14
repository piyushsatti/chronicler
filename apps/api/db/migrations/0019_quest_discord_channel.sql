-- +goose Up
-- Remember which Discord channel holds a quest's announcement message, so later
-- edits, threads, and event links stay on that channel when the admin setting moves.
ALTER TABLE quests ADD COLUMN discord_channel_id text;

-- +goose Down
ALTER TABLE quests DROP COLUMN discord_channel_id;
