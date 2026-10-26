-- +goose Up
-- New characters are now submitted for review when created. Characters created before
-- that change and never submitted wait in pending_approval but are missing from the
-- review queue, so submit them as of their creation time.
UPDATE characters
SET verification_submitted_at = created_at
WHERE status = 'pending_approval'
  AND verification_submitted_at IS NULL
  AND deleted_at IS NULL;

-- +goose Down
-- Data backfill only; there is nothing safe to undo.
SELECT 1;
