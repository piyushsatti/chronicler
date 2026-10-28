-- +goose Up
-- A DM-picked seat is immune to the Last Game Played bump, so it needs a marker distinct from
-- the automatic promotion-after-withdrawal path, which never sets it.
ALTER TABLE quest_participants ADD COLUMN dm_picked boolean DEFAULT false NOT NULL;

-- +goose Down
ALTER TABLE quest_participants DROP COLUMN dm_picked;
