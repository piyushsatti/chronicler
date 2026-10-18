-- name: CharacterProductByID :one
SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
       c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id,
       region.public_id AS region_id, c.description,
       c.ddb_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
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
       region.public_id AS region_id, c.description,
       c.ddb_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
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
SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
       c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id,
       region.public_id AS region_id, c.description,
       c.ddb_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
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
ORDER BY c.created_at DESC, c.public_id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCount :one
SELECT count(*)::int AS total
FROM characters c
JOIN members owner ON owner.id = c.owner_id
WHERE c.deleted_at IS NULL
  AND (sqlc.narg(owner_id)::uuid IS NULL OR owner.public_id = sqlc.narg(owner_id)::uuid)
  AND (sqlc.narg(character_status)::text IS NULL OR c.status = sqlc.narg(character_status)::text)
  AND (sqlc.narg(name_prefix)::text IS NULL OR left(lower(c.name), char_length(sqlc.narg(name_prefix)::text)) = lower(sqlc.narg(name_prefix)::text))
  AND (sqlc.narg(region_id)::uuid IS NULL OR c.region_id = (SELECT id FROM regions WHERE public_id = sqlc.narg(region_id)::uuid))
  AND (sqlc.narg(guild_id)::uuid IS NULL OR c.guild_document_id = (SELECT id FROM documents WHERE public_id = sqlc.narg(guild_id)::uuid));
-- name: CharacterProductMyCharacters :many
SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
       c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id, region.public_id AS region_id,
       c.description, c.ddb_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
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
ORDER BY c.created_at DESC, c.public_id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountMyCharacters :one
SELECT count(*)::int AS total
FROM characters c
JOIN members owner ON owner.id = c.owner_id
WHERE c.deleted_at IS NULL AND owner.public_id = sqlc.arg(owner_id)::uuid;
-- name: CharacterProductBatchByIDs :many
WITH requested AS (
    SELECT requested.public_id, requested.ordinality
    FROM unnest(sqlc.arg(character_ids)::uuid[]) WITH ORDINALITY AS requested(public_id, ordinality)
)
SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
       c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id, region.public_id AS region_id,
       c.description, c.ddb_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
       ddb.payload AS ddb_payload, ddb.synced_at AS ddb_synced_at,
       c.verification_submitted_at,
       CASE WHEN c.verification_submitted_at IS NOT NULL
                  AND (latest.created_at IS NULL OR latest.created_at < c.verification_submitted_at)
            THEN 'PENDING'
            ELSE UPPER(COALESCE(latest.verdict, 'unknown')) END AS verification_status
FROM requested
JOIN characters c ON c.public_id = requested.public_id AND c.deleted_at IS NULL
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
ORDER BY requested.ordinality;
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
SELECT ledger.public_id AS id, character.public_id AS character_id,
       ledger.delta AS amount, ledger.kind, ledger.note,
       quest.public_id AS quest_id, ledger.created_at AS recorded_at,
       recorder.public_id AS recorded_by
FROM character_progression_ledger ledger
JOIN characters character ON character.id = ledger.character_id
LEFT JOIN quests quest ON quest.id = ledger.quest_id
LEFT JOIN members recorder ON recorder.id = ledger.recorded_by
WHERE character.public_id = sqlc.arg(character_id)::uuid
ORDER BY ledger.created_at DESC, ledger.public_id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountProgression :one
SELECT count(*)::int AS total
FROM character_progression_ledger ledger
JOIN characters character ON character.id = ledger.character_id
WHERE character.public_id = sqlc.arg(character_id)::uuid;
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
-- name: CharacterProductListVerificationHistory :many
SELECT verification.public_id AS id, verification.subject_type,
       character.public_id AS subject_id, verification.verdict AS decision,
       reviewer.public_id AS decided_by, verification.note, verification.created_at,
       NULL::uuid AS evidence_attempt_id
