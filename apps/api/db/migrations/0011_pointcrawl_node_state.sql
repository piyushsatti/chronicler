-- +goose Up
-- A hex carries an admin-set exploration state. The state is displayed on the map only; it does not
-- change who can see or reach a hex. Existing and new hexes start locked.
ALTER TABLE pointcrawl_nodes ADD COLUMN state text NOT NULL DEFAULT 'locked'
    CONSTRAINT pointcrawl_nodes_state_check CHECK (state IN ('locked', 'unlocked', 'mapped'));

-- +goose Down
ALTER TABLE pointcrawl_nodes DROP COLUMN state;
