-- name: CharacterProductByID :one
SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
       c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id,
       region.public_id AS region_id, c.description, c.background_text,
       c.ddb_url, c.image_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
       ddb.payload AS ddb_payload, ddb.synced_at AS ddb_synced_at,
       c.verification_submitted_at,
       CASE WHEN c.verification_submitted_at IS NOT NULL
                  AND (latest.created_at IS NULL OR latest.created_at < c.verification_submitted_at)
            THEN 'PENDING'
            ELSE UPPER(COALESCE(latest.verdict, 'unknown')) END AS verification_status
FROM characters c
JOIN members owner ON owner.id = c.owner_id
LEFT JOIN backstories backstory ON backstory.id = c.backstory_id
LEFT JOIN documents guild ON guild.id = c.guild_document_id
LEFT JOIN regions region ON region.id = c.region_id
LEFT JOIN character_ddb_mirrors ddb ON ddb.character_id = c.id
LEFT JOIN LATERAL (
    SELECT verification.verdict, verification.created_at
    FROM verifications verification
    WHERE verification.subject_type = 'character' AND verification.subject_id = c.id
    ORDER BY verification.created_at DESC, verification.public_id DESC
    LIMIT 1
) latest ON true
WHERE c.public_id = sqlc.arg(character_id)::uuid AND c.deleted_at IS NULL;
-- name: CharacterProductByShortCode :one
SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
       c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id,
       region.public_id AS region_id, c.description, c.background_text,
       c.ddb_url, c.image_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
       ddb.payload AS ddb_payload, ddb.synced_at AS ddb_synced_at,
       c.verification_submitted_at,
       CASE WHEN c.verification_submitted_at IS NOT NULL
                  AND (latest.created_at IS NULL OR latest.created_at < c.verification_submitted_at)
            THEN 'PENDING'
            ELSE UPPER(COALESCE(latest.verdict, 'unknown')) END AS verification_status
