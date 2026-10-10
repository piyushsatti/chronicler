-- Quest loop queries. Wire identity is public_id (uuid). FKs and the
-- discord job payload use the bigint id.

-- name: GetQuest :one
SELECT q.id,
       q.public_id,
       q.short_code,
       q.status,
       dm.public_id AS dm_public_id,
       q.scheduled_at,
       q.filled_count,
       q.slots_max,
       doc.public_id AS document_public_id,
       q.discord_desired_revision,
       q.discord_applied_revision
FROM quests q
JOIN members dm ON dm.id = q.dm_id
JOIN documents doc ON doc.id = q.document_id
WHERE q.public_id = sqlc.arg(public_id);

-- name: GetQuestByShortCode :one
SELECT q.id,
       q.public_id,
       q.short_code,
       q.status,
       dm.public_id AS dm_public_id,
       q.scheduled_at,
       q.filled_count,
       q.slots_max,
       doc.public_id AS document_public_id,
       q.discord_desired_revision,
       q.discord_applied_revision
FROM quests q
JOIN members dm ON dm.id = q.dm_id
JOIN documents doc ON doc.id = q.document_id
WHERE q.short_code = sqlc.arg(short_code);

-- name: SaveQuestStatus :exec
UPDATE quests
SET status = sqlc.arg(status), updated_at = now()
WHERE public_id = sqlc.arg(public_id);

-- name: BumpQuestDiscordRevision :one
UPDATE quests
SET discord_desired_revision = discord_desired_revision + 1, updated_at = now()
WHERE public_id = sqlc.arg(public_id)
RETURNING id, public_id, discord_desired_revision;

-- name: ListQuests :many
SELECT q.id,
       q.public_id,
       q.short_code,
       q.status,
       dm.public_id AS dm_public_id,
       q.scheduled_at,
       q.filled_count,
       q.slots_max,
       doc.public_id AS document_public_id,
       q.discord_desired_revision,
       q.discord_applied_revision
FROM quests q
JOIN members dm ON dm.id = q.dm_id
JOIN documents doc ON doc.id = q.document_id
WHERE (sqlc.arg(status)::text = '' OR q.status = sqlc.arg(status))
ORDER BY q.scheduled_at DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountQuests :one
SELECT count(*)::bigint
FROM quests
WHERE (sqlc.arg(status)::text = '' OR status = sqlc.arg(status));

-- name: InsertQuest :one
INSERT INTO quests (
    short_code, kinds, dm_id, scheduled_at, duration_hours, slots_max, document_id, created_by
) VALUES (
    sqlc.arg(short_code),
    sqlc.arg(kinds)::text[],
    sqlc.arg(dm_id),
    sqlc.arg(scheduled_at),
    sqlc.arg(duration_hours),
    sqlc.arg(slots_max),
    sqlc.arg(document_id),
    sqlc.arg(created_by)
)
RETURNING id, public_id;

-- name: InsertQuestParticipant :execrows
INSERT INTO quest_participants (quest_id, member_id, character_id, status)
VALUES (sqlc.arg(quest_id), sqlc.arg(member_id), sqlc.arg(character_id), 'signed_up')
ON CONFLICT (quest_id, character_id) DO NOTHING;

-- name: IncrementQuestFilled :one
UPDATE quests
SET filled_count = filled_count + 1, updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING filled_count, slots_max, status;

-- name: MarkQuestFull :exec
UPDATE quests
SET status = 'full', updated_at = now()
WHERE id = sqlc.arg(id) AND status = 'open';

-- name: ListQuestParticipants :many
SELECT q.public_id AS quest_id,
       m.public_id AS member_id,
       c.public_id AS character_id,
       qp.status,
       qp.manual
FROM quest_participants qp
JOIN quests q ON q.id = qp.quest_id
JOIN members m ON m.id = qp.member_id
JOIN characters c ON c.id = qp.character_id
WHERE q.public_id = sqlc.arg(quest_id)
  AND (sqlc.arg(status)::text = '' OR qp.status = sqlc.arg(status));

-- name: CountQuestParticipants :one
SELECT count(*)::int
FROM quest_participants
WHERE quest_id = sqlc.arg(quest_id);

-- name: ApplyQuestDiscordRevision :exec
UPDATE quests
SET discord_applied_revision = GREATEST(discord_applied_revision, sqlc.arg(desired)),
    updated_at = now()
WHERE public_id = sqlc.arg(public_id);

-- name: QuestDiscordRevisions :one
SELECT id, public_id, discord_desired_revision, discord_applied_revision, discord_message_id
FROM quests
WHERE public_id = sqlc.arg(public_id);

-- name: SetQuestDiscordMessageID :exec
UPDATE quests
SET discord_message_id = sqlc.arg(discord_message_id), updated_at = now()
WHERE public_id = sqlc.arg(public_id);

-- name: MemberInternalID :one
SELECT id FROM members WHERE public_id = sqlc.arg(public_id);

-- name: CharacterInternalID :one
SELECT id FROM characters WHERE public_id = sqlc.arg(public_id);

-- name: CharacterInternalIDForOwner :one
SELECT c.id
FROM characters c
JOIN members o ON o.id = c.owner_id
WHERE c.public_id = sqlc.arg(public_id)
  AND o.public_id = sqlc.arg(owner_id);

-- name: DocumentInternalID :one
SELECT id FROM documents WHERE public_id = sqlc.arg(public_id);