FROM verifications verification
JOIN characters character ON character.id = verification.subject_id
LEFT JOIN members reviewer ON reviewer.id = verification.decided_by
WHERE verification.subject_type = 'character' AND character.public_id = sqlc.arg(character_id)::uuid
ORDER BY verification.created_at DESC, verification.public_id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountVerificationHistory :one
SELECT count(*)::int AS total
FROM verifications verification
JOIN characters character ON character.id = verification.subject_id
WHERE verification.subject_type = 'character' AND character.public_id = sqlc.arg(character_id)::uuid;
-- name: CharacterProductAdminDirectory :many
SELECT character.public_id AS id, character.name, owner.public_id AS owner_id,
       owner.handle AS owner_handle, owner.display_name AS owner_display_name,
       owner.avatar_url AS owner_avatar_url, character.short_code, character.status,
       region.public_id AS region_id, region.name AS region_name,
       guild.public_id AS guild_id,
       CASE WHEN character.verification_submitted_at IS NOT NULL
                  AND (latest.created_at IS NULL OR latest.created_at < character.verification_submitted_at)
            THEN 'PENDING'
            ELSE UPPER(COALESCE(latest.verdict, 'unknown')) END AS verification_status,
       character.verification_submitted_at, character.updated_at
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
ORDER BY character.name ASC, character.public_id ASC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductPendingVerificationDirectory :many
SELECT c.public_id AS id, c.short_code, c.name, owner.public_id AS owner_id,
       c.status, backstory.public_id AS backstory_id, guild.public_id AS guild_id, region.public_id AS region_id,
       c.description, c.ddb_url, c.player_xp AS pcxp, c.created_at, c.updated_at,
       ddb.payload AS ddb_payload, ddb.synced_at AS ddb_synced_at,
       c.verification_submitted_at, 'PENDING'::text AS verification_status
FROM characters c
JOIN members owner ON owner.id = c.owner_id
LEFT JOIN backstories backstory ON backstory.id = c.backstory_id
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
ORDER BY c.verification_submitted_at ASC, c.public_id ASC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountPendingVerifications :one
SELECT count(*)::int AS total
FROM characters c
LEFT JOIN LATERAL (
    SELECT verification.created_at
    FROM verifications verification
    WHERE verification.subject_type = 'character' AND verification.subject_id = c.id
    ORDER BY verification.created_at DESC, verification.public_id DESC
    LIMIT 1
) latest ON true
WHERE c.deleted_at IS NULL
  AND c.verification_submitted_at IS NOT NULL
  AND (latest.created_at IS NULL OR latest.created_at < c.verification_submitted_at);
-- name: CharacterProductCountAdminDirectory :one
SELECT count(*)::int AS total
FROM characters character
LEFT JOIN regions region ON region.id = character.region_id
WHERE character.deleted_at IS NULL
  AND (sqlc.narg(name_prefix)::text IS NULL OR left(lower(character.name), char_length(sqlc.narg(name_prefix)::text)) = lower(sqlc.narg(name_prefix)::text))
  AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
  AND (sqlc.narg(character_status)::text IS NULL OR character.status = sqlc.narg(character_status)::text);
-- name: CharacterProductCreationCatalog :many
SELECT entry.public_id AS id, entry.kind, entry.name, entry.available,
       entry.description, region.public_id AS introduced_by_region_id, entry.retired
FROM creation_catalog entry
LEFT JOIN regions region ON region.id = entry.introduced_by_region_id
WHERE (sqlc.arg(include_all)::bool OR (entry.available AND NOT entry.retired))
  AND (sqlc.narg(kind)::text IS NULL OR entry.kind = sqlc.narg(kind)::text)
  AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
ORDER BY lower(entry.name) ASC, entry.public_id ASC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountCreationCatalog :one
SELECT count(*)::int AS total
FROM creation_catalog entry
LEFT JOIN regions region ON region.id = entry.introduced_by_region_id
WHERE (sqlc.arg(include_all)::bool OR (entry.available AND NOT entry.retired))
  AND (sqlc.narg(kind)::text IS NULL OR entry.kind = sqlc.narg(kind)::text)
  AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid);
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
SELECT quest.public_id AS quest_id, member.public_id AS member_id,
       character.public_id AS character_id, participant.status, participant.manual,
       participant.created_at, participant.updated_at, character.name AS character_name,
       member.handle AS member_handle, member.display_name AS member_display_name,
       member.avatar_url AS member_avatar_url
