-- name: ListDocumentReaders :many
SELECT d.public_id
FROM document_readers dr
JOIN documents d ON d.id = dr.document_id
WHERE dr.member_id = (SELECT members.id FROM members WHERE members.public_id = sqlc.arg(member_id));

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
