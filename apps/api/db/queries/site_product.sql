-- Persistent Site reads and setting writes. Authorization and transaction
-- ownership remain with the calling service and unit of work.

-- name: SiteCommunitySnapshot :many
WITH totals AS (
    SELECT
        (SELECT count(*)::integer FROM members) AS total_members,
        (SELECT count(*)::integer FROM characters
         WHERE status = 'active' AND deleted_at IS NULL) AS active_characters,
        (SELECT count(*)::integer FROM maps) AS total_maps,
        (SELECT count(*)::integer FROM hexes) AS total_hexes,
        (SELECT count(*)::integer FROM regions WHERE deleted_at IS NULL) AS total_regions,
        (SELECT count(*)::integer FROM quests WHERE deleted_at IS NULL) AS total_quests,
        (SELECT count(*)::integer FROM dm_profiles p
         JOIN members m ON m.id = p.member_id
         WHERE m.status = 'active' AND 'dm' = ANY(m.roles)
           AND p.status = 'approved') AS total_dms
), activity AS (
    SELECT
        coalesce(sum(amount) FILTER (WHERE kind = 'voice'), 0)::double precision AS voice_minutes,
        coalesce(sum(amount) FILTER (WHERE kind = 'message'), 0)::double precision AS messages,
        coalesce(sum(amount) FILTER (WHERE kind = 'reaction'), 0)::double precision AS reactions
    FROM discord_activity_events
), role_counts AS (
    SELECT roles.role, count(DISTINCT m.id)::integer AS member_count
    FROM members m
    CROSS JOIN LATERAL unnest(m.roles) AS roles(role)
    GROUP BY roles.role
)
SELECT totals.total_members, totals.active_characters, totals.total_maps,
       totals.total_hexes, totals.total_regions, totals.total_quests,
       totals.total_dms, activity.voice_minutes, activity.messages,
       activity.reactions, role_counts.role, role_counts.member_count
FROM totals CROSS JOIN activity
LEFT JOIN role_counts ON true
ORDER BY role_counts.role;

-- name: SiteMemberDiscovery :many
WITH matching AS MATERIALIZED (
    SELECT public_id, handle, display_name, avatar_url
    FROM members
    WHERE starts_with(lower(handle), lower(sqlc.arg(query)::text))
       OR starts_with(lower(display_name), lower(sqlc.arg(query)::text))
), page AS (
    SELECT public_id, handle, display_name, avatar_url
    FROM matching
    ORDER BY handle, public_id
    LIMIT sqlc.arg(page_limit)::integer OFFSET sqlc.arg(page_offset)::integer
), total AS (
    SELECT count(*)::integer AS total FROM matching
)
SELECT total.total, page.public_id, page.handle, page.display_name, page.avatar_url
FROM total LEFT JOIN page ON true
ORDER BY page.handle, page.public_id;

-- name: SiteReadSetting :one
SELECT key, payload, updated_at
FROM site_settings
WHERE key = sqlc.arg(setting_key)::text;

-- name: SiteEnsureSetting :execrows
INSERT INTO site_settings (key, payload, updated_at)
VALUES (sqlc.arg(setting_key)::text, sqlc.arg(initial_payload)::jsonb,
        sqlc.arg(at)::timestamptz)
ON CONFLICT (key) DO NOTHING;

-- name: SiteLockSetting :one
SELECT key, payload, updated_at
FROM site_settings
WHERE key = sqlc.arg(setting_key)::text
FOR UPDATE;

-- name: SiteReplaceSetting :one
UPDATE site_settings
SET payload = sqlc.arg(payload)::jsonb,
    updated_at = sqlc.arg(at)::timestamptz
WHERE key = sqlc.arg(setting_key)::text
RETURNING key, payload, updated_at;

-- name: SiteAppendSettingChange :one
WITH inserted AS (
    INSERT INTO site_setting_changes
        (public_id, setting_key, actor_id, old_value, new_value, created_at)
    SELECT sqlc.arg(change_id)::uuid, sqlc.arg(setting_key)::text, m.id,
           sqlc.narg(old_value)::jsonb, sqlc.arg(new_value)::jsonb,
           sqlc.arg(at)::timestamptz
    FROM members m
    WHERE m.public_id = sqlc.arg(actor_id)::uuid
    RETURNING public_id, setting_key, old_value, new_value, actor_id, created_at
)
SELECT inserted.public_id, inserted.setting_key, inserted.old_value,
       inserted.new_value, actor.public_id AS actor_id, inserted.created_at
FROM inserted JOIN members actor ON actor.id = inserted.actor_id;
