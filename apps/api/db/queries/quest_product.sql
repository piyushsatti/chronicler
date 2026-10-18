-- QUE03 owns the named SQL implementation after P04, QUE02.
-- Responsibility: Complete named set SQL projections, filters,count,page,locks,writes,histories; sqlc sources.
-- Acceptance: TASK-QUE03, AUTH-quest, BATCH-quest.

-- Product query code supplies one stable AsOf value for each read task.
-- name: ProductQuestDisplayStatusAt :one
SELECT quest_display_status_at(@status::text, @filled_count::integer, @scheduled_at::timestamptz, @duration_hours::double precision, @as_of::timestamptz)::text AS display_status;

-- DM summaries are authored by the Quest's DM. Their visibility remains governed
-- by the ordinary Document readable predicate for the requesting viewer.
-- name: ProductQuestDmSummariesPage :many
WITH filtered AS (
    SELECT DISTINCT d.id, d.public_id, d.kind, d.slug, d.title, d.category, d.status,
           d.visibility, d.body, d.policy, author.public_id AS author_public_id,
           d.published_at, d.deleted_at, d.created_at, d.updated_at,
           COALESCE(@viewer_admin::boolean AND NOT document_readable(
               d.public_id, author.public_id, d.status, d.visibility, d.policy,
               @viewer_id::uuid, @viewer_roles::text[], @viewer_handle::text,
               FALSE, @viewer_live_dm::boolean, @reader_ids::uuid[]), FALSE) AS admin_override
    FROM document_links dl
    JOIN documents d ON d.id = dl.source_id
    JOIN members author ON author.id = d.author_id
    JOIN quests q ON q.id = dl.quest_target_id
    WHERE dl.quest_target_id IS NOT NULL
      AND d.kind = 'summary'
      AND d.deleted_at IS NULL
      AND author.public_id = @dm_id::uuid
      AND q.dm_id = author.id
      AND (@quest_id::uuid IS NULL OR q.public_id = @quest_id::uuid)
      AND (@search::text IS NULL OR d.title ILIKE '%' || replace(replace(replace(@search::text, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
      AND document_readable(d.public_id, author.public_id, d.status, d.visibility, d.policy,
          @viewer_id::uuid, @viewer_roles::text[], @viewer_handle::text,
          @viewer_admin::boolean, @viewer_live_dm::boolean, @reader_ids::uuid[])
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY updated_at DESC, public_id DESC
    LIMIT @row_limit::integer OFFSET @row_offset::integer
)
SELECT counted.total, page.id, page.public_id, page.kind, page.slug, page.title,
       page.category, page.status, page.visibility, page.body, page.policy,
       page.author_public_id, page.published_at, page.deleted_at, page.created_at,
       page.updated_at, page.admin_override
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.updated_at DESC NULLS LAST, page.public_id DESC NULLS LAST;

-- name: ProductQuestReadByID :one
SELECT q.id, q.public_id, q.short_code, q.kinds, q.status,
       quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, @as_of::timestamptz) AS display_status,
       dm.public_id AS dm_public_id, q.arc_id, arc.public_id AS arc_public_id,
       q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
       doc.public_id AS document_public_id, q.tags, q.genres, q.avg_party_level AS apl,
       q.signup_type, q.discord_desired_revision, q.discord_applied_revision,
       q.discord_message_id, q.discord_event_id, q.event_url,
       creator.public_id AS created_by_public_id, q.created_at, q.updated_at,
       q.closed_at, q.deleted_at, deleted_by.public_id AS deleted_by_public_id
FROM quests q
JOIN members dm ON dm.id = q.dm_id
JOIN members creator ON creator.id = q.created_by
JOIN documents doc ON doc.id = q.document_id
LEFT JOIN quest_arcs arc ON arc.id = q.arc_id
LEFT JOIN members deleted_by ON deleted_by.id = q.deleted_by
WHERE q.public_id = @quest_id::uuid;

-- name: ProductQuestReadByShortCode :one
SELECT q.id, q.public_id, q.short_code, q.kinds, q.status,
       quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, @as_of::timestamptz) AS display_status,
       dm.public_id AS dm_public_id, q.arc_id, arc.public_id AS arc_public_id,
       q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
       doc.public_id AS document_public_id, q.tags, q.genres, q.avg_party_level AS apl,
       q.signup_type, q.discord_desired_revision, q.discord_applied_revision,
       q.discord_message_id, q.discord_event_id, q.event_url,
       creator.public_id AS created_by_public_id, q.created_at, q.updated_at,
       q.closed_at, q.deleted_at, deleted_by.public_id AS deleted_by_public_id
FROM quests q
JOIN members dm ON dm.id = q.dm_id
JOIN members creator ON creator.id = q.created_by
JOIN documents doc ON doc.id = q.document_id
LEFT JOIN quest_arcs arc ON arc.id = q.arc_id
LEFT JOIN members deleted_by ON deleted_by.id = q.deleted_by
WHERE q.short_code = @short_code::text;

-- name: ProductQuestLockByID :one
SELECT q.id, q.public_id, q.short_code, q.kinds, q.status, q.dm_id,
       q.arc_id, q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
       q.document_id, q.tags, q.genres, q.avg_party_level, q.signup_type,
       q.discord_desired_revision, q.discord_applied_revision,
       q.discord_message_id, q.discord_event_id, q.event_url,
       q.created_by, q.created_at, q.updated_at, q.closed_at, q.deleted_at,
       q.deleted_by
FROM quests q
WHERE q.public_id = @quest_id::uuid
FOR UPDATE OF q;

-- name: ProductQuestReadHexes :many
SELECT h.public_id::text AS hex_id, q.public_id::text AS quest_id, qh.role
FROM quest_hexes qh
JOIN quests q ON q.id = qh.quest_id
JOIN hexes h ON h.id = qh.hex_id
WHERE q.public_id = @quest_id::uuid
ORDER BY h.public_id, qh.role;

-- name: ProductQuestReadRegions :many
SELECT r.public_id::text AS region_id
FROM quest_regions qr
JOIN quests q ON q.id = qr.quest_id
JOIN regions r ON r.id = qr.region_id
WHERE q.public_id = @quest_id::uuid
ORDER BY r.public_id;

-- name: ProductQuestReadParticipants :many
SELECT q.public_id::text AS quest_id, m.public_id::text AS member_id,
       c.public_id::text AS character_id, c.name AS character_name,
       m.handle AS member_handle, m.display_name AS member_display_name,
       m.avatar_url AS member_avatar_url, qp.status, qp.manual,
       qp.created_at, qp.updated_at
FROM quest_participants qp
JOIN quests q ON q.id = qp.quest_id
JOIN members m ON m.id = qp.member_id
JOIN characters c ON c.id = qp.character_id
WHERE q.public_id = @quest_id::uuid
  AND (@status::text IS NULL OR qp.status = @status::text)
ORDER BY qp.created_at, c.public_id;

-- name: ProductQuestCountParticipants :one
SELECT count(*)::bigint AS total
FROM quest_participants qp
JOIN quests q ON q.id = qp.quest_id
WHERE q.public_id = @quest_id::uuid
  AND (@status::text IS NULL OR qp.status = @status::text);

-- Count and page use the same predicate. The left-joined empty page retains the
-- real total without fabricating a quest row or sentinel identity.
-- name: ProductQuestListPage :many
WITH filtered AS (
    SELECT q.id, q.public_id, q.short_code, q.kinds, q.status,
           quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, @as_of::timestamptz) AS display_status,
           q.dm_id, dm.public_id AS dm_public_id, q.arc_id, arc.public_id AS arc_public_id,
           q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
           q.document_id, doc.public_id AS document_public_id, q.tags, q.genres,
           q.avg_party_level AS apl, q.signup_type, q.discord_desired_revision,
           q.discord_applied_revision, q.discord_message_id, q.discord_event_id,
           q.event_url, q.created_by, creator.public_id AS created_by_public_id,
           q.created_at, q.updated_at, q.closed_at, q.deleted_at,
           deleted_by.public_id AS deleted_by_public_id
    FROM quests q
    JOIN members dm ON dm.id = q.dm_id
    JOIN members creator ON creator.id = q.created_by
    JOIN documents doc ON doc.id = q.document_id
    LEFT JOIN quest_arcs arc ON arc.id = q.arc_id
    LEFT JOIN members deleted_by ON deleted_by.id = q.deleted_by
    WHERE q.deleted_at IS NULL
      AND (@status::text IS NULL OR q.status = @status::text)
      AND (@display_status::text IS NULL OR quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, @as_of::timestamptz) = @display_status::text)
      AND (@dm_id::uuid IS NULL OR dm.public_id = @dm_id::uuid)
      AND (@arc_id::uuid IS NULL OR arc.public_id = @arc_id::uuid)
      AND (@kind::text IS NULL OR q.kinds @> ARRAY[@kind::text]::text[])
      AND (@region_id::uuid IS NULL OR EXISTS (
          SELECT 1 FROM quest_regions qr JOIN regions r ON r.id = qr.region_id
          WHERE qr.quest_id = q.id AND r.public_id = @region_id::uuid
      ))
      AND (NOT @tag_filter_set::boolean OR q.tags && @tag_variants::text[])
      AND (NOT @genre_filter_set::boolean OR q.genres && @genre_variants::text[])
      AND (cardinality(@short_codes::text[]) = 0 OR q.short_code = ANY(@short_codes::text[]))
      AND (@scheduled_from::timestamptz IS NULL OR q.scheduled_at >= @scheduled_from::timestamptz)
      AND (@scheduled_to::timestamptz IS NULL OR q.scheduled_at < @scheduled_to::timestamptz)
      AND (@search::text IS NULL OR q.short_code ILIKE '%' || replace(replace(replace(@search::text, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY scheduled_at ASC, public_id ASC
    LIMIT @row_limit::integer OFFSET @row_offset::integer
)
SELECT counted.total, page.id, page.public_id, page.short_code, page.kinds,
       page.status, page.display_status, page.dm_public_id, page.arc_public_id,
       page.scheduled_at, page.duration_hours, page.slots_max, page.filled_count,
       page.document_public_id, page.tags, page.genres, page.apl, page.signup_type,
       page.discord_desired_revision, page.discord_applied_revision,
       page.discord_message_id, page.discord_event_id, page.event_url,
       page.created_by_public_id, page.created_at, page.updated_at, page.closed_at,
       page.deleted_at, page.deleted_by_public_id
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.scheduled_at ASC NULLS LAST, page.public_id ASC NULLS LAST;

-- name: ProductQuestBoardPage :many
WITH filtered AS (
    SELECT q.id, q.public_id, q.short_code, q.kinds, q.status,
           quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, @as_of::timestamptz) AS display_status,
           dm.public_id AS dm_public_id, q.arc_id, arc.public_id AS arc_public_id,
           q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
           doc.public_id AS document_public_id, q.tags, q.genres, q.avg_party_level AS apl,
           q.signup_type, q.discord_desired_revision, q.discord_applied_revision,
           q.discord_message_id, q.discord_event_id, q.event_url,
           creator.public_id AS created_by_public_id, q.created_at, q.updated_at
    FROM quests q
    JOIN members dm ON dm.id = q.dm_id
    JOIN members creator ON creator.id = q.created_by
    JOIN documents doc ON doc.id = q.document_id
    LEFT JOIN quest_arcs arc ON arc.id = q.arc_id
    WHERE q.deleted_at IS NULL
      AND q.status IN ('open', 'full')
      AND q.scheduled_at >= @as_of::timestamptz
      AND (@region_id::uuid IS NULL OR EXISTS (
          SELECT 1 FROM quest_regions qr JOIN regions r ON r.id = qr.region_id
          WHERE qr.quest_id = q.id AND r.public_id = @region_id::uuid
      ))
), counted AS (SELECT count(*)::bigint AS total FROM filtered),
page AS (
    SELECT * FROM filtered ORDER BY scheduled_at, public_id
    LIMIT @row_limit::integer OFFSET @row_offset::integer
)
SELECT counted.total, page.id, page.public_id, page.short_code, page.kinds,
       page.status, page.display_status, page.dm_public_id, page.arc_public_id,
       page.scheduled_at, page.duration_hours, page.slots_max, page.filled_count,
       page.document_public_id, page.tags, page.genres, page.apl, page.signup_type,
       page.discord_desired_revision, page.discord_applied_revision,
       page.discord_message_id, page.discord_event_id, page.event_url,
       page.created_by_public_id, page.created_at, page.updated_at
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.scheduled_at ASC NULLS LAST, page.public_id ASC NULLS LAST;

-- name: ProductQuestRecentlyClosedPage :many
WITH filtered AS (
    SELECT q.id, q.public_id, q.short_code, q.kinds, q.status,
           quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, @as_of::timestamptz) AS display_status,
           dm.public_id AS dm_public_id, arc.public_id AS arc_public_id,
           q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
           doc.public_id AS document_public_id, q.tags, q.genres,
           q.avg_party_level AS apl, q.signup_type, q.discord_desired_revision,
           q.discord_applied_revision, q.discord_message_id, q.discord_event_id,
           q.event_url, creator.public_id AS created_by_public_id,
           q.created_at, q.updated_at, q.closed_at
    FROM quests q
    JOIN members dm ON dm.id = q.dm_id
    JOIN members creator ON creator.id = q.created_by
    JOIN documents doc ON doc.id = q.document_id
    LEFT JOIN quest_arcs arc ON arc.id = q.arc_id
    WHERE q.deleted_at IS NULL
      AND q.status = 'closed'
      AND q.closed_at IS NOT NULL
      AND (@closed_since::timestamptz IS NULL OR q.closed_at >= @closed_since::timestamptz)
      AND (@region_id::uuid IS NULL OR EXISTS (
          SELECT 1 FROM quest_regions qr JOIN regions r ON r.id = qr.region_id
          WHERE qr.quest_id = q.id AND r.public_id = @region_id::uuid
      ))
), counted AS (SELECT count(*)::bigint AS total FROM filtered),
page AS (
    SELECT * FROM filtered ORDER BY closed_at DESC, public_id DESC
    LIMIT @row_limit::integer OFFSET @row_offset::integer
)
SELECT counted.total, page.*
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.closed_at DESC NULLS LAST, page.public_id DESC NULLS LAST;

-- name: ProductQuestOpenSeatsPage :many
WITH filtered AS (
    SELECT q.id, q.public_id, q.short_code, q.dm_id, dm.public_id AS dm_public_id,
           q.scheduled_at, q.slots_max, q.filled_count,
           (q.slots_max - q.filled_count)::integer AS open_seats,
           q.status, q.document_id,
           ARRAY(SELECT r.public_id::text FROM quest_regions qr
                 JOIN regions r ON r.id = qr.region_id
                 WHERE qr.quest_id = q.id ORDER BY r.public_id) AS region_ids
    FROM quests q
    JOIN members dm ON dm.id = q.dm_id
    WHERE q.deleted_at IS NULL AND q.status = 'open'
      AND q.slots_max > q.filled_count
      AND (@dm_id::uuid IS NULL OR dm.public_id = @dm_id::uuid)
      AND (@region_id::uuid IS NULL OR EXISTS (
          SELECT 1 FROM quest_regions qr JOIN regions r ON r.id = qr.region_id
          WHERE qr.quest_id = q.id AND r.public_id = @region_id::uuid
      ))
), counted AS (SELECT count(*)::bigint AS total FROM filtered),
page AS (
    SELECT * FROM filtered ORDER BY scheduled_at, public_id
    LIMIT @row_limit::integer OFFSET @row_offset::integer
)
SELECT counted.total, page.id, page.public_id, page.short_code,
       page.dm_public_id, page.scheduled_at, page.slots_max, page.filled_count,
       page.open_seats, page.status, page.region_ids
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.scheduled_at ASC NULLS LAST, page.public_id ASC NULLS LAST;

-- name: ProductQuestGenreOptions :many
SELECT DISTINCT genre
FROM quests q
CROSS JOIN LATERAL unnest(q.genres) AS genre
WHERE q.deleted_at IS NULL
ORDER BY genre;

-- name: ProductQuestMySignupsPage :many
WITH filtered AS (
    SELECT q.public_id::text AS quest_id, m.public_id::text AS member_id,
           c.public_id::text AS character_id, c.name AS character_name,
           m.handle AS member_handle, m.display_name AS member_display_name,
           m.avatar_url AS member_avatar_url, qp.status, qp.manual,
           qp.created_at, qp.updated_at, q.scheduled_at, q.short_code,
           quest_display_status_at(q.status, q.filled_count, q.scheduled_at,
               q.duration_hours, @as_of::timestamptz) AS display_status
    FROM quest_participants qp
    JOIN quests q ON q.id = qp.quest_id
    JOIN members m ON m.id = qp.member_id
    JOIN characters c ON c.id = qp.character_id
    WHERE m.public_id = @member_id::uuid
      AND qp.status <> 'withdrawn'
      AND q.deleted_at IS NULL
), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
), page AS (
    SELECT * FROM filtered
    ORDER BY scheduled_at ASC, quest_id ASC, character_id ASC
    LIMIT @row_limit::integer OFFSET @row_offset::integer
)
SELECT counted.total, page.quest_id, page.member_id, page.character_id,
       page.character_name, page.member_handle, page.member_display_name,
       page.member_avatar_url, page.status, page.manual, page.created_at,
       page.updated_at, page.scheduled_at, page.short_code, page.display_status
FROM counted LEFT JOIN page ON TRUE
ORDER BY page.scheduled_at ASC NULLS LAST, page.quest_id ASC NULLS LAST,
         page.character_id ASC NULLS LAST;

-- name: ProductQuestStateCounts :many
WITH filtered AS (
    SELECT q.status
    FROM quests q
    JOIN members dm ON dm.id = q.dm_id
    WHERE q.deleted_at IS NULL
      AND (@arc_id::uuid IS NULL OR EXISTS (SELECT 1 FROM quest_arcs a WHERE a.id = q.arc_id AND a.public_id = @arc_id::uuid))
      AND (@dm_id::uuid IS NULL OR dm.public_id = @dm_id::uuid)
      AND (@kind::text IS NULL OR q.kinds @> ARRAY[@kind::text]::text[])
      AND (@region_id::uuid IS NULL OR EXISTS (
          SELECT 1 FROM quest_regions qr JOIN regions r ON r.id = qr.region_id
          WHERE qr.quest_id = q.id AND r.public_id = @region_id::uuid
      ))
      AND (NOT @tag_filter_set::boolean OR q.tags && @tag_variants::text[])
      AND (NOT @genre_filter_set::boolean OR q.genres && @genre_variants::text[])
), counts AS (
    SELECT 'open'::text AS state, 1 AS sort_order, count(*) FILTER (WHERE status = 'open')::bigint AS count FROM filtered
    UNION ALL SELECT 'full'::text, 2, count(*) FILTER (WHERE status = 'full')::bigint FROM filtered
    UNION ALL SELECT 'played'::text, 3, count(*) FILTER (WHERE status = 'played')::bigint FROM filtered
    UNION ALL SELECT 'closed'::text, 4, count(*) FILTER (WHERE status = 'closed')::bigint FROM filtered
    UNION ALL SELECT 'cancelled'::text, 5, count(*) FILTER (WHERE status = 'cancelled')::bigint FROM filtered
)
SELECT state, count FROM counts ORDER BY sort_order;

-- name: ProductQuestReadArc :one
SELECT arc.id, arc.public_id, arc.name, creator.public_id AS created_by_public_id,
       arc.created_at, count(q.id)::integer AS quest_count
FROM quest_arcs arc
JOIN members creator ON creator.id = arc.created_by
LEFT JOIN quests q ON q.arc_id = arc.id AND q.deleted_at IS NULL
WHERE arc.public_id = @arc_id::uuid
GROUP BY arc.id, arc.public_id, arc.name, creator.public_id, arc.created_at;

-- name: ProductQuestListArcs :many
WITH filtered AS (
    SELECT arc.id, arc.public_id, arc.name, creator.public_id AS created_by_public_id,
           arc.created_at, count(q.id)::integer AS quest_count
    FROM quest_arcs arc
    JOIN members creator ON creator.id = arc.created_by
    LEFT JOIN quests q ON q.arc_id = arc.id AND q.deleted_at IS NULL
    GROUP BY arc.id, arc.public_id, arc.name, creator.public_id, arc.created_at
), counted AS (SELECT count(*)::bigint AS total FROM filtered),
page AS (
    SELECT * FROM filtered ORDER BY created_at DESC, public_id DESC
    LIMIT @row_limit::integer OFFSET @row_offset::integer
)
SELECT counted.total, page.* FROM counted LEFT JOIN page ON TRUE
ORDER BY page.created_at DESC NULLS LAST, page.public_id DESC NULLS LAST;

-- name: ProductQuestBatchRead :many
SELECT input.ordinality::integer AS input_index, input.public_id::uuid AS requested_id,
       q.id, q.public_id, q.short_code, q.kinds, q.status,
       quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, @as_of::timestamptz) AS display_status,
       dm.public_id AS dm_public_id, arc.public_id AS arc_public_id,
       q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
       doc.public_id AS document_public_id, q.tags, q.genres, q.avg_party_level AS apl,
       q.signup_type, q.discord_desired_revision, q.discord_applied_revision,
       q.discord_message_id, q.discord_event_id, q.event_url,
       creator.public_id AS created_by_public_id, q.created_at, q.updated_at
