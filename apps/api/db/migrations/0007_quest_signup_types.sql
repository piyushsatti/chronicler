-- +goose Up
-- Quests now have two signup types: "last_game_played" (the signup list orders itself by who
-- has waited longest since their last played game) and "dm_pick" (the DM chooses). Every
-- quest that had the old open, application or invite type moves to dm_pick. Quests with no
-- signup type stay unset.
ALTER TABLE quests DROP CONSTRAINT quests_signup_type_check;

UPDATE quests
SET signup_type = 'dm_pick'
WHERE signup_type IS NOT NULL;

ALTER TABLE quests
    ADD CONSTRAINT quests_signup_type_check
    CHECK (signup_type IS NULL OR signup_type = ANY (ARRAY['last_game_played'::text, 'dm_pick'::text]));

-- +goose Down
-- The original three values cannot be recovered; dm_pick maps back to invite, the closest
-- "DM chooses" meaning, and last_game_played maps to open.
ALTER TABLE quests DROP CONSTRAINT quests_signup_type_check;

UPDATE quests
SET signup_type = CASE signup_type WHEN 'last_game_played' THEN 'open' ELSE 'invite' END
WHERE signup_type IS NOT NULL;

ALTER TABLE quests
    ADD CONSTRAINT quests_signup_type_check
    CHECK (signup_type IS NULL OR signup_type = ANY (ARRAY['open'::text, 'application'::text, 'invite'::text]));