FROM characters c
JOIN members owner ON owner.id = c.owner_id
LEFT JOIN backstories backstory ON backstory.id = c.backstory_id
LEFT JOIN documents guild ON guild.id = c.guild_document_id
LEFT JOIN regions region ON region.id = c.region_id
LEFT JOIN character_ddb_mirrors ddb ON ddb.character_id = c.id
LEFT JOIN LATERAL (
    SELECT verification.verdict, verification.created_at
    FROM verifications verification
    WHERE verification.subject_type = 'character' AND verification.subject_id = c.id
    ORDER BY verification.created_at DESC, verification.public_id DESC
    LIMIT 1
) latest ON true
WHERE c.short_code = sqlc.arg(short_code)::text AND c.deleted_at IS NULL;
-- name: CharacterProductList :many
WITH filtered AS (
    SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
           c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id,
           region.public_id AS region_id, c.description, c.background_text,
           c.ddb_url, c.image_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
           ddb.payload AS ddb_payload, ddb.synced_at AS ddb_synced_at,
           c.verification_submitted_at,
           CASE WHEN c.verification_submitted_at IS NOT NULL
                      AND (latest.created_at IS NULL OR latest.created_at < c.verification_submitted_at)
                THEN 'PENDING'
                ELSE UPPER(COALESCE(latest.verdict, 'unknown')) END AS verification_status
    FROM characters c
    JOIN members owner ON owner.id = c.owner_id
    LEFT JOIN backstories backstory ON backstory.id = c.backstory_id
    LEFT JOIN documents guild ON guild.id = c.guild_document_id
    LEFT JOIN regions region ON region.id = c.region_id
    LEFT JOIN character_ddb_mirrors ddb ON ddb.character_id = c.id
    LEFT JOIN LATERAL (
        SELECT verification.verdict, verification.created_at
        FROM verifications verification
        WHERE verification.subject_type = 'character' AND verification.subject_id = c.id
        ORDER BY verification.created_at DESC, verification.public_id DESC
        LIMIT 1
    ) latest ON true
    WHERE c.deleted_at IS NULL
      AND (sqlc.narg(owner_id)::uuid IS NULL OR owner.public_id = sqlc.narg(owner_id)::uuid)
      AND (sqlc.narg(character_status)::text IS NULL OR c.status = sqlc.narg(character_status)::text)
      AND (sqlc.narg(name_prefix)::text IS NULL OR left(lower(c.name), char_length(sqlc.narg(name_prefix)::text)) = lower(sqlc.narg(name_prefix)::text))
      AND (sqlc.narg(region_id)::uuid IS NULL OR c.region_id = (SELECT id FROM regions WHERE public_id = sqlc.narg(region_id)::uuid))
      AND (sqlc.narg(guild_id)::uuid IS NULL OR c.guild_document_id = (SELECT id FROM documents WHERE public_id = sqlc.narg(guild_id)::uuid))
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.short_code, page.name, page.owner_id,
       page.status, page.backstory_id, page.guild_id, page.region_id,
       page.description, page.background_text, page.ddb_url, page.image_url,
       page.pcxp, page.created_at, page.updated_at, page.ddb_payload,
       page.ddb_synced_at, page.verification_submitted_at, page.verification_status
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.created_at DESC NULLS LAST, page.id DESC NULLS LAST;
-- name: CharacterProductMyCharacters :many
WITH filtered AS (
    SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
           c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id, region.public_id AS region_id,
           c.description, c.background_text, c.ddb_url, c.image_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
           ddb.payload AS ddb_payload, ddb.synced_at AS ddb_synced_at,
           c.verification_submitted_at,
           CASE WHEN c.verification_submitted_at IS NOT NULL
                      AND (latest.created_at IS NULL OR latest.created_at < c.verification_submitted_at)
                THEN 'PENDING'
                ELSE UPPER(COALESCE(latest.verdict, 'unknown')) END AS verification_status
    FROM characters c
    JOIN members owner ON owner.id = c.owner_id
    LEFT JOIN backstories backstory ON backstory.id = c.backstory_id
    LEFT JOIN documents guild ON guild.id = c.guild_document_id
    LEFT JOIN regions region ON region.id = c.region_id
    LEFT JOIN character_ddb_mirrors ddb ON ddb.character_id = c.id
    LEFT JOIN LATERAL (
        SELECT verification.verdict, verification.created_at
        FROM verifications verification
        WHERE verification.subject_type = 'character' AND verification.subject_id = c.id
        ORDER BY verification.created_at DESC, verification.public_id DESC
        LIMIT 1
    ) latest ON true
    WHERE c.deleted_at IS NULL AND owner.public_id = sqlc.arg(owner_id)::uuid
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.short_code, page.name, page.owner_id,
       page.status, page.backstory_id, page.guild_id, page.region_id,
       page.description, page.background_text, page.ddb_url, page.image_url,
       page.pcxp, page.created_at, page.updated_at, page.ddb_payload,
       page.ddb_synced_at, page.verification_submitted_at, page.verification_status
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.created_at DESC NULLS LAST, page.id DESC NULLS LAST;
-- name: CharacterProductLockByID :one
SELECT c.id, c.public_id, c.owner_id, c.status, c.updated_at, c.player_xp,
       c.backstory_id, c.guild_document_id, c.region_id, c.deleted_at,
       c.verification_submitted_at
FROM characters c
WHERE c.public_id = $1
FOR UPDATE;
-- name: CharacterProductSetGuild :one
UPDATE characters AS target
SET guild_document_id = guild.id, updated_at = sqlc.arg(at)::timestamptz
FROM documents guild, members owner
WHERE target.public_id = sqlc.arg(character_id)::uuid
  AND owner.id = target.owner_id
  AND guild.public_id = sqlc.arg(guild_id)::uuid
  AND guild.kind = 'codex_entry'
  AND guild.deleted_at IS NULL
RETURNING target.public_id AS id, target.short_code, target.name,
          owner.public_id AS owner_id, target.status,
          (SELECT public_id FROM regions WHERE id = target.region_id) AS region_id,
          guild.public_id AS guild_id,
          target.description, target.ddb_url, target.player_xp AS pcxp,
          target.created_at, target.updated_at,
          target.verification_submitted_at;
-- name: CharacterProductClearGuild :one
UPDATE characters AS target
SET guild_document_id = NULL, updated_at = sqlc.arg(at)::timestamptz
WHERE target.public_id = sqlc.arg(character_id)::uuid
RETURNING target.public_id AS id, target.short_code, target.name,
          (SELECT public_id FROM members WHERE id = target.owner_id) AS owner_id,
          target.status,
          (SELECT public_id FROM regions WHERE id = target.region_id) AS region_id,
          NULL::uuid AS guild_id,
          target.description, target.ddb_url, target.player_xp AS pcxp,
          target.created_at, target.updated_at,
          target.verification_submitted_at;
-- name: CharacterProductListProgression :many
WITH filtered AS (
    SELECT ledger.public_id AS id, character.public_id AS character_id,
           ledger.delta AS amount, ledger.kind, ledger.note,
           quest.public_id AS quest_id, ledger.created_at AS recorded_at,
           recorder.public_id AS recorded_by
    FROM character_progression_ledger ledger
    JOIN characters character ON character.id = ledger.character_id
    LEFT JOIN quests quest ON quest.id = ledger.quest_id
    LEFT JOIN members recorder ON recorder.id = ledger.recorded_by
    WHERE character.public_id = sqlc.arg(character_id)::uuid
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY recorded_at DESC, id DESC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.character_id, page.amount, page.kind,
       page.note, page.quest_id, page.recorded_at, page.recorded_by
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.recorded_at DESC NULLS LAST, page.id DESC NULLS LAST;
-- name: CharacterProductAdjustPCXP :one
WITH updated AS (
    UPDATE characters
    SET player_xp = player_xp + sqlc.arg(amount)::int, updated_at = now()
    WHERE public_id = sqlc.arg(character_id)::uuid AND deleted_at IS NULL AND player_xp + sqlc.arg(amount)::int >= 0
    RETURNING id, public_id
), inserted AS (
    INSERT INTO character_progression_ledger (character_id, delta, reason, note, recorded_by)
    SELECT updated.id, sqlc.arg(amount)::int, sqlc.arg(reason)::text, sqlc.narg(note)::text, actor.id
    FROM updated
    JOIN members actor ON actor.public_id = sqlc.arg(actor_id)::uuid
    RETURNING public_id, character_id, delta, kind, note, quest_id, created_at, recorded_by
)
SELECT inserted.public_id AS id, character.public_id AS character_id,
       inserted.delta AS amount, inserted.kind, inserted.note,
       quest.public_id AS quest_id, inserted.created_at AS recorded_at,
       actor.public_id AS recorded_by
FROM inserted
JOIN characters character ON character.id = inserted.character_id
LEFT JOIN quests quest ON quest.id = inserted.quest_id
LEFT JOIN members actor ON actor.id = inserted.recorded_by;
-- name: CharacterProductLockQuestRoster :many
SELECT c.public_id
FROM characters c
JOIN quest_participants participant ON participant.character_id = c.id
JOIN quests q ON q.id = participant.quest_id
WHERE q.public_id = @quest_id::uuid
ORDER BY c.public_id
FOR UPDATE OF c;

-- name: CharacterProductImmutableOwner :one
SELECT owner.public_id FROM characters c JOIN members owner ON owner.id = c.owner_id
WHERE c.public_id = @character_id::uuid AND c.deleted_at IS NULL;

-- name: CharacterProductLockAdmissions :many
SELECT c.public_id, owner.public_id AS owner_id, c.status, owner.status AS owner_status, c.updated_at
FROM characters c JOIN members owner ON owner.id = c.owner_id
WHERE c.public_id = ANY(@character_ids::uuid[]) AND c.deleted_at IS NULL
ORDER BY c.public_id
FOR UPDATE OF c;

-- name: CharacterProductAwardQuestPCXP :many
WITH awards AS (
    SELECT ids.character_id, amounts.amount, notes.note
    FROM unnest(@character_ids::uuid[]) WITH ORDINALITY AS ids(character_id, ordinality)
    JOIN unnest(@amounts::integer[]) WITH ORDINALITY AS amounts(amount, ordinality)
      ON amounts.ordinality = ids.ordinality
    JOIN unnest(@notes::text[]) WITH ORDINALITY AS notes(note, ordinality)
      ON notes.ordinality = ids.ordinality
),
updated AS (
    UPDATE characters c
    SET player_xp = c.player_xp + awards.amount, updated_at = @at::timestamptz
    FROM awards
    WHERE c.public_id = awards.character_id
      AND c.player_xp::bigint + awards.amount <= 2147483647::bigint
      AND (SELECT COALESCE(sum(ledger.delta), 0) + awards.amount
           FROM character_progression_ledger ledger WHERE ledger.character_id = c.id)
          BETWEEN -2147483648::bigint AND 2147483647::bigint
      AND EXISTS (
          SELECT 1 FROM quest_participants participant JOIN quests q ON q.id = participant.quest_id
          WHERE participant.character_id = c.id AND q.public_id = @quest_id::uuid
            AND q.status = 'closed' AND participant.status = 'played'
      )
    RETURNING c.id, awards.amount, awards.note
)
INSERT INTO character_progression_ledger(character_id, delta, reason, kind, note, quest_id, recorded_by, created_at)
SELECT updated.id, updated.amount, 'quest_reward', 'pcxp', NULLIF(updated.note, ''), q.id, actor.id, @at::timestamptz
FROM updated CROSS JOIN quests q CROSS JOIN members actor
WHERE q.public_id = @quest_id::uuid AND actor.public_id = @actor_id::uuid
RETURNING public_id;

-- name: CharacterProductListVerificationHistory :many
WITH filtered AS (
    SELECT verification.public_id AS id, verification.subject_type,
           character.public_id AS subject_id, verification.verdict AS decision,
           reviewer.public_id AS decided_by, verification.note, verification.created_at,
           NULL::uuid AS evidence_attempt_id
    FROM verifications verification
    JOIN characters character ON character.id = verification.subject_id
    LEFT JOIN members reviewer ON reviewer.id = verification.decided_by
    WHERE verification.subject_type = 'character' AND character.public_id = sqlc.arg(character_id)::uuid
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.subject_type, page.subject_id, page.decision,
       page.decided_by, page.note, page.created_at, page.evidence_attempt_id
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.created_at DESC NULLS LAST, page.id DESC NULLS LAST;
-- name: CharacterProductAdminDirectory :many
WITH filtered AS (
    SELECT character.public_id AS id, character.name, owner.public_id AS owner_id,
           owner.handle AS owner_handle, owner.display_name AS owner_display_name,
           owner.avatar_url AS owner_avatar_url, character.short_code, character.status,
           region.public_id AS region_id, region.name AS region_name,
           guild.public_id AS guild_id,
           CASE WHEN character.verification_submitted_at IS NOT NULL
                      AND (latest.created_at IS NULL OR latest.created_at < character.verification_submitted_at)
                THEN 'PENDING'
                ELSE UPPER(COALESCE(latest.verdict, 'unknown')) END AS verification_status,
           character.verification_submitted_at, character.ddb_url, character.updated_at
    FROM characters character
    JOIN members owner ON owner.id = character.owner_id
    LEFT JOIN regions region ON region.id = character.region_id
    LEFT JOIN documents guild ON guild.id = character.guild_document_id
    LEFT JOIN LATERAL (
        SELECT verification.verdict, verification.created_at
        FROM verifications verification
        WHERE verification.subject_type = 'character'
          AND verification.subject_id = character.id
        ORDER BY verification.created_at DESC, verification.public_id DESC
        LIMIT 1
    ) latest ON true
    WHERE character.deleted_at IS NULL
      AND (sqlc.narg(name_prefix)::text IS NULL OR left(lower(character.name), char_length(sqlc.narg(name_prefix)::text)) = lower(sqlc.narg(name_prefix)::text))
      AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
      AND (sqlc.narg(character_status)::text IS NULL OR character.status = sqlc.narg(character_status)::text)
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY name ASC, id ASC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.name, page.owner_id, page.owner_handle,
       page.owner_display_name, page.owner_avatar_url, page.short_code, page.status,
       page.region_id, page.region_name, page.guild_id, page.verification_status,
       page.verification_submitted_at, page.ddb_url, page.updated_at
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.name ASC NULLS LAST, page.id ASC NULLS LAST;
-- name: CharacterProductPendingVerificationDirectory :many
WITH filtered AS (
    SELECT c.public_id AS id, c.name, owner.public_id AS owner_id,
           owner.handle AS owner_handle, owner.display_name AS owner_display_name,
           owner.avatar_url AS owner_avatar_url, c.short_code, c.status,
           region.public_id AS region_id, region.name AS region_name,
           guild.public_id AS guild_id,
           'PENDING'::text AS verification_status,
           c.verification_submitted_at, c.ddb_url, ddb.synced_at AS ddb_synced_at, c.updated_at
    FROM characters c
    JOIN members owner ON owner.id = c.owner_id
    LEFT JOIN documents guild ON guild.id = c.guild_document_id
    LEFT JOIN regions region ON region.id = c.region_id
    LEFT JOIN character_ddb_mirrors ddb ON ddb.character_id = c.id
    LEFT JOIN LATERAL (
        SELECT verification.created_at
        FROM verifications verification
        WHERE verification.subject_type = 'character' AND verification.subject_id = c.id
        ORDER BY verification.created_at DESC, verification.public_id DESC
        LIMIT 1
    ) latest ON true
    WHERE c.deleted_at IS NULL
      AND c.verification_submitted_at IS NOT NULL
      AND (latest.created_at IS NULL OR latest.created_at < c.verification_submitted_at)
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY verification_submitted_at ASC, id ASC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.name, page.owner_id, page.owner_handle,
       page.owner_display_name, page.owner_avatar_url, page.short_code, page.status,
       page.region_id, page.region_name, page.guild_id, page.verification_status,
       page.verification_submitted_at, page.ddb_url, page.ddb_synced_at, page.updated_at
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.verification_submitted_at ASC NULLS LAST, page.id ASC NULLS LAST;
-- name: CharacterProductCreationCatalog :many
WITH filtered AS (
    SELECT entry.public_id AS id, entry.kind, entry.name, entry.available,
           entry.description, region.public_id AS introduced_by_region_id, entry.retired
    FROM creation_catalog entry
    LEFT JOIN regions region ON region.id = entry.introduced_by_region_id
    WHERE (sqlc.arg(include_all)::bool OR (entry.available AND NOT entry.retired))
      AND (sqlc.narg(kind)::text IS NULL OR entry.kind = sqlc.narg(kind)::text)
      AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY lower(name) ASC, id ASC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.kind, page.name, page.available,
       page.description, page.introduced_by_region_id, page.retired
FROM counted LEFT JOIN page ON TRUE
ORDER BY lower(page.name) ASC NULLS LAST, page.id ASC NULLS LAST;
-- name: CharacterProductLockCreationCatalogEntry :one
SELECT entry.id, entry.public_id, entry.kind, entry.code, entry.name,
       entry.available, entry.description, entry.introduced_by_region_id, entry.retired
FROM creation_catalog entry
WHERE entry.public_id = sqlc.arg(option_id)::uuid
FOR UPDATE;
-- name: CharacterProductUpsertCreationCatalogEntry :one
WITH requested_region AS (
    SELECT region.id, region.public_id
    FROM (SELECT sqlc.narg(region_id)::uuid AS public_id) requested
    LEFT JOIN regions region ON region.public_id = requested.public_id
), identity AS (
    SELECT gen_random_uuid() AS public_id
), inserted AS (
    INSERT INTO creation_catalog (
        public_id, kind, code, name, available, description, introduced_by_region_id, retired
    )
    SELECT identity.public_id, sqlc.arg(kind)::text,
           'option_' || replace(identity.public_id::text, '-', ''),
           sqlc.arg(name)::text, sqlc.arg(available)::bool, sqlc.narg(description)::text,
           requested_region.id, sqlc.arg(retired)::bool
    FROM identity
    LEFT JOIN requested_region ON true
    WHERE sqlc.narg(option_id)::uuid IS NULL
      AND (sqlc.narg(region_id)::uuid IS NULL OR requested_region.id IS NOT NULL)
    RETURNING public_id, kind, name, available, description, introduced_by_region_id, retired
), updated AS (
    UPDATE creation_catalog entry
    SET name = sqlc.arg(name)::text,
        available = sqlc.arg(available)::bool,
        description = sqlc.narg(description)::text,
        introduced_by_region_id = requested_region.id,
        retired = sqlc.arg(retired)::bool
    FROM requested_region
    WHERE entry.public_id = sqlc.narg(option_id)::uuid
      AND entry.kind = sqlc.arg(kind)::text
      AND (sqlc.narg(region_id)::uuid IS NULL OR requested_region.id IS NOT NULL)
    RETURNING entry.public_id, entry.kind, entry.name, entry.available,
              entry.description, entry.introduced_by_region_id, entry.retired
)
SELECT inserted.public_id AS id, inserted.kind, inserted.name, inserted.available,
       inserted.description,
       (SELECT public_id FROM regions WHERE id = inserted.introduced_by_region_id) AS introduced_by_region_id,
       inserted.retired
FROM inserted
UNION ALL
SELECT updated.public_id AS id, updated.kind, updated.name, updated.available,
       updated.description,
       (SELECT public_id FROM regions WHERE id = updated.introduced_by_region_id) AS introduced_by_region_id,
       updated.retired
FROM updated;
-- name: CharacterProductListParticipations :many
WITH filtered AS (
    SELECT quest.public_id AS quest_id, member.public_id AS member_id,
           character.public_id AS character_id, participant.status, participant.manual,
           participant.created_at, participant.updated_at, character.name AS character_name,
           member.handle AS member_handle, member.display_name AS member_display_name,
           member.avatar_url AS member_avatar_url
    FROM quest_participants participant
    JOIN quests quest ON quest.id = participant.quest_id
    JOIN characters character ON character.id = participant.character_id
    JOIN members member ON member.id = participant.member_id
    WHERE character.public_id = sqlc.arg(public_id)
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY created_at ASC, character_id ASC
    LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset)
)
SELECT counted.total, page.quest_id, page.member_id, page.character_id, page.status,
       page.manual, page.created_at, page.updated_at, page.character_name,
       page.member_handle, page.member_display_name, page.member_avatar_url
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.created_at ASC NULLS LAST, page.character_id ASC NULLS LAST;
-- name: CharacterProductListCoPlayers :many
WITH filtered AS (
    SELECT character.public_id AS character_id, member.public_id AS member_id,
           count(DISTINCT participant.quest_id)::int AS quest_count
    FROM quest_participants source
    JOIN quest_participants participant ON participant.quest_id = source.quest_id
    JOIN characters character ON character.id = participant.character_id
    JOIN members member ON member.id = participant.member_id
    WHERE source.character_id = (SELECT c.id FROM characters c WHERE c.public_id = sqlc.arg(public_id))
      AND participant.status = 'played'
      AND source.status = 'played'
      AND participant.character_id <> source.character_id
      AND participant.member_id <> source.member_id
    GROUP BY character.public_id, member.public_id
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY character_id, member_id
    LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset)
)
SELECT counted.total, page.character_id, page.member_id, page.quest_count
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.character_id ASC NULLS LAST, page.member_id ASC NULLS LAST;
-- name: CharacterProductListDowntimeProjects :many
WITH filtered AS (
    SELECT project.public_id AS id, character.public_id AS character_id,
           project.name, project.target, project.goal, project.notes,
           project.progress, project.status, project.updated_at
    FROM downtime_projects project
    JOIN characters character ON character.id = project.character_id
    WHERE character.public_id = sqlc.arg(public_id)
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY name ASC, id ASC
    LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset)
)
SELECT counted.total, page.id, page.character_id, page.name, page.target,
       page.goal, page.notes, page.progress, page.status, page.updated_at
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.name ASC NULLS LAST, page.id ASC NULLS LAST;
-- name: CharacterProductInsertDowntimeProject :one
WITH inserted AS (
    INSERT INTO downtime_projects (character_id, name, target, goal, notes, progress, status, updated_at)
    SELECT character.id, sqlc.arg(name), sqlc.narg(target), sqlc.narg(goal),
           sqlc.narg(notes), sqlc.arg(progress), sqlc.arg(status), sqlc.arg(at)::timestamptz
    FROM characters character
    WHERE character.public_id = sqlc.arg(character_id)::uuid AND character.deleted_at IS NULL
    RETURNING id, public_id, character_id, name, target, goal, notes, progress, status, updated_at
)
SELECT inserted.public_id AS id, character.public_id AS character_id,
       inserted.name, inserted.target, inserted.goal, inserted.notes,
       inserted.progress, inserted.status, inserted.updated_at
FROM inserted JOIN characters character ON character.id = inserted.character_id;
-- name: CharacterProductUpdateDowntimeProject :one
UPDATE downtime_projects project
SET name = sqlc.arg(name), target = sqlc.narg(target), goal = sqlc.narg(goal),
    notes = sqlc.narg(notes), progress = sqlc.arg(progress),
    status = sqlc.arg(status), updated_at = sqlc.arg(at)::timestamptz
FROM characters character
WHERE project.character_id = character.id
  AND character.public_id = sqlc.arg(character_id)::uuid
  AND project.public_id = sqlc.arg(project_id)::uuid
RETURNING project.public_id AS id,
          (SELECT public_id FROM characters WHERE id = project.character_id) AS character_id,
          project.name,
          project.target, project.goal, project.notes, project.progress,
          project.status, project.updated_at;
-- name: CharacterProductDelete :one
UPDATE characters
SET deleted_at = sqlc.arg(at)::timestamptz,
    deleted_by = (SELECT id FROM members WHERE public_id = sqlc.arg(actor_id)::uuid),
    updated_at = sqlc.arg(at)::timestamptz
WHERE public_id = sqlc.arg(character_id)::uuid
  AND deleted_at IS NULL
RETURNING public_id AS id, updated_at;
-- name: CharacterProductRestore :one
UPDATE characters
SET deleted_at = NULL, deleted_by = NULL, updated_at = sqlc.arg(at)::timestamptz
WHERE public_id = sqlc.arg(character_id)::uuid AND deleted_at IS NOT NULL
RETURNING public_id AS id, updated_at;
-- name: CharacterProductRetire :one
UPDATE characters
SET status = 'retired',
    updated_at = sqlc.arg(at)::timestamptz,
    -- An open submission is the review-queue row. A verdict at or after it is already resolved.
    verification_submitted_at = CASE
        WHEN verification_submitted_at IS NOT NULL
             AND NOT EXISTS (
                 SELECT 1
                 FROM verifications verification
                 WHERE verification.subject_type = 'character'
                   AND verification.subject_id = characters.id
                   AND verification.created_at >= characters.verification_submitted_at
             )
        THEN NULL
        ELSE verification_submitted_at
    END
WHERE public_id = sqlc.arg(character_id)::uuid
  AND deleted_at IS NULL
  AND status NOT IN ('dead', 'retired')
  AND updated_at = sqlc.arg(expected_updated_at)::timestamptz
RETURNING public_id AS id, status, updated_at;
-- name: CharacterProductSubmitForVerification :one
UPDATE characters
SET verification_submitted_at = sqlc.arg(at)::timestamptz,
    updated_at = sqlc.arg(at)::timestamptz
WHERE public_id = sqlc.arg(character_id)::uuid
  AND deleted_at IS NULL
  AND status = 'pending_approval'
  AND updated_at = sqlc.arg(expected_updated_at)::timestamptz
RETURNING public_id AS id, verification_submitted_at, updated_at;
-- name: CharacterProductListLogs :many
WITH filtered AS (
    SELECT log.public_id AS id, character.public_id AS character_id, quest.public_id AS quest_id,
           log.body, log.created_at, creator.public_id AS created_by
    FROM character_logs log
    JOIN characters character ON character.id = log.character_id
    LEFT JOIN quests quest ON quest.id = log.quest_id
    LEFT JOIN members creator ON creator.id = log.created_by
    WHERE character.public_id = sqlc.arg(character_id)::uuid
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.character_id, page.quest_id, page.body,
       page.created_at, page.created_by
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.created_at DESC NULLS LAST, page.id DESC NULLS LAST;
-- name: CharacterProductListBackstories :many
WITH filtered AS (
    SELECT backstory.public_id AS id, backstory.name, backstory.lore, backstory.cohort,
           backstory.retired, region.public_id AS source_region_id
    FROM backstories backstory
    LEFT JOIN regions region ON region.id = backstory.source_region_id
    WHERE (sqlc.arg(include_retired)::bool OR NOT backstory.retired)
      AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
      AND (sqlc.narg(cohort)::text IS NULL OR backstory.cohort = sqlc.narg(cohort)::text)
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY lower(name) ASC, id ASC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.name, page.lore, page.cohort, page.retired,
       page.source_region_id
FROM counted LEFT JOIN page ON TRUE
ORDER BY lower(page.name) ASC NULLS LAST, page.id ASC NULLS LAST;
-- name: CharacterProductLockBackstory :one
SELECT backstory.id, backstory.public_id, backstory.name, backstory.lore, backstory.cohort,
       backstory.source_region_id, backstory.retired
FROM backstories backstory
WHERE backstory.public_id = sqlc.arg(backstory_id)::uuid
FOR UPDATE;
-- name: CharacterProductInsertBackstory :one
INSERT INTO backstories (public_id, name, lore, cohort, source_region_id, retired)
SELECT sqlc.arg(backstory_id)::uuid, sqlc.arg(name)::text, sqlc.arg(lore)::text,
       sqlc.arg(cohort)::text, region.id, sqlc.arg(retired)::bool
FROM (SELECT 1) AS seed
LEFT JOIN regions region ON region.public_id = sqlc.narg(region_id)::uuid
WHERE sqlc.narg(region_id)::uuid IS NULL OR region.id IS NOT NULL
RETURNING public_id AS id, name, lore, cohort, retired,
          (SELECT public_id FROM regions WHERE id = source_region_id) AS source_region_id;
-- name: CharacterProductUpdateBackstory :one
UPDATE backstories backstory
SET name = sqlc.arg(name)::text,
    lore = sqlc.arg(lore)::text,
    cohort = sqlc.arg(cohort)::text,
    source_region_id = CASE
        WHEN sqlc.narg(region_id)::uuid IS NULL THEN NULL
        ELSE (SELECT id FROM regions WHERE public_id = sqlc.narg(region_id)::uuid)
    END,
    retired = sqlc.arg(retired)::bool
WHERE backstory.public_id = sqlc.arg(backstory_id)::uuid
  AND (sqlc.narg(region_id)::uuid IS NULL OR EXISTS (SELECT 1 FROM regions WHERE public_id = sqlc.narg(region_id)::uuid))
RETURNING backstory.public_id AS id, backstory.name, backstory.lore, backstory.cohort,
          backstory.retired,
          (SELECT public_id FROM regions WHERE id = backstory.source_region_id) AS source_region_id;
-- name: CharacterProductInsertCharacter :one
INSERT INTO characters (
    public_id, short_code, name, owner_id, status, backstory_id, guild_document_id,
    region_id, description, background_text, ddb_url, image_url, created_at, updated_at,
    verification_submitted_at
)
SELECT sqlc.arg(character_id)::uuid, sqlc.arg(short_code)::text, sqlc.arg(name)::text,
       owner.id, 'pending_approval', backstory.id, guild.id, region.id,
       sqlc.narg(description)::text, sqlc.narg(background_text)::text, sqlc.narg(ddb_url)::text,
       sqlc.narg(image_url)::text,
       sqlc.arg(at)::timestamptz, sqlc.arg(at)::timestamptz,
       -- A new character goes straight to the review queue.
       sqlc.arg(at)::timestamptz
FROM members owner
LEFT JOIN backstories backstory ON backstory.public_id = sqlc.narg(backstory_id)::uuid
LEFT JOIN documents guild ON guild.public_id = sqlc.narg(guild_id)::uuid
    AND guild.kind = 'codex_entry' AND guild.deleted_at IS NULL
LEFT JOIN regions region ON region.public_id = sqlc.narg(region_id)::uuid
WHERE owner.public_id = sqlc.arg(owner_id)::uuid
  AND (sqlc.narg(backstory_id)::uuid IS NULL OR backstory.id IS NOT NULL)
  AND (sqlc.narg(guild_id)::uuid IS NULL OR guild.id IS NOT NULL)
  AND (sqlc.narg(region_id)::uuid IS NULL OR region.id IS NOT NULL)
RETURNING public_id AS id;
-- name: CharacterProductReplaceCatalogPicks :exec
WITH removed AS (
    DELETE FROM character_catalog_picks
    WHERE character_id = (SELECT id FROM characters WHERE public_id = sqlc.arg(character_id)::uuid)
)
INSERT INTO character_catalog_picks (character_id, catalog_id)
SELECT character.id, catalog.id
FROM characters character
JOIN unnest(sqlc.arg(catalog_ids)::uuid[]) AS requested(catalog_id) ON true
JOIN creation_catalog catalog ON catalog.public_id = requested.catalog_id
WHERE character.public_id = sqlc.arg(character_id)::uuid;
-- name: CharacterProductUpdateCharacterProfile :one
UPDATE characters
SET description = CASE WHEN sqlc.arg(description_set)::bool THEN sqlc.narg(description)::text ELSE description END,
    background_text = CASE WHEN sqlc.arg(background_set)::bool THEN sqlc.narg(background_text)::text ELSE background_text END,
    image_url = CASE WHEN sqlc.arg(image_url_set)::bool THEN sqlc.narg(image_url)::text ELSE image_url END,
    updated_at = sqlc.arg(at)::timestamptz
WHERE public_id = sqlc.arg(character_id)::uuid
  AND deleted_at IS NULL
RETURNING public_id AS id, updated_at;
-- name: CharacterProductUpdateCharacterDdbUrl :one
UPDATE characters
SET ddb_url = sqlc.arg(ddb_url)::text, updated_at = sqlc.arg(at)::timestamptz
WHERE public_id = sqlc.arg(character_id)::uuid AND deleted_at IS NULL
RETURNING public_id AS id;
-- name: CharacterProductUpsertDdbMirror :exec
INSERT INTO character_ddb_mirrors (character_id, payload, synced_at)
SELECT character.id, sqlc.arg(payload)::jsonb, sqlc.arg(at)::timestamptz
FROM characters character
WHERE character.public_id = sqlc.arg(character_id)::uuid
ON CONFLICT (character_id) DO UPDATE
SET payload = EXCLUDED.payload, synced_at = EXCLUDED.synced_at;
-- name: CharacterProductInsertCharacterLog :one
INSERT INTO character_logs (public_id, character_id, quest_id, body, created_at, created_by)
SELECT sqlc.arg(log_id)::uuid, character.id, quest.id, sqlc.arg(body)::text,
       sqlc.arg(at)::timestamptz, actor.id
FROM characters character
JOIN members actor ON actor.public_id = sqlc.arg(actor_id)::uuid
LEFT JOIN quests quest ON quest.public_id = sqlc.narg(quest_id)::uuid
WHERE character.public_id = sqlc.arg(character_id)::uuid
  AND character.deleted_at IS NULL
  AND (sqlc.narg(quest_id)::uuid IS NULL OR quest.id IS NOT NULL)
RETURNING public_id AS id, body, created_at;
-- name: CharacterProductDeleteCharacterLog :one
DELETE FROM character_logs log
USING characters character
WHERE log.character_id = character.id
  AND character.public_id = sqlc.arg(character_id)::uuid
  AND log.public_id = sqlc.arg(log_id)::uuid
RETURNING log.public_id AS id;
-- name: CharacterProductListSummaries :many
WITH filtered AS (
    SELECT document.public_id AS id, document.kind, document.slug, document.title,
           document.category, document.status, document.visibility, document.policy,
           document.frontmatter_yaml, author.public_id AS author_id, document.published_at,
           document.deleted_at, deleted_by.public_id AS deleted_by, document.updated_at,
           document.version, link.summary_append_order
    FROM document_links link
    JOIN documents document ON document.id = link.source_id
    JOIN characters character ON character.id = link.character_target_id
    JOIN members author ON author.id = document.author_id
    LEFT JOIN members deleted_by ON deleted_by.id = document.deleted_by
    WHERE character.public_id = sqlc.arg(character_id)::uuid
      AND link.relation = 'summarizes'
      AND document.kind = 'summary'
      AND document.deleted_at IS NULL
      AND document_readable(document.public_id, author.public_id, document.status, document.visibility, document.policy,
          sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
          sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY summary_append_order ASC, id ASC
    LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int
)
SELECT counted.total, page.id, page.kind, page.slug, page.title, page.category,
       page.status, page.visibility, page.policy, page.frontmatter_yaml, page.author_id,
       page.published_at, page.deleted_at, page.deleted_by, page.updated_at, page.version
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.summary_append_order ASC NULLS LAST, page.id ASC NULLS LAST;
-- name: CharacterProductValidateCreationReferences :one
SELECT
    (sqlc.narg(backstory_id)::uuid IS NULL OR EXISTS (
        SELECT 1 FROM backstories WHERE public_id = sqlc.narg(backstory_id)::uuid AND NOT retired
    ))
    AND (sqlc.narg(region_id)::uuid IS NULL OR EXISTS (
        SELECT 1 FROM regions WHERE public_id = sqlc.narg(region_id)::uuid
    ))
    AND NOT EXISTS (
        SELECT 1 FROM unnest(sqlc.arg(catalog_ids)::uuid[]) AS requested(public_id)
        WHERE NOT EXISTS (
            SELECT 1 FROM creation_catalog catalog
            LEFT JOIN regions region ON region.id = catalog.introduced_by_region_id
            WHERE catalog.public_id = requested.public_id AND catalog.available AND NOT catalog.retired
              AND (catalog.introduced_by_region_id IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
        )
    ) AS valid;

-- name: CharacterProductApplyVerification :one
UPDATE characters
SET status = CASE WHEN @approved::boolean THEN 'active' ELSE 'pending_approval' END,
    updated_at = @at::timestamptz
WHERE public_id = @character_id::uuid AND deleted_at IS NULL
  AND status = 'pending_approval' AND verification_submitted_at = @submitted_at::timestamptz
RETURNING public_id;
