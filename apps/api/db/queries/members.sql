-- name: GetMemberByID :one
SELECT public_id AS id, discord_id, handle, display_name, avatar_url, roles, status
FROM members
WHERE public_id = $1;

-- name: GetMemberAuthority :one
SELECT m.public_id AS id, m.roles, m.status, m.handle,
       COALESCE(dp.status, '')::text AS dm_status
FROM members m
LEFT JOIN dm_profiles dp ON dp.member_id = m.id
WHERE m.public_id = $1;

-- name: GetMemberByHandle :one
SELECT public_id AS id, discord_id, handle, display_name, avatar_url, roles, status
FROM members
WHERE handle = $1;

-- name: GetMemberByDiscordID :one
SELECT public_id AS id, discord_id, handle, display_name, avatar_url, roles, status
FROM members
WHERE discord_id = $1;

-- name: UpsertMemberFromDiscord :one
INSERT INTO members (discord_id, handle, display_name, avatar_url, roles)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (discord_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now()
RETURNING public_id AS id, discord_id, handle, display_name, avatar_url, roles, status;

-- name: CountMembers :one
SELECT count(*)::bigint FROM members;

-- name: CountMembersFiltered :one
SELECT count(*)::bigint FROM members
WHERE ($1::text = '' OR status = $1);

-- name: ListMembers :many
SELECT public_id AS id, discord_id, handle, display_name, avatar_url, roles, status
FROM members
WHERE ($1::text = '' OR status = $1)
ORDER BY joined_at DESC
LIMIT $2 OFFSET $3;

-- name: ListMemberRoleHistory :many
SELECT rc.public_id AS id,
       m.public_id AS member_id,
       rc.old_roles,
       rc.new_roles,
       cb.public_id AS changed_by,
       rc.occurred_at,
       rc.note
FROM role_changes rc
JOIN members m ON m.id = rc.member_id
JOIN members cb ON cb.id = rc.changed_by
WHERE m.public_id = sqlc.arg(member_id)
ORDER BY rc.occurred_at DESC
LIMIT sqlc.arg(row_limit);

-- name: ListMemberAvailability :many
SELECT weekday, start_minute, end_minute
FROM member_availability
WHERE member_id = (SELECT members.id FROM members WHERE members.public_id = $1)
ORDER BY weekday, start_minute;