FROM quest_participants participant
JOIN quests quest ON quest.id = participant.quest_id
JOIN characters character ON character.id = participant.character_id
JOIN members member ON member.id = participant.member_id
WHERE character.public_id = $1
ORDER BY participant.created_at ASC, character.public_id ASC
LIMIT $2 OFFSET $3;
-- name: CharacterProductCountParticipations :one
SELECT count(*)::int AS total
FROM quest_participants participant
JOIN characters character ON character.id = participant.character_id
WHERE character.public_id = $1;
-- name: CharacterProductListCoPlayers :many
SELECT character.public_id AS character_id, member.public_id AS member_id,
       count(DISTINCT participant.quest_id)::int AS quest_count
FROM quest_participants source
JOIN quest_participants participant ON participant.quest_id = source.quest_id
JOIN characters character ON character.id = participant.character_id
JOIN members member ON member.id = participant.member_id
WHERE source.character_id = (SELECT c.id FROM characters c WHERE c.public_id = $1)
  AND participant.status = 'played'
  AND source.status = 'played'
  AND participant.character_id <> source.character_id
  AND participant.member_id <> source.member_id
GROUP BY character.public_id, member.public_id
ORDER BY character.public_id, member.public_id
LIMIT $2 OFFSET $3;
-- name: CharacterProductCountCoPlayers :one
SELECT count(*)::int AS total
FROM (
    SELECT participant.character_id, participant.member_id
    FROM quest_participants source
    JOIN quest_participants participant ON participant.quest_id = source.quest_id
    WHERE source.character_id = (SELECT c.id FROM characters c WHERE c.public_id = $1)
      AND source.status = 'played' AND participant.status = 'played'
      AND participant.character_id <> source.character_id
      AND participant.member_id <> source.member_id
    GROUP BY participant.character_id, participant.member_id
) pairs;
-- name: CharacterProductListDowntimeProjects :many
SELECT project.public_id AS id, character.public_id AS character_id,
       project.name, project.target, project.goal, project.notes,
       project.progress, project.status, project.updated_at
FROM downtime_projects project
JOIN characters character ON character.id = project.character_id
WHERE character.public_id = $1
ORDER BY project.name ASC, project.public_id ASC
LIMIT $2 OFFSET $3;
-- name: CharacterProductCountDowntimeProjects :one
SELECT count(*)::int AS total
FROM downtime_projects project
JOIN characters character ON character.id = project.character_id
WHERE character.public_id = $1;
-- name: CharacterProductLockDowntimeProject :one
SELECT project.id, project.public_id, project.character_id, project.name,
       project.target, project.goal, project.notes, project.progress,
       project.status, project.updated_at
FROM downtime_projects project
JOIN characters character ON character.id = project.character_id
WHERE character.public_id = $1 AND project.public_id = $2
FOR UPDATE OF project;
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
SET status = 'retired', updated_at = sqlc.arg(at)::timestamptz
WHERE public_id = sqlc.arg(character_id)::uuid
  AND deleted_at IS NULL
  AND status <> 'dead'
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
-- name: CharacterProductLockClaimCharacter :one
SELECT character.id, character.public_id, character.owner_id, character.player_xp
FROM characters character
WHERE character.public_id = sqlc.arg(character_id)::uuid
FOR UPDATE;
-- name: CharacterProductListQuestRewards :many
SELECT entitlement.public_id AS id, quest.public_id AS quest_id,
       character.public_id AS character_id, awarded_by.public_id AS awarded_by,
       entitlement.awarded_at, entitlement.pcxp, entitlement.note,
       entitlement.claimed_at, ledger.public_id AS progression_entry_id
