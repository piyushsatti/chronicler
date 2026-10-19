-- Document discovery projections for Site home feed, document search, and counts.
-- Visibility always goes through document_readable; Site never reads raw protected text.

-- name: DocumentRecentDiscovery :many
WITH readable AS (
    SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility,
           d.body, d.frontmatter_yaml, d.policy, author.public_id AS author_id,
           d.published_at, d.deleted_at, d.updated_at, d.version,
           COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(
             d.public_id, author.public_id, d.status, d.visibility, d.policy, sqlc.narg(viewer_id)::uuid,
             sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text, FALSE,
             sqlc.arg(viewer_live_dm)::boolean,
             COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr
                            JOIN members reader ON reader.id = dr.member_id
                            WHERE dr.document_id = d.id), ARRAY[]::uuid[])), FALSE) AS admin_override
    FROM documents d
    LEFT JOIN members author ON author.id = d.author_id
    WHERE d.deleted_at IS NULL
      AND d.status = 'published'
      AND document_readable(
            d.public_id, author.public_id, d.status, d.visibility, d.policy,
            sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
            sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
            COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr
                           JOIN members reader ON reader.id = dr.member_id
                           WHERE dr.document_id = d.id), ARRAY[]::uuid[]))
),
ranked AS (
    SELECT readable.*,
           ROW_NUMBER() OVER (
             PARTITION BY category
             ORDER BY updated_at DESC, id DESC
           ) AS doc_rank,
           MAX(updated_at) OVER (PARTITION BY category) AS bucket_updated_at
    FROM readable
),
top_docs AS (
    SELECT * FROM ranked WHERE doc_rank <= 5
),
top_buckets AS (
    SELECT category, MAX(bucket_updated_at) AS bucket_updated_at
    FROM top_docs
    GROUP BY category
    ORDER BY MAX(bucket_updated_at) DESC, category ASC NULLS LAST
    LIMIT 6
)
SELECT d.id, d.kind, d.slug, d.title, d.category, d.status, d.visibility,
       d.body, d.frontmatter_yaml, d.policy, d.author_id, d.published_at,
       d.deleted_at, d.updated_at, d.version, d.admin_override, d.doc_rank,
       b.bucket_updated_at
FROM top_docs d
JOIN top_buckets b ON d.category IS NOT DISTINCT FROM b.category
ORDER BY b.bucket_updated_at DESC, d.category ASC NULLS LAST, d.doc_rank ASC;

-- name: DocumentDiscoveryCountsByKind :many
SELECT d.kind AS key, count(*)::integer AS count
FROM documents d
LEFT JOIN members author ON author.id = d.author_id
WHERE d.deleted_at IS NULL
  AND d.status = 'published'
  AND document_readable(
        d.public_id, author.public_id, d.status, d.visibility, d.policy,
        sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
        sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
        COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr
                       JOIN members reader ON reader.id = dr.member_id
                       WHERE dr.document_id = d.id), ARRAY[]::uuid[]))
GROUP BY d.kind
ORDER BY d.kind;

-- name: DocumentDiscoveryCountsByCategory :many
SELECT d.category AS key, count(*)::integer AS count
FROM documents d
LEFT JOIN members author ON author.id = d.author_id
WHERE d.deleted_at IS NULL
  AND d.status = 'published'
  AND document_readable(
        d.public_id, author.public_id, d.status, d.visibility, d.policy,
        sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
        sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
        COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr
                       JOIN members reader ON reader.id = dr.member_id
                       WHERE dr.document_id = d.id), ARRAY[]::uuid[]))
GROUP BY d.category
ORDER BY d.category ASC NULLS LAST;

-- name: DocumentSearchDiscovery :many
-- Title-only ranking/matching: raw body must not influence hits before scoped projection.
WITH population AS (
    SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility,
           d.body, d.frontmatter_yaml, d.policy, author.public_id AS author_id,
           d.published_at, d.deleted_at, d.updated_at, d.version,
           ts_rank(
             to_tsvector('english', coalesce(d.title, '')),
             plainto_tsquery('english', sqlc.arg(query)::text)
           ) AS rank
    FROM documents d
    LEFT JOIN members author ON author.id = d.author_id
    WHERE d.deleted_at IS NULL
      AND d.status = 'published'
      AND (cardinality(sqlc.arg(kinds)::text[]) = 0 OR d.kind = ANY(sqlc.arg(kinds)::text[]))
      AND document_readable(
            d.public_id, author.public_id, d.status, d.visibility, d.policy,
            sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
            sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
            COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr
                           JOIN members reader ON reader.id = dr.member_id
                           WHERE dr.document_id = d.id), ARRAY[]::uuid[]))
      AND (
            sqlc.arg(query)::text = ''
            OR to_tsvector('english', coalesce(d.title, ''))
               @@ plainto_tsquery('english', sqlc.arg(query)::text)
          )
),
page AS (
    SELECT * FROM population
    ORDER BY rank DESC, updated_at DESC, id DESC
    LIMIT sqlc.arg(page_limit)::integer OFFSET sqlc.arg(page_offset)::integer
)
SELECT (SELECT count(*)::integer FROM population) AS total,
       page.id, page.kind, page.slug, page.title, page.category, page.status, page.visibility,
       page.body, page.frontmatter_yaml, page.policy, page.author_id, page.published_at,
       page.deleted_at, page.updated_at, page.version, page.rank
FROM (SELECT 1) marker
LEFT JOIN page ON true
ORDER BY page.rank DESC NULLS LAST, page.updated_at DESC NULLS LAST, page.id DESC NULLS LAST;
