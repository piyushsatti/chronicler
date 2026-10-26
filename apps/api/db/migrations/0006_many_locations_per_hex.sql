-- +goose Up
-- A hex may hold many Locations (owner decision, tester request M4-02). Drop the partial
-- unique index that allowed one 'location' link per pointcrawl node. The primary key
-- (node_id, document_id, relation) still prevents linking the same Location twice, and the
-- Feature cap (4 per hex) is enforced in the document commands, not here.
DROP INDEX IF EXISTS pointcrawl_entry_links_location_idx;

-- Tester request M4-18: a map is either a hex map or a point map. Every map stays a
-- pointcrawl (maps.map_kind is unchanged); grid says how its places are drawn and named:
-- hexes on a hex map, locations on a point map. Maps that already have hex adjacency
-- routes (the Lightfall Hexflower) are hex maps.
ALTER TABLE maps ADD COLUMN grid text NOT NULL DEFAULT 'point';
ALTER TABLE maps ADD CONSTRAINT maps_grid_check CHECK (grid IN ('point', 'hex'));
UPDATE maps m SET grid = 'hex'
WHERE EXISTS (SELECT 1 FROM pointcrawl_edges e WHERE e.map_id = m.id AND e.kind = 'hex');

-- +goose Down
ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_grid_check;
ALTER TABLE maps DROP COLUMN IF EXISTS grid;
-- Restores the one-Location-per-hex rule. This fails if any hex now holds more than one
-- Location; unlink the extras first.
CREATE UNIQUE INDEX pointcrawl_entry_links_location_idx ON pointcrawl_entry_links USING btree (node_id) WHERE (relation = 'location'::text);