FROM quest_reward_entitlements entitlement
JOIN quests quest ON quest.id = entitlement.quest_id
JOIN characters character ON character.id = entitlement.character_id
JOIN members awarded_by ON awarded_by.id = entitlement.awarded_by
LEFT JOIN character_progression_ledger ledger ON ledger.id = entitlement.progression_entry_id
WHERE character.public_id = sqlc.arg(character_id)::uuid
ORDER BY entitlement.awarded_at DESC, entitlement.public_id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountQuestRewards :one
SELECT count(*)::int AS total
FROM quest_reward_entitlements entitlement
JOIN characters character ON character.id = entitlement.character_id
WHERE character.public_id = sqlc.arg(character_id)::uuid;
-- name: CharacterProductLockRewardClaims :many
SELECT entitlement.public_id AS id, quest.public_id AS quest_id,
       character.public_id AS character_id, awarded_by.public_id AS awarded_by,
       entitlement.awarded_at, entitlement.pcxp, entitlement.note,
       entitlement.claimed_at, ledger.public_id AS progression_entry_id
FROM quest_reward_entitlements entitlement
JOIN quests quest ON quest.id = entitlement.quest_id
JOIN characters character ON character.id = entitlement.character_id
JOIN members awarded_by ON awarded_by.id = entitlement.awarded_by
LEFT JOIN character_progression_ledger ledger ON ledger.id = entitlement.progression_entry_id
WHERE quest.public_id = sqlc.arg(quest_id)::uuid AND character.public_id = sqlc.arg(character_id)::uuid
ORDER BY quest.id, entitlement.id
FOR UPDATE OF quest, entitlement;
-- name: CharacterProductMarkRewardClaims :execrows
WITH mappings AS (
    SELECT entitlement_id.public_id::uuid AS entitlement_id, ledger.id AS ledger_id
    FROM unnest(sqlc.arg(entitlement_ids)::text[]) WITH ORDINALITY AS entitlement_id(public_id, ordinality)
    JOIN unnest(sqlc.arg(progression_ids)::text[]) WITH ORDINALITY AS progression_id(public_id, ordinality)
      ON progression_id.ordinality = entitlement_id.ordinality
    JOIN character_progression_ledger ledger ON ledger.public_id = progression_id.public_id::uuid
    WHERE cardinality(sqlc.arg(entitlement_ids)::text[]) = cardinality(sqlc.arg(progression_ids)::text[])
), updated AS (
    UPDATE quest_reward_entitlements entitlement
    SET claimed_at = sqlc.arg(at)::timestamptz, progression_entry_id = mappings.ledger_id
    FROM mappings
    WHERE entitlement.public_id = mappings.entitlement_id
  AND entitlement.claimed_at IS NULL
  AND entitlement.progression_entry_id IS NULL
    RETURNING entitlement.public_id
)
SELECT public_id FROM updated;
-- name: CharacterProductListLogs :many
SELECT log.public_id AS id, character.public_id AS character_id, quest.public_id AS quest_id,
       log.body, log.created_at, creator.public_id AS created_by
FROM character_logs log
JOIN characters character ON character.id = log.character_id
LEFT JOIN quests quest ON quest.id = log.quest_id
LEFT JOIN members creator ON creator.id = log.created_by
WHERE character.public_id = sqlc.arg(character_id)::uuid
ORDER BY log.created_at DESC, log.public_id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountLogs :one
SELECT count(*)::int AS total
FROM character_logs log
JOIN characters character ON character.id = log.character_id
WHERE character.public_id = sqlc.arg(character_id)::uuid;
-- name: CharacterProductListBackstories :many
SELECT backstory.public_id AS id, backstory.name, backstory.lore, backstory.cohort,
       backstory.retired, region.public_id AS source_region_id
FROM backstories backstory
LEFT JOIN regions region ON region.id = backstory.source_region_id
WHERE (sqlc.arg(include_retired)::bool OR NOT backstory.retired)
  AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
  AND (sqlc.narg(cohort)::text IS NULL OR backstory.cohort = sqlc.narg(cohort)::text)
