-- +goose Up
-- The DM picks one voice channel from the admin list (site_settings key
-- discord_voice_channels). discord_thread_id records the thread opened on the
-- first announcement post so it is never created twice.
ALTER TABLE quests
    ADD COLUMN discord_voice_channel_id text,
    ADD COLUMN discord_thread_id text,
    ADD CONSTRAINT quests_discord_voice_channel_id_snowflake
    CHECK (discord_voice_channel_id IS NULL OR discord_voice_channel_id ~ '^[0-9]{17,20}$');

-- +goose Down
ALTER TABLE quests
    DROP CONSTRAINT quests_discord_voice_channel_id_snowflake,
    DROP COLUMN discord_thread_id,
    DROP COLUMN discord_voice_channel_id;
