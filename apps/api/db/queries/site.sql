-- name: CountMembersSite :one
SELECT count(*)::int FROM members WHERE status = 'active';

-- name: GetSiteSetting :one
SELECT key, payload FROM site_settings WHERE key = $1;