ORDER BY lower(backstory.name) ASC, backstory.public_id ASC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountBackstories :one
SELECT count(*)::int AS total
FROM backstories backstory
LEFT JOIN regions region ON region.id = backstory.source_region_id
WHERE (sqlc.arg(include_retired)::bool OR NOT backstory.retired)
  AND (sqlc.narg(region_id)::uuid IS NULL OR region.public_id = sqlc.narg(region_id)::uuid)
  AND (sqlc.narg(cohort)::text IS NULL OR backstory.cohort = sqlc.narg(cohort)::text);
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
    region_id, description, background_text, ddb_url, created_at, updated_at
)
SELECT sqlc.arg(character_id)::uuid, sqlc.arg(short_code)::text, sqlc.arg(name)::text,
       owner.id, 'pending_approval', backstory.id, guild.id, region.id,
       sqlc.narg(description)::text, sqlc.narg(background_text)::text, sqlc.narg(ddb_url)::text,
       sqlc.arg(at)::timestamptz, sqlc.arg(at)::timestamptz
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
DELETE FROM character_catalog_picks
WHERE character_id = (SELECT id FROM characters WHERE public_id = sqlc.arg(character_id)::uuid);
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
-- name: CharacterProductLockCharacterLog :one
SELECT log.id, log.public_id, log.character_id, log.quest_id, log.body, log.created_at, log.created_by
FROM character_logs log
JOIN characters character ON character.id = log.character_id
WHERE character.public_id = sqlc.arg(character_id)::uuid
  AND log.public_id = sqlc.arg(log_id)::uuid
FOR UPDATE OF log;
-- name: CharacterProductDeleteCharacterLog :one
DELETE FROM character_logs log
USING characters character
WHERE log.character_id = character.id
  AND character.public_id = sqlc.arg(character_id)::uuid
  AND log.public_id = sqlc.arg(log_id)::uuid
RETURNING log.public_id AS id;
-- name: CharacterProductListSummaries :many
SELECT document.public_id AS id, document.kind, document.slug, document.title,
       document.category, document.status, document.visibility, document.policy,
       document.frontmatter_yaml, author.public_id AS author_id, document.published_at,
       document.deleted_at, deleted_by.public_id AS deleted_by, document.updated_at,
       document.version, document.body
FROM document_links link
JOIN documents document ON document.id = link.source_id
JOIN characters character ON character.id = link.character_target_id
JOIN members author ON author.id = document.author_id
LEFT JOIN members deleted_by ON deleted_by.id = document.deleted_by
WHERE character.public_id = sqlc.arg(character_id)::uuid
  AND link.relation = 'summarizes'
  AND document.kind = 'summary'
  AND document.deleted_at IS NULL
ORDER BY link.summary_append_order ASC, document.public_id ASC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;
-- name: CharacterProductCountSummaries :one
SELECT count(*)::int AS total
FROM document_links link
JOIN documents document ON document.id = link.source_id
JOIN characters character ON character.id = link.character_target_id
WHERE character.public_id = sqlc.arg(character_id)::uuid
  AND link.relation = 'summarizes'
  AND document.kind = 'summary'
  AND document.deleted_at IS NULL;
-- name: CharacterProductSumProgression :one
SELECT COALESCE(sum(ledger.delta), 0)::int AS total
FROM character_progression_ledger ledger
JOIN characters character ON character.id = ledger.character_id
WHERE character.public_id = sqlc.arg(character_id)::uuid;
-- name: CharacterProductListCatalogPickIds :many
SELECT catalog.public_id AS id
FROM character_catalog_picks pick
JOIN characters character ON character.id = pick.character_id
JOIN creation_catalog catalog ON catalog.id = pick.catalog_id
WHERE character.public_id = sqlc.arg(character_id)::uuid
ORDER BY catalog.public_id ASC;
