-- name: GetDocumentByID :one
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility, d.body,
       m.public_id AS author_id, d.published_at, d.deleted_at
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.public_id = $1 AND d.deleted_at IS NULL;

-- name: GetDocumentBySlug :one
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility, d.body,
       m.public_id AS author_id, d.published_at, d.deleted_at
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.slug = $1 AND d.deleted_at IS NULL;

-- name: ListDocuments :many
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility, d.body,
       m.public_id AS author_id, d.published_at, d.deleted_at
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.deleted_at IS NULL
  AND ($1::text IS NULL OR d.kind = $1)
  AND ($2::text IS NULL OR d.category = $2)
  AND ($3::text IS NULL OR d.status = $3)
  AND ($4::text IS NULL OR d.visibility = $4)
  AND ($5::text IS NULL OR d.title ILIKE '%' || $5 || '%')
ORDER BY d.updated_at DESC
LIMIT $6 OFFSET $7;

-- name: CountDocuments :one
SELECT count(*)::bigint
FROM documents
WHERE deleted_at IS NULL
  AND ($1::text IS NULL OR kind = $1)
  AND ($2::text IS NULL OR category = $2)
  AND ($3::text IS NULL OR status = $3)
  AND ($4::text IS NULL OR visibility = $4)
  AND ($5::text IS NULL OR title ILIKE '%' || $5 || '%');

-- name: ListDocumentReaders :many
SELECT d.public_id
FROM document_readers dr
JOIN documents d ON d.id = dr.document_id
WHERE dr.member_id = (SELECT members.id FROM members WHERE members.public_id = $1);

-- name: CountDocumentBacklinks :one
SELECT count(*)::bigint
FROM document_links
WHERE target_id = (SELECT id FROM documents WHERE slug = $1 AND deleted_at IS NULL);

-- name: ListDocumentBacklinksBySlug :many
SELECT src.public_id AS source_id, tgt.public_id AS target_id, dl.relation, src.kind, src.slug
FROM document_links dl
JOIN documents src ON src.id = dl.source_id AND src.deleted_at IS NULL
JOIN documents tgt ON tgt.id = dl.target_id
WHERE dl.target_id = (SELECT doc.id FROM documents doc WHERE doc.slug = $1 AND doc.deleted_at IS NULL);

-- name: ListDocumentRevisions :many
SELECT r.public_id AS id, d.public_id AS document_id, r.reason, r.title, r.created_at
FROM document_revisions r
JOIN documents d ON d.id = r.document_id
WHERE d.public_id = sqlc.arg(document_id)
ORDER BY r.created_at DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: ListDocumentsTrash :many
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.status, d.visibility, d.body,
       m.public_id AS author_id, d.deleted_at
FROM documents d
LEFT JOIN members m ON m.id = d.author_id
WHERE d.deleted_at IS NOT NULL
ORDER BY d.deleted_at DESC
LIMIT $1 OFFSET $2;
