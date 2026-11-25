-- +goose Up
-- Last Game Played live reshuffle (#213). The DM's fill by last played starts the
-- live window; the first player-list publish ends it. While live, a later signup
-- whose last game is further back takes a seat the fill gave out.
ALTER TABLE quests ADD COLUMN live_fill_started_at timestamptz;
ALTER TABLE quests ADD COLUMN player_list_published_at timestamptz;

-- A seat given out while the list was live. Its waitlist-promotion notice waits for
-- the first publish, and only these seats can be taken by a later signup.
ALTER TABLE quest_participants ADD COLUMN seat_notice_held boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE quest_participants DROP COLUMN seat_notice_held;
ALTER TABLE quests DROP COLUMN player_list_published_at;
ALTER TABLE quests DROP COLUMN live_fill_started_at;
