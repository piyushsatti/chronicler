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
SET discord_id = members.discord_id
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
-- name: ListMemberAvailability :many
SELECT weekday, start_minute, end_minute
FROM member_availability
WHERE member_id = (SELECT members.id FROM members WHERE members.public_id = $1)
ORDER BY weekday, start_minute;
