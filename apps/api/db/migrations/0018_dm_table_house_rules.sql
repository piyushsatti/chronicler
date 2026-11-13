-- +goose Up
-- Copy each live DM table into that DM's house_rules when a guest can already read the whole document.
-- Documents stay as they are. House rules are public.
-- document_readable (0001_init.sql) treats a NULL or JSON-null policy as no policy and then uses visibility.
-- Any other policy, including an empty array, denies a guest. This migration uses that same no-policy check.
-- D20's closed markers are [!dm], [!dm:@handle], and [!spoiler]. Case and whitespace fold.
-- A body containing any of them is skipped whole. This does not redact.
-- Length is Unicode characters, the same count as queryText (utf8.RuneCountInString).
-- PostgreSQL char_length counts those characters. octet_length counts bytes and is not used.
-- An empty house_rules starts at the heading. Existing prose gets a blank line, then the heading, then the body.
-- A row whose result would pass 4000 characters is left unchanged and keeps its DM table document.
-- A later run skips a profile that already has that heading as its own line, so the append happens once.
-- Rows that are appended also increment review_revision by 1.
-- A DM saving an editor opened before the deploy can overwrite the appended text, and the DM table document remains in the database.

UPDATE dm_profiles AS p
SET house_rules = src.appended,
    review_revision = p.review_revision + 1
FROM (
    SELECT
        profile.member_id,
        CASE
            WHEN COALESCE(profile.house_rules, '') = ''
                THEN heading.label || E'\n' || doc.body
            ELSE profile.house_rules || E'\n\n' || heading.label || E'\n' || doc.body
        END AS appended
    FROM dm_profiles AS profile
    JOIN documents AS doc
        ON doc.author_id = profile.member_id
        AND doc.kind = 'community'
        AND doc.category = 'dm_table'
        AND doc.deleted_at IS NULL
        AND doc.status = 'published'
        AND doc.visibility = 'public'
        AND (doc.policy IS NULL OR doc.policy = 'null'::jsonb)
        AND doc.body !~* '\[![[:space:]]*(dm|spoiler)'
    CROSS JOIN LATERAL (
        SELECT '## From my DM table: ' || doc.title AS label
    ) AS heading
    WHERE position(
        E'\n' || heading.label || E'\n'
        IN E'\n' || COALESCE(profile.house_rules, '') || E'\n'
    ) = 0
) AS src
WHERE p.member_id = src.member_id
  AND char_length(src.appended) <= 4000;

-- Keep this guest check the same as the UPDATE above.
-- +goose StatementBegin
DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN
        SELECT
            doc.id AS document_id,
            doc.author_id AS member_id,
            CASE
                WHEN doc.status IS DISTINCT FROM 'published'
                    OR doc.visibility IS DISTINCT FROM 'public'
                    OR NOT (doc.policy IS NULL OR doc.policy = 'null'::jsonb)
                    OR doc.body ~* '\[![[:space:]]*(dm|spoiler)'
                    THEN 'not readable by a guest'
                WHEN profile.member_id IS NULL THEN 'no dm profile'
                ELSE 'would exceed 4000'
            END AS reason
        FROM documents AS doc
        LEFT JOIN dm_profiles AS profile ON profile.member_id = doc.author_id
        CROSS JOIN LATERAL (
            SELECT '## From my DM table: ' || doc.title AS label
        ) AS heading
        WHERE doc.kind = 'community'
          AND doc.category = 'dm_table'
          AND doc.deleted_at IS NULL
          AND (
              profile.member_id IS NULL
              OR position(
                  E'\n' || heading.label || E'\n'
                  IN E'\n' || COALESCE(profile.house_rules, '') || E'\n'
              ) = 0
          )
          AND (
              profile.member_id IS NULL
              OR doc.status IS DISTINCT FROM 'published'
              OR doc.visibility IS DISTINCT FROM 'public'
              OR NOT (doc.policy IS NULL OR doc.policy = 'null'::jsonb)
              OR doc.body ~* '\[![[:space:]]*(dm|spoiler)'
              OR char_length(
                  CASE
                      WHEN COALESCE(profile.house_rules, '') = ''
                          THEN heading.label || E'\n' || doc.body
                      ELSE profile.house_rules || E'\n\n' || heading.label || E'\n' || doc.body
                  END
              ) > 4000
          )
    LOOP
        RAISE WARNING 'member % document % skipped: %', rec.member_id, rec.document_id, rec.reason;
    END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
-- No-op. House rules may have been edited after the append, so splitting the prose back out is not safe.
-- review_revision is left as it is. Skipped rows still have their DM table document.
