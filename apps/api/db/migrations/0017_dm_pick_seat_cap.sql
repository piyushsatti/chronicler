-- +goose Up
-- DM Pick seats waitlisted characters with no seat cap, so filled_count may pass slots_max.
-- Last Game Played and an unset signup type keep the original cap (IS NOT DISTINCT FROM: a NULL type must not pass).
ALTER TABLE quests DROP CONSTRAINT quests_filled_count_check;

ALTER TABLE quests
    ADD CONSTRAINT quests_filled_count_check
    CHECK (filled_count >= 0 AND (filled_count <= slots_max OR signup_type IS NOT DISTINCT FROM 'dm_pick'));

-- +goose Down
-- Overfilled DM Pick rows cannot satisfy the old cap. Down does not clamp them:
-- that would desync filled_count from the seated roster.
ALTER TABLE quests DROP CONSTRAINT quests_filled_count_check;

ALTER TABLE quests
    ADD CONSTRAINT quests_filled_count_check
    CHECK (filled_count >= 0 AND filled_count <= slots_max);
