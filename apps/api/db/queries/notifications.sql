-- name: CountUnreadNotificationsByMember :one
SELECT count(*)::bigint
FROM notifications n
WHERE n.member_id = (
    SELECT m.id
    FROM members m
    WHERE m.public_id = sqlc.arg(member_id)
)
AND n.read_at IS NULL;

-- name: MarkNotificationsReadByMember :exec
UPDATE notifications
SET read_at = transaction_timestamp()
WHERE member_id = (
    SELECT m.id FROM members m WHERE m.public_id = sqlc.arg(member_id)
)
AND public_id = ANY(sqlc.arg(public_ids)::uuid[])
AND read_at IS NULL;
