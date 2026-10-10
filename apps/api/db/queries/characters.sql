-- name: GetCharacter :one
SELECT c.public_id AS id,
       c.short_code,
       c.name,
       o.public_id AS owner_id,
       c.status,
       b.public_id AS backstory_id,
       r.public_id AS region_id,
       c.player_xp AS pcxp
FROM characters c
JOIN members o ON o.id = c.owner_id
LEFT JOIN backstories b ON b.id = c.backstory_id
LEFT JOIN regions r ON r.id = c.region_id
WHERE c.public_id = $1;

-- name: GetCharacterByShortCode :one
SELECT c.public_id AS id,
       c.short_code,
       c.name,
       o.public_id AS owner_id,
       c.status,
       b.public_id AS backstory_id,
       r.public_id AS region_id,
       c.player_xp AS pcxp
FROM characters c
JOIN members o ON o.id = c.owner_id
LEFT JOIN backstories b ON b.id = c.backstory_id
LEFT JOIN regions r ON r.id = c.region_id
WHERE c.short_code = $1;

-- name: ListCharactersByOwner :many
SELECT c.public_id AS id,
       c.short_code,
       c.name,
       o.public_id AS owner_id,
       c.status,
       b.public_id AS backstory_id,
       r.public_id AS region_id,
       c.player_xp AS pcxp
FROM characters c
JOIN members o ON o.id = c.owner_id
LEFT JOIN backstories b ON b.id = c.backstory_id
LEFT JOIN regions r ON r.id = c.region_id
WHERE o.public_id = sqlc.arg(owner_id)
ORDER BY c.created_at DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: ListCharacters :many
SELECT c.public_id AS id,
       c.short_code,
       c.name,
       o.public_id AS owner_id,
       c.status,
       b.public_id AS backstory_id,
       r.public_id AS region_id,
       c.player_xp AS pcxp
FROM characters c
JOIN members o ON o.id = c.owner_id
LEFT JOIN backstories b ON b.id = c.backstory_id
LEFT JOIN regions r ON r.id = c.region_id
WHERE ($1::text IS NULL OR c.status = $1)
ORDER BY c.created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListCharacterProgression :many
SELECT l.public_id AS id,
       c.public_id AS character_id,
       l.delta,
       l.reason,
       l.created_at
FROM character_progression_ledger l
JOIN characters c ON c.id = l.character_id
WHERE c.public_id = sqlc.arg(character_id)
ORDER BY l.created_at DESC
LIMIT sqlc.arg(row_limit);

-- name: ListCharacterLogs :many
SELECT l.public_id AS id,
       c.public_id AS character_id,
       q.public_id AS quest_id,
       l.body,
       l.created_at
FROM character_logs l
JOIN characters c ON c.id = l.character_id
LEFT JOIN quests q ON q.id = l.quest_id
WHERE c.public_id = sqlc.arg(character_id)
ORDER BY l.created_at DESC
LIMIT sqlc.arg(row_limit);

-- name: ListCharacterVerifications :many
SELECT v.public_id AS id,
       v.subject_type,
       c.public_id AS subject_id,
       v.verdict AS decision,
       m.public_id AS decided_by,
       v.note,
       v.created_at
FROM verifications v
JOIN characters c ON c.id = v.subject_id
JOIN members m ON m.id = v.decided_by
WHERE v.subject_type = 'character'
  AND c.public_id = sqlc.arg(subject_id)
ORDER BY v.created_at DESC
LIMIT sqlc.arg(row_limit);
