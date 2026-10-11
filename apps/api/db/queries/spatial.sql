-- name: GetMapByAtlasCode :one
SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind AS family, r.public_id AS region_id, m.cols, m.rows
FROM maps m
LEFT JOIN regions r ON r.id = m.region_id
WHERE m.atlas_code = $1;

-- name: ListMaps :many
SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind AS family, r.public_id AS region_id, m.cols, m.rows
FROM maps m
LEFT JOIN regions r ON r.id = m.region_id
WHERE ($1::text IS NULL OR m.map_kind = $1)
ORDER BY m.name;

-- name: ListRegions :many
SELECT public_id AS id, name, kind
FROM regions
WHERE ($1::text IS NULL OR kind = $1)
ORDER BY name;

-- name: GetGameCalendar :one
SELECT definition FROM game_calendar WHERE id = 1;

-- name: GetGameDayForRealDate :one
SELECT game_day FROM game_time_map WHERE real_date = $1;

-- name: GetHexByMapColRow :one
SELECT h.public_id AS id, m.public_id AS map_id, h.col, h.row, h.terrain, h.elevation, h.climate
FROM hexes h
JOIN maps m ON m.id = h.map_id
WHERE m.public_id = sqlc.arg(map_id) AND h.col = sqlc.arg(col) AND h.row = sqlc.arg(row);

-- name: ListHexesForMap :many
SELECT h.public_id AS id, m.public_id AS map_id, h.col, h.row, h.terrain, h.elevation, h.climate
FROM hexes h
JOIN maps m ON m.id = h.map_id
WHERE m.public_id = sqlc.arg(map_id)
ORDER BY h.row, h.col
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountHexesForMap :one
SELECT count(*)::int
FROM hexes h
JOIN maps m ON m.id = h.map_id
WHERE m.public_id = $1;

-- name: ListHexChanges :many
SELECT hc.public_id AS id, h.public_id AS hex_id, hc.kind, hc.payload, hc.created_at
FROM hex_changes hc
JOIN hexes h ON h.id = hc.hex_id
WHERE h.public_id = sqlc.arg(hex_id)
ORDER BY hc.created_at DESC
LIMIT sqlc.arg(row_limit);

-- name: CountRegionHexes :one
SELECT count(*)::int FROM hexes h
JOIN maps m ON m.id = h.map_id
JOIN regions r ON r.id = m.region_id
WHERE r.public_id = $1;

-- name: CountOpenQuestsInRegion :one
SELECT count(*)::int FROM quests q
JOIN quest_regions qr ON qr.quest_id = q.id
JOIN regions r ON r.id = qr.region_id
WHERE r.public_id = $1 AND q.status = 'open';

-- name: UpsertGameTimeMapDay :exec
INSERT INTO game_time_map (real_date, game_day)
VALUES ($1, $2)
ON CONFLICT (real_date) DO UPDATE SET game_day = EXCLUDED.game_day;

-- name: ListMapPlaces :many
SELECT h.public_id AS hex_id, h.col, h.row, d.public_id AS document_id, d.slug, d.title, COALESCE(d.category, '') AS category,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id, author.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      FALSE, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[]), FALSE)::boolean AS admin_override
FROM maps m
JOIN hexes h ON h.map_id = m.id
JOIN hex_entry_links hel ON hel.hex_id = h.id
JOIN documents d ON d.id = hel.document_id
LEFT JOIN members author ON author.id = d.author_id
WHERE m.atlas_code = sqlc.arg(atlas_code)
  AND d.deleted_at IS NULL AND d.status = 'published'
  AND d.kind = 'codex_entry' AND d.category LIKE 'location/%'
  AND document_readable(d.public_id, author.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])
ORDER BY d.title, d.id, h.id
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountMapPlaces :one
SELECT count(*)::int AS total,
       COALESCE(bool_or(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id, author.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      FALSE, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])), FALSE)::boolean AS admin_override
FROM maps m
JOIN hexes h ON h.map_id = m.id
JOIN hex_entry_links hel ON hel.hex_id = h.id
JOIN documents d ON d.id = hel.document_id
LEFT JOIN members author ON author.id = d.author_id
WHERE m.atlas_code = sqlc.arg(atlas_code)
  AND d.deleted_at IS NULL AND d.status = 'published'
  AND d.kind = 'codex_entry' AND d.category LIKE 'location/%'
  AND document_readable(d.public_id, author.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])
;

-- name: CountRecentHexChangesForMap :one
SELECT count(*)::int
FROM hex_changes hc
JOIN hexes h ON h.id = hc.hex_id
JOIN maps m ON m.id = h.map_id
WHERE m.atlas_code = $1 AND hc.created_at > now() - interval '30 days';