FROM unnest(@quest_ids::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
LEFT JOIN quests q ON q.public_id = input.public_id AND q.deleted_at IS NULL
LEFT JOIN members dm ON dm.id = q.dm_id
LEFT JOIN quest_arcs arc ON arc.id = q.arc_id
LEFT JOIN documents doc ON doc.id = q.document_id
LEFT JOIN members creator ON creator.id = q.created_by
ORDER BY input.ordinality;

-- name: ProductQuestBatchParticipants :many
SELECT input.ordinality::integer AS input_index, input.quest_id,
       qp.status AS filter_status, qp.character_id,
       q.public_id::text AS quest_public_id, m.public_id::text AS member_public_id,
       c.public_id::text AS character_public_id, c.name AS character_name,
       m.handle AS member_handle, m.display_name AS member_display_name,
       m.avatar_url AS member_avatar_url, qp.status, qp.manual,
       qp.created_at, qp.updated_at
FROM unnest(@quest_ids::uuid[]) WITH ORDINALITY AS input(quest_id, ordinality)
LEFT JOIN unnest(@statuses::text[]) WITH ORDINALITY AS status_input(status, ordinality)
  ON status_input.ordinality = input.ordinality
LEFT JOIN quests q ON q.public_id = input.quest_id AND q.deleted_at IS NULL
LEFT JOIN quest_participants qp ON qp.quest_id = q.id AND (status_input.status IS NULL OR qp.status = status_input.status)
LEFT JOIN members m ON m.id = qp.member_id
LEFT JOIN characters c ON c.id = qp.character_id
ORDER BY input.ordinality, qp.created_at, c.public_id;

-- Command locks and writes remain bound to the caller's existing transaction.
-- name: ProductQuestLockByShortCode :one
SELECT q.id, q.public_id, q.short_code, q.status, q.dm_id, q.arc_id,
       q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
       q.document_id, q.tags, q.genres, q.avg_party_level, q.signup_type,
       q.discord_desired_revision, q.discord_applied_revision,
       q.discord_message_id, q.discord_event_id, q.event_url,
       q.created_by, q.created_at, q.updated_at, q.closed_at, q.deleted_at,
       q.deleted_by
FROM quests q WHERE q.short_code = @short_code::text FOR UPDATE OF q;

-- name: ProductQuestInsert :one
INSERT INTO quests (
    short_code, kinds, dm_id, arc_id, scheduled_at, duration_hours, slots_max,
    document_id, tags, genres, avg_party_level, signup_type, created_by,
    created_at, updated_at
) VALUES (
    @short_code::text, @kinds::text[], @dm_id::bigint, @arc_id::bigint,
    @scheduled_at::timestamptz, @duration_hours::double precision,
    @slots_max::integer, @document_id::bigint, @tags::text[], @genres::text[],
    @apl::integer, @signup_type::text, @created_by::bigint,
    @at::timestamptz, @at::timestamptz
)
RETURNING id, public_id, short_code, status, scheduled_at, duration_hours,
          slots_max, filled_count, created_at, updated_at;

-- name: ProductQuestUpdateMetadata :one
UPDATE quests q SET
    kinds = @kinds::text[], dm_id = @dm_id::bigint, arc_id = @arc_id::bigint,
    scheduled_at = @scheduled_at::timestamptz,
    duration_hours = @duration_hours::double precision,
    slots_max = @slots_max::integer, tags = @tags::text[], genres = @genres::text[],
    avg_party_level = @apl::integer, signup_type = @signup_type::text,
    updated_at = @at::timestamptz
WHERE q.public_id = @quest_id::uuid AND q.updated_at = @expected_updated_at::timestamptz
RETURNING q.id, q.public_id, q.short_code, q.status, q.scheduled_at,
          q.duration_hours, q.slots_max, q.filled_count, q.updated_at;

-- name: ProductQuestSetStatus :one
UPDATE quests q SET status = @status::text,
    closed_at = CASE WHEN @status::text = 'closed' THEN @at::timestamptz ELSE q.closed_at END,
    updated_at = @at::timestamptz
WHERE q.public_id = @quest_id::uuid
RETURNING q.id, q.public_id, q.status, q.closed_at, q.updated_at;

-- name: ProductQuestSetDeleted :one
UPDATE quests q SET deleted_at = @deleted_at::timestamptz,
    deleted_by = @deleted_by::bigint, updated_at = @at::timestamptz
WHERE q.public_id = @quest_id::uuid
RETURNING q.id, q.public_id, q.deleted_at, q.deleted_by, q.updated_at;

-- name: ProductQuestSetArc :one
UPDATE quests q SET arc_id = @arc_id::bigint, updated_at = @at::timestamptz
WHERE q.public_id = @quest_id::uuid
RETURNING q.id, q.public_id, q.arc_id, q.updated_at;

-- name: ProductQuestInsertArc :one
INSERT INTO quest_arcs(name, created_by, created_at)
VALUES (@name::text, @created_by::bigint, @at::timestamptz)
RETURNING id, public_id, name, created_by, created_at;

-- name: ProductQuestUpdateArc :one
UPDATE quest_arcs SET name = @name::text
WHERE public_id = @arc_id::uuid
RETURNING id, public_id, name, created_by, created_at;

-- name: ProductQuestInsertParticipant :one
INSERT INTO quest_participants(quest_id, member_id, character_id, status, manual, created_at, updated_at)
VALUES (@quest_id::bigint, @member_id::bigint, @character_id::bigint,
        @status::text, @manual::boolean, @at::timestamptz, @at::timestamptz)
RETURNING quest_id, member_id, character_id, status, manual, created_at, updated_at;

-- name: ProductQuestUpdateParticipant :one
UPDATE quest_participants SET status = @status::text, manual = @manual::boolean,
       updated_at = @at::timestamptz
WHERE quest_id = @quest_id::bigint AND character_id = @character_id::bigint
RETURNING quest_id, member_id, character_id, status, manual, created_at, updated_at;

-- name: ProductQuestDeleteParticipant :execrows
DELETE FROM quest_participants
WHERE quest_id = @quest_id::bigint AND character_id = @character_id::bigint;

-- name: ProductQuestLockCapacity :one
SELECT q.id, q.public_id, q.status, q.slots_max, q.filled_count
FROM quests q WHERE q.id = @quest_id::bigint FOR UPDATE OF q;

-- name: ProductQuestIncrementCapacity :one
UPDATE quests q SET filled_count = q.filled_count + @delta::integer,
       status = CASE
           WHEN q.status = 'open' AND q.filled_count + @delta::integer >= q.slots_max THEN 'full'
           WHEN q.status = 'full' AND q.filled_count + @delta::integer < q.slots_max THEN 'open'
           ELSE q.status
       END,
       updated_at = @at::timestamptz
WHERE q.id = @quest_id::bigint
  AND q.filled_count + @delta::integer BETWEEN 0 AND q.slots_max
RETURNING q.id, q.public_id, q.status, q.slots_max, q.filled_count, q.updated_at;

-- name: ProductQuestReplaceHexes :exec
DELETE FROM quest_hexes WHERE quest_id = @quest_id::bigint;

-- name: ProductQuestInsertHexes :many
INSERT INTO quest_hexes(quest_id, hex_id, role)
SELECT @quest_id::bigint, h.id, (@roles::text[])[input.ordinality::integer]
FROM unnest(@hex_ids::bigint[]) WITH ORDINALITY AS input(hex_id, ordinality)
JOIN hexes h ON h.id = input.hex_id
RETURNING quest_id, hex_id, role;

-- name: ProductQuestReplaceRegions :exec
DELETE FROM quest_regions WHERE quest_id = @quest_id::bigint;

-- name: ProductQuestInsertRegions :many
INSERT INTO quest_regions(quest_id, region_id)
SELECT @quest_id::bigint, r.id
FROM unnest(@region_ids::bigint[]) AS input(region_id)
JOIN regions r ON r.id = input.region_id
RETURNING quest_id, region_id;

-- name: ProductQuestInsertHistory :one
INSERT INTO quest_changes(quest_id, actor_id, kind, facts, created_at)
VALUES (@quest_id::bigint, @actor_id::bigint, @kind::text, @facts::jsonb, @at::timestamptz)
RETURNING id, public_id, quest_id, actor_id, kind, facts, created_at;

-- name: ProductQuestReadHistory :many
SELECT qc.id, qc.public_id, q.public_id::text AS quest_id,
       actor.public_id::text AS actor_id, qc.kind, qc.facts, qc.created_at
FROM quest_changes qc
JOIN quests q ON q.id = qc.quest_id
JOIN members actor ON actor.id = qc.actor_id
WHERE q.public_id = @quest_id::uuid
ORDER BY qc.created_at DESC, qc.public_id DESC
LIMIT @row_limit::integer OFFSET @row_offset::integer;

-- name: ProductQuestUpsertRewardDecision :one
INSERT INTO quest_reward_decisions(quest_id, closure_change_id, decided_by, decided_at)
VALUES (@quest_id::bigint, @closure_change_id::bigint, @decided_by::bigint, @decided_at::timestamptz)
RETURNING public_id, quest_id, closure_change_id, decided_by, decided_at;

-- name: ProductQuestReadRewardDecisionCoverage :many
SELECT input.ordinality::integer AS input_index,
       input.quest_id::uuid AS requested_quest_id,
       q.public_id::text AS quest_id,
       q.status = 'closed' AS closed,
       (qrd.quest_id IS NOT NULL) AS has_full_closure_decision
FROM unnest(@quest_ids::uuid[]) WITH ORDINALITY AS input(quest_id, ordinality)
LEFT JOIN quests q ON q.public_id = input.quest_id AND q.deleted_at IS NULL
LEFT JOIN quest_reward_decisions qrd ON qrd.quest_id = q.id
ORDER BY input.ordinality;

-- name: ProductQuestInsertEntitlements :many
INSERT INTO quest_reward_entitlements(quest_id, character_id, awarded_by, awarded_at, pcxp, note)
SELECT @quest_id::bigint, input.character_id, @awarded_by::bigint,
       @awarded_at::timestamptz, (@pcxp_values::integer[])[input.ordinality::integer],
       (@notes::text[])[input.ordinality::integer]
FROM unnest(@character_ids::bigint[]) WITH ORDINALITY AS input(character_id, ordinality)
RETURNING id, public_id, quest_id, character_id, awarded_by, awarded_at, pcxp, note, claimed_at, progression_entry_id;

-- name: ProductQuestReadEntitlements :many
SELECT e.id, e.public_id, q.public_id::text AS quest_id,
       c.public_id::text AS character_id, actor.public_id::text AS awarded_by,
       e.awarded_at, e.pcxp, e.note, e.claimed_at,
       e.progression_entry_id
FROM quest_reward_entitlements e
JOIN quests q ON q.id = e.quest_id
JOIN characters c ON c.id = e.character_id
JOIN members actor ON actor.id = e.awarded_by
WHERE q.public_id = @quest_id::uuid
ORDER BY e.awarded_at, e.public_id;

-- name: ProductQuestBatchReadEntitlements :many
SELECT input.ordinality::integer AS input_index,
       input.quest_id::uuid AS requested_quest_id,
       e.id, e.public_id, q.public_id::text AS quest_id,
       c.public_id::text AS character_id, actor.public_id::text AS awarded_by,
       e.awarded_at, e.pcxp, e.note, e.claimed_at, e.progression_entry_id
FROM unnest(@quest_ids::uuid[]) WITH ORDINALITY AS input(quest_id, ordinality)
LEFT JOIN quests q ON q.public_id = input.quest_id AND q.deleted_at IS NULL
LEFT JOIN quest_reward_entitlements e ON e.quest_id = q.id
LEFT JOIN characters c ON c.id = e.character_id
LEFT JOIN members actor ON actor.id = e.awarded_by
ORDER BY input.ordinality, e.awarded_at, e.public_id;
