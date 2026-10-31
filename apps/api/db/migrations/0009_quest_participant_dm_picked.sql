-- +goose Up
-- A DM-picked seat is immune to the Last Game Played bump, so it needs a marker distinct from
-- the automatic promotion-after-withdrawal path, which never sets it.
ALTER TABLE quest_participants ADD COLUMN dm_picked boolean DEFAULT false NOT NULL;

-- Seats taken before this rule existed are grandfathered as protected, since a DM pick was not recorded then.
UPDATE quest_participants qp
SET dm_picked = true
FROM quests q
WHERE q.id = qp.quest_id
  AND qp.status = 'signed_up'
  AND q.signup_type = 'last_game_played'
  AND q.status IN ('open', 'full');

-- +goose Down
ALTER TABLE quest_participants DROP COLUMN dm_picked;
