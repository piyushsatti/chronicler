-- +goose NO TRANSACTION
-- +goose Up
-- D5: optional owner-supplied character portrait. Additive and nullable so
-- existing rows stay valid; https only, any host, at most 2048 characters.
-- The CHECK is added NOT VALID and validated separately (outside one
-- transaction) so the ACCESS EXCLUSIVE lock is not held across the row scan.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE characters ADD CONSTRAINT characters_image_url_check
    CHECK (image_url IS NULL OR (image_url LIKE 'https://%' AND char_length(image_url) <= 2048)) NOT VALID;
ALTER TABLE characters VALIDATE CONSTRAINT characters_image_url_check;

-- +goose Down
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_image_url_check;
ALTER TABLE characters DROP COLUMN IF EXISTS image_url;
