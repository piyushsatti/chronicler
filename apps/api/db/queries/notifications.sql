-- name: CountUnreadNotificationsByMember :one
SELECT count(*)::bigint
FROM notifications n
WHERE n.member_id = (
    SELECT m.id
    FROM members m
    WHERE m.public_id = sqlc.arg(member_id)
)
AND n.read_at IS NULL;
