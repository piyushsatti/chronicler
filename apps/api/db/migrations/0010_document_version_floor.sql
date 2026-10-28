-- +goose Up
-- A document's first revision is 1: InsertProductDocument writes 1 and edits reject an expected
-- revision below 1. Rows inserted without an explicit version (seeds, imports) took the old
-- default 0 and could never be edited, so lift them to the floor and make the default agree.
UPDATE documents SET version = 1 WHERE version = 0;
ALTER TABLE documents ALTER COLUMN version SET DEFAULT 1;

-- +goose Down
-- Restores only the column default; rows lifted from 0 to 1 by the Up step are not reversed.
ALTER TABLE documents ALTER COLUMN version SET DEFAULT 0;
