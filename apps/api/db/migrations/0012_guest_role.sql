-- +goose Up
ALTER TABLE members DROP CONSTRAINT members_roles_vocab;
ALTER TABLE members ADD CONSTRAINT members_roles_vocab
CHECK (roles <@ ARRAY[
  'player','dm','archon','lieutenant','verifier','admin','guest'
]::text[]);

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM members WHERE 'guest' = ANY(roles)) THEN
    RAISE EXCEPTION 'cannot remove guest role while members still have guest';
  END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE members DROP CONSTRAINT members_roles_vocab;
ALTER TABLE members ADD CONSTRAINT members_roles_vocab
CHECK (roles <@ ARRAY[
  'player','dm','archon','lieutenant','verifier','admin'
]::text[]);
