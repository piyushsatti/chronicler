-- Quest loop queries. Wire identity is public_id (uuid). FKs and the
-- discord job payload use the bigint id.

-- name: GetQuest :one
SELECT q.id,
       q.public_id,
       q.short_code,
       q.status,
       v.display_status,
       dm.public_id AS dm_public_id,
       q.scheduled_at,
       q.duration_hours,
       q.filled_count,
       q.slots_max,
       doc.public_id AS document_public_id,
       q.discord_desired_revision,
       q.discord_applied_revision
FROM quests q
JOIN quest_display_status v ON v.id = q.id
JOIN members dm ON dm.id = q.dm_id
JOIN documents doc ON doc.id = q.document_id
WHERE q.public_id = sqlc.arg(public_id);

-- name: GetQuestByShortCode :one
SELECT q.id,
       q.public_id,
       q.short_code,
       q.status,
       v.display_status,
       dm.public_id AS dm_public_id,
       q.scheduled_at,
       q.duration_hours,
       q.filled_count,
       q.slots_max,
       doc.public_id AS document_public_id,
       q.discord_desired_revision,
       q.discord_applied_revision
FROM quests q
JOIN quest_display_status v ON v.id = q.id
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
WITH filtered AS (
  SELECT q.id, q.public_id, q.short_code, q.status, v.display_status,
    dm.public_id AS dm_public_id, q.scheduled_at, q.duration_hours,
    q.filled_count, q.slots_max, doc.public_id AS document_public_id,
    q.discord_desired_revision, q.discord_applied_revision
  FROM quests q
  JOIN quest_display_status v ON v.id = q.id
  JOIN members dm ON dm.id = q.dm_id
  JOIN documents doc ON doc.id = q.document_id
  WHERE (sqlc.narg(machine_status)::text IS NULL OR q.status = sqlc.narg(machine_status))
    AND (sqlc.narg(display_status)::text IS NULL OR v.display_status = sqlc.narg(display_status))
    AND (sqlc.narg(scheduled_from)::timestamptz IS NULL OR q.scheduled_at >= sqlc.narg(scheduled_from))
    AND (sqlc.narg(scheduled_to)::timestamptz IS NULL OR q.scheduled_at <= sqlc.narg(scheduled_to))
), counted AS (
  SELECT count(*)::bigint AS total FROM filtered
), page AS (
  SELECT * FROM filtered
  ORDER BY
    CASE WHEN sqlc.arg(newest_first)::boolean THEN scheduled_at END DESC,
    CASE WHEN sqlc.arg(newest_first)::boolean THEN public_id END DESC,
    CASE WHEN NOT sqlc.arg(newest_first)::boolean THEN scheduled_at END ASC,
    CASE WHEN NOT sqlc.arg(newest_first)::boolean THEN public_id END ASC
  LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset)
)
SELECT counted.total, (page.public_id IS NOT NULL)::boolean AS has_item,
  COALESCE(page.id, 0)::bigint AS id,
  COALESCE(page.public_id, '00000000-0000-0000-0000-000000000000'::uuid)::uuid AS public_id,
  COALESCE(page.short_code, '')::text AS short_code,
  COALESCE(page.status, '')::text AS status,
  COALESCE(page.display_status, '')::text AS display_status,
  COALESCE(page.dm_public_id, '00000000-0000-0000-0000-000000000000'::uuid)::uuid AS dm_public_id,
  COALESCE(page.scheduled_at, 'epoch'::timestamptz)::timestamptz AS scheduled_at,
  COALESCE(page.duration_hours, 0)::double precision AS duration_hours,
  COALESCE(page.filled_count, 0)::integer AS filled_count,
  COALESCE(page.slots_max, 0)::integer AS slots_max,
  COALESCE(page.document_public_id, '00000000-0000-0000-0000-000000000000'::uuid)::uuid AS document_public_id,
  COALESCE(page.discord_desired_revision, 0)::integer AS discord_desired_revision,
  COALESCE(page.discord_applied_revision, 0)::integer AS discord_applied_revision
FROM counted
LEFT JOIN page ON TRUE
ORDER BY
  CASE WHEN sqlc.arg(newest_first)::boolean THEN page.scheduled_at END DESC,
  CASE WHEN sqlc.arg(newest_first)::boolean THEN page.public_id END DESC,
  CASE WHEN NOT sqlc.arg(newest_first)::boolean THEN page.scheduled_at END ASC,
  CASE WHEN NOT sqlc.arg(newest_first)::boolean THEN page.public_id END ASC;

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

-- name: QuestDiscordAnnounceSnapshot :one
-- Everything the announcement post needs. The brief is returned raw; the worker
-- projects it for an ordinary member before use.
SELECT q.id, q.public_id, q.short_code, q.status, q.scheduled_at, q.duration_hours,
       q.discord_applied_revision,
       q.discord_message_id, q.discord_event_id, q.discord_thread_id,
       q.discord_voice_channel_id,
       dm.discord_id AS dm_discord_id,
       d.public_id AS document_public_id, d.kind AS document_kind, d.slug AS document_slug,
       d.title AS document_title, d.status AS document_status,
       d.visibility AS document_visibility, d.body AS document_body,
       d.policy AS document_policy, author.public_id AS document_author_public_id
FROM quests q
JOIN members dm ON dm.id = q.dm_id
JOIN documents d ON d.id = q.document_id
JOIN members author ON author.id = d.author_id
WHERE q.public_id = sqlc.arg(public_id);

-- name: SetQuestDiscordEvent :exec
-- Delivery bookkeeping must not move updated_at: the editor uses it as its
-- optimistic-lock token.
UPDATE quests
SET discord_event_id = sqlc.arg(discord_event_id), event_url = sqlc.arg(event_url)
WHERE public_id = sqlc.arg(public_id);

-- name: SetQuestDiscordThread :exec
UPDATE quests
SET discord_thread_id = sqlc.arg(discord_thread_id)
WHERE public_id = sqlc.arg(public_id);

-- name: DeliverySettingPayload :one
SELECT payload FROM site_settings WHERE key = sqlc.arg(setting_key)::text;
