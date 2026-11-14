-- name: GetMapByAtlasCode :one
SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind AS family, r.public_id AS region_id
FROM maps m
LEFT JOIN regions r ON r.id = m.region_id
WHERE m.atlas_code = $1;
-- name: ListMaps :many
SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind AS family, r.public_id AS region_id
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
-- name: UpsertGameTimeMapDay :exec
INSERT INTO game_time_map (real_date, game_day)
VALUES ($1, $2)
ON CONFLICT (real_date) DO UPDATE SET game_day = EXCLUDED.game_day;
