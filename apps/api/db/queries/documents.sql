-- name: GetDocumentByID :one
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility, d.body, d.policy,
       m.public_id AS author_id, d.published_at, d.deleted_at
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.public_id = sqlc.arg(document_id) AND d.deleted_at IS NULL;

-- name: GetDocumentBySlug :one
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility, d.body, d.policy,
       m.public_id AS author_id, d.published_at, d.deleted_at
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.slug = sqlc.arg(slug) AND d.deleted_at IS NULL;

-- name: ListDocuments :many
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility, d.body, d.policy,
       m.public_id AS author_id, d.published_at, d.deleted_at,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id, m.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      FALSE, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[]), FALSE)::boolean AS admin_override
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.deleted_at IS NULL
  AND (sqlc.narg(kind)::text IS NULL OR d.kind = sqlc.narg(kind))
  AND (sqlc.narg(category)::text IS NULL OR d.category = sqlc.narg(category))
  AND (sqlc.narg(status)::text IS NULL OR d.status = sqlc.narg(status))
  AND (sqlc.narg(visibility)::text IS NULL OR d.visibility = sqlc.narg(visibility))
  AND (sqlc.narg(search)::text IS NULL OR d.title ILIKE '%' || sqlc.narg(search) || '%')
  AND document_readable(d.public_id, m.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])
ORDER BY d.updated_at DESC, d.id DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountDocuments :one
SELECT count(*)::bigint AS total,
       COALESCE(bool_or(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id, m.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      FALSE, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])), FALSE)::boolean AS admin_override
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.deleted_at IS NULL
  AND (sqlc.narg(kind)::text IS NULL OR d.kind = sqlc.narg(kind))
  AND (sqlc.narg(category)::text IS NULL OR d.category = sqlc.narg(category))
  AND (sqlc.narg(status)::text IS NULL OR d.status = sqlc.narg(status))
  AND (sqlc.narg(visibility)::text IS NULL OR d.visibility = sqlc.narg(visibility))
  AND (sqlc.narg(search)::text IS NULL OR d.title ILIKE '%' || sqlc.narg(search) || '%')
  AND document_readable(d.public_id, m.public_id, d.status, d.visibility, d.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[]);

-- name: ListDocumentReaders :many
SELECT d.public_id
FROM document_readers dr
JOIN documents d ON d.id = dr.document_id
WHERE dr.member_id = (SELECT members.id FROM members WHERE members.public_id = sqlc.arg(member_id));

-- name: CountDocumentBacklinks :one
SELECT count(*)::bigint AS total,
       COALESCE(bool_or(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(src.public_id, author.public_id, src.status, src.visibility, src.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      FALSE, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])), FALSE)::boolean AS admin_override
FROM document_links dl
JOIN documents src ON src.id = dl.source_id AND src.deleted_at IS NULL
LEFT JOIN members author ON author.id = src.author_id
JOIN documents tgt ON tgt.id = dl.target_id AND tgt.deleted_at IS NULL
WHERE tgt.slug = sqlc.arg(slug)
  AND document_readable(src.public_id, author.public_id, src.status, src.visibility, src.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[]);

-- name: ListDocumentBacklinksBySlug :many
SELECT src.public_id AS source_id, tgt.public_id AS target_id, dl.relation, src.kind, src.slug,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(src.public_id, author.public_id, src.status, src.visibility, src.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      FALSE, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[]), FALSE)::boolean AS admin_override
FROM document_links dl
JOIN documents src ON src.id = dl.source_id AND src.deleted_at IS NULL
LEFT JOIN members author ON author.id = src.author_id
JOIN documents tgt ON tgt.id = dl.target_id AND tgt.deleted_at IS NULL
WHERE tgt.slug = sqlc.arg(slug)
  AND document_readable(src.public_id, author.public_id, src.status, src.visibility, src.policy,
      sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean, sqlc.arg(reader_ids)::uuid[])
ORDER BY src.updated_at DESC, src.id DESC, dl.relation;

-- name: ListDocumentRevisions :many
SELECT r.public_id AS id, d.public_id AS document_id, r.reason, r.title, r.created_at
FROM document_revisions r
JOIN documents d ON d.id = r.document_id
WHERE d.public_id = sqlc.arg(document_id)
ORDER BY r.created_at DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: GetDocumentRevisionAuthor :one
SELECT m.public_id AS author_id
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.public_id = sqlc.arg(document_id);

-- name: ListDocumentsTrash :many
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.status, d.visibility, d.body,
       m.public_id AS author_id, d.deleted_at
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.deleted_at IS NOT NULL
ORDER BY d.deleted_at DESC
LIMIT $1 OFFSET $2;
