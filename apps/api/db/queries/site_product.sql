-- name: SiteCommunitySnapshot :many
WITH totals AS (
    SELECT
        (SELECT count(*)::integer FROM members) AS total_members,
        (SELECT count(*)::integer FROM characters
         WHERE status = 'active' AND deleted_at IS NULL) AS active_characters,
        (SELECT count(*)::integer FROM maps) AS total_maps,
        (SELECT count(*)::integer FROM pointcrawl_nodes) AS total_pointcrawl_nodes,
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
       totals.total_pointcrawl_nodes, totals.total_regions, totals.total_quests,
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
-- name: SiteJobClock :one
SELECT clock_timestamp()::timestamptz AS now;
-- name: SiteAdminDeliveryCounts :one
SELECT count(*) FILTER (WHERE state IN ('queued', 'running', 'retry_wait', 'repair_required'))::integer AS pending_count,
       count(*) FILTER (WHERE state IN ('dead', 'succeeded', 'cancelled'))::integer AS terminal_count,
       count(*)::integer AS total_count
FROM background_jobs
WHERE kind = 'quest_discord_delivery'
  AND (sqlc.narg(delivery_state)::text IS NULL OR state = sqlc.narg(delivery_state));
-- name: SiteAdminDeliveryJobs :many
WITH matching AS (
    SELECT b.public_id, b.state, b.attempts, b.redrive_count, b.safe_error_code, b.next_run_at,
           b.created_at, b.updated_at, b.payload,
           q.public_id AS quest_public_id, q.short_code AS quest_short_code, d.title AS quest_title,
           q.discord_desired_revision, q.discord_applied_revision, q.discord_message_id, q.event_url
    FROM background_jobs b
    LEFT JOIN quests q ON q.public_id::text = b.payload ->> 'questId'
    LEFT JOIN documents d ON d.id = q.document_id
    WHERE b.kind = 'quest_discord_delivery'
      AND (sqlc.narg(delivery_state)::text IS NULL OR b.state = sqlc.narg(delivery_state))
), page AS (
    SELECT * FROM matching ORDER BY updated_at DESC, public_id LIMIT sqlc.arg(page_limit)::integer OFFSET sqlc.arg(page_offset)::integer
)
SELECT (SELECT count(*) FROM matching)::bigint AS total,
       page.public_id, page.state, page.attempts, page.redrive_count, page.safe_error_code,
       page.next_run_at, page.created_at, page.updated_at, page.quest_public_id, page.quest_short_code,
       page.quest_title, page.discord_desired_revision, page.discord_applied_revision, page.discord_message_id,
       page.event_url
FROM (SELECT 1) marker LEFT JOIN page ON true;
-- name: SiteLockDiscordDeliveryJob :one
SELECT b.public_id, b.state, b.attempts, b.redrive_count, b.lease_token, b.next_run_at, b.created_at, b.updated_at,
       b.completion_operation, b.completion_payload, b.error_message, b.safe_error_code,
       q.public_id AS quest_public_id, q.discord_desired_revision, q.discord_applied_revision
FROM background_jobs b
LEFT JOIN quests q ON q.public_id::text = b.payload ->> 'questId'
WHERE b.public_id = sqlc.arg(job_id)::uuid AND b.kind = 'quest_discord_delivery'
FOR UPDATE OF b;
-- name: SiteRedriveDiscordDeliveryJob :one
UPDATE background_jobs
SET state = 'queued',
    attempts = 0,
    error_message = NULL,
    completion_operation = NULL,
    completion_payload = NULL,
    lease_expires_at = NULL,
    claimed_at = NULL,
    attempt_deadline_at = NULL,
    safe_error_code = NULL,
    next_run_at = sqlc.arg(next_run_at)::timestamptz,
    redrive_count = redrive_count + 1,
    updated_at = sqlc.arg(at)::timestamptz
WHERE public_id = sqlc.arg(job_id)::uuid AND kind = 'quest_discord_delivery'
RETURNING public_id, state, attempts, redrive_count, next_run_at, updated_at;
-- Active alerts are derived from durable background_jobs / bot_heartbeats evidence.
-- N8 removed operational_observations from the squashed schema; do not invent that table.
-- name: SiteActiveAlerts :many
WITH job_alerts AS (
    SELECT
        ('job:' || public_id::text || ':state:' || state)::text AS key,
        CASE state
            WHEN 'dead' THEN 'Background job is dead'
            WHEN 'repair_required' THEN 'Background job requires repair'
            ELSE 'Background job needs attention'
        END::text AS label,
        'warning'::text AS severity,
        '/admin/operations'::text AS remediation_href,
        created_at AS first_seen_at,
        updated_at AS last_seen_at
    FROM background_jobs
    WHERE state IN ('dead', 'repair_required')
),
heartbeat_alerts AS (
    SELECT
        'bot:heartbeat:stale'::text AS key,
        'Bot heartbeat is stale'::text AS label,
        'warning'::text AS severity,
        '/admin/operations'::text AS remediation_href,
        latest.received_at AS first_seen_at,
        latest.received_at AS last_seen_at
    FROM (SELECT max(received_at) AS received_at FROM bot_heartbeats) latest
    WHERE latest.received_at IS NULL
       OR latest.received_at < clock_timestamp() - interval '3 minutes'
),
alerts AS (
    SELECT * FROM job_alerts
    UNION ALL
    SELECT * FROM heartbeat_alerts
),
page AS (
    SELECT * FROM alerts
    ORDER BY last_seen_at DESC NULLS LAST, key ASC
    LIMIT sqlc.arg(page_limit)::integer OFFSET sqlc.arg(page_offset)::integer
)
SELECT (SELECT count(*)::integer FROM alerts) AS total,
       page.key, page.label, page.severity, page.remediation_href,
       page.first_seen_at, page.last_seen_at
FROM (SELECT 1) marker
LEFT JOIN page ON true
ORDER BY page.last_seen_at DESC NULLS LAST, page.key ASC NULLS LAST;
-- name: SiteActiveAlertCount :one
WITH job_alerts AS (
    SELECT public_id
    FROM background_jobs
    WHERE state IN ('dead', 'repair_required')
),
heartbeat_alerts AS (
    SELECT 1
    FROM (SELECT max(received_at) AS received_at FROM bot_heartbeats) latest
    WHERE latest.received_at IS NULL
       OR latest.received_at < clock_timestamp() - interval '3 minutes'
)
SELECT (SELECT count(*)::integer FROM job_alerts)
     + (SELECT count(*)::integer FROM heartbeat_alerts) AS total;
