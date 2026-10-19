-- Inbox-only notifications (D1). No notification_events ledger.

-- name: ProductNotificationInbox :many
SELECT n.public_id, n.kind, n.subject_type, n.subject_id, n.body,
       n.read_at, n.created_at
FROM notifications n
JOIN members m ON m.id = n.member_id
WHERE m.public_id = sqlc.arg(member_id)::uuid
  AND (NOT sqlc.arg(unread_only)::boolean OR n.read_at IS NULL)
  AND (sqlc.narg(before_created_at)::timestamptz IS NULL
       OR (n.created_at, n.public_id) <
          (sqlc.narg(before_created_at)::timestamptz, sqlc.narg(before_notification_id)::uuid))
ORDER BY n.created_at DESC, n.public_id DESC
LIMIT sqlc.arg(page_size)::integer;

-- name: ProductNotificationUnreadCount :one
SELECT count(*)::bigint
FROM notifications n
JOIN members m ON m.id = n.member_id
WHERE m.public_id = sqlc.arg(member_id)::uuid AND n.read_at IS NULL;

-- name: ProductNotificationLockOldestUnread :many
WITH selected AS MATERIALIZED (
    SELECT n.public_id
    FROM notifications n
    JOIN members m ON m.id = n.member_id
    WHERE m.public_id = sqlc.arg(member_id)::uuid AND n.read_at IS NULL
    ORDER BY n.created_at ASC, n.public_id ASC
    LIMIT LEAST(sqlc.arg(row_limit)::integer, 100)
)
SELECT n.public_id, n.kind, n.subject_type,
       (CASE n.subject_type
         WHEN 'document' THEN d.public_id
         WHEN 'character' THEN c.public_id
         WHEN 'quest' THEN q.public_id
         ELSE NULL
       END)::uuid AS subject_public_id,
       (n.subject_id IS NOT NULL)::boolean AS subject_ref_present,
       n.body, n.read_at, n.created_at
FROM selected
JOIN notifications n ON n.public_id = selected.public_id
JOIN members m ON m.id = n.member_id
LEFT JOIN documents d ON n.subject_type = 'document' AND d.id = n.subject_id
LEFT JOIN characters c ON n.subject_type = 'character' AND c.id = n.subject_id
LEFT JOIN quests q ON n.subject_type = 'quest' AND q.id = n.subject_id
WHERE m.public_id = sqlc.arg(member_id)::uuid AND n.read_at IS NULL
ORDER BY n.public_id
FOR UPDATE OF n;

-- name: ProductNotificationSubjectDocuments :many
SELECT d.public_id
FROM documents d
WHERE d.public_id = ANY(sqlc.arg(ids)::uuid[]);

-- name: ProductNotificationSubjectCharacters :many
SELECT c.public_id
FROM characters c
WHERE c.public_id = ANY(sqlc.arg(ids)::uuid[]);

-- name: ProductNotificationSubjectQuests :many
SELECT q.public_id
FROM quests q
WHERE q.public_id = ANY(sqlc.arg(ids)::uuid[]);

-- name: ProductNotificationMarkRead :one
WITH locked AS MATERIALIZED (
    SELECT n.id
    FROM notifications n
    JOIN members m ON m.id = n.member_id
    WHERE m.public_id = sqlc.arg(member_id)::uuid
      AND n.public_id = ANY(sqlc.arg(notification_ids)::uuid[])
      AND n.read_at IS NULL
    ORDER BY n.public_id
    FOR UPDATE OF n
), changed AS (
    UPDATE notifications n
    SET read_at = sqlc.arg(read_at)::timestamptz
    FROM locked
    WHERE n.id = locked.id AND n.read_at IS NULL
    RETURNING n.public_id
)
SELECT count(*)::integer AS affected_count FROM changed;

-- name: ProductNotificationInsertInbox :many
INSERT INTO notifications (member_id, kind, subject_type, subject_id, body, created_at)
SELECT m.id, sqlc.arg(kind)::text, sqlc.narg(subject_type)::text, sqlc.narg(subject_id)::bigint,
       sqlc.arg(body)::text, sqlc.arg(created_at)::timestamptz
FROM members m
WHERE m.public_id = ANY(sqlc.arg(member_ids)::uuid[])
RETURNING public_id;
