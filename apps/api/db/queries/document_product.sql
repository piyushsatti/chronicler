-- Document product persistence.
-- CQRS keeps read projections separate from aggregate command locks and writes.
-- Command callers execute the named writes in the surrounding unit of work.

-- name: GetProductDocumentByID :one
SELECT d.id AS internal_id, d.public_id AS id, d.kind, d.slug, d.title, d.category,
       d.status, d.visibility, d.policy, d.body, d.frontmatter_yaml, d.author_id AS author_internal_id,
       author.public_id AS author_id, d.published_at, publisher.public_id AS published_by,
       d.deleted_at, deleter.public_id AS deleted_by, d.created_at, d.updated_at, d.version,
       COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id
                      WHERE dr.document_id=d.id ORDER BY reader.public_id), ARRAY[]::uuid[]) AS reader_ids,
       document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])) AS readable,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])),FALSE) AS admin_override,
       COALESCE(ARRAY(SELECT member.public_id FROM lieutenant_assignments la JOIN members member ON member.id=la.member_id
                      WHERE la.npc_document_id=d.id ORDER BY member.public_id), ARRAY[]::uuid[]) AS lieutenant_ids,
       COALESCE(ARRAY(SELECT q.public_id FROM document_links l JOIN quests q ON q.id=l.quest_target_id
                      WHERE l.source_id=d.id AND l.target_type='quest' ORDER BY q.public_id), ARRAY[]::uuid[]) AS linked_quest_ids
FROM documents d
LEFT JOIN members author ON author.id=d.author_id
LEFT JOIN members publisher ON publisher.id=d.published_by
LEFT JOIN members deleter ON deleter.id=d.deleted_by
WHERE d.public_id=sqlc.arg(document_id)::uuid AND d.deleted_at IS NULL;

-- name: GetProductDocumentRevisionParent :one
SELECT d.id AS internal_id, d.public_id AS id, d.kind, d.slug, d.title, d.category,
       d.status, d.visibility, d.policy, d.body, d.frontmatter_yaml, d.author_id AS author_internal_id,
       author.public_id AS author_id, d.published_at, publisher.public_id AS published_by,
       d.deleted_at, deleter.public_id AS deleted_by, d.created_at, d.updated_at, d.version,
       COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id
                      WHERE dr.document_id=d.id ORDER BY reader.public_id), ARRAY[]::uuid[]) AS reader_ids,
       document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])) AS readable,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])),FALSE) AS admin_override,
       COALESCE(ARRAY(SELECT member.public_id FROM lieutenant_assignments la JOIN members member ON member.id=la.member_id
                      WHERE la.npc_document_id=d.id ORDER BY member.public_id), ARRAY[]::uuid[]) AS lieutenant_ids,
       COALESCE(ARRAY(SELECT q.public_id FROM document_links l JOIN quests q ON q.id=l.quest_target_id
                      WHERE l.source_id=d.id AND l.target_type='quest' ORDER BY q.public_id), ARRAY[]::uuid[]) AS linked_quest_ids
FROM documents d
LEFT JOIN members author ON author.id=d.author_id
LEFT JOIN members publisher ON publisher.id=d.published_by
LEFT JOIN members deleter ON deleter.id=d.deleted_by
WHERE d.public_id=sqlc.arg(document_id)::uuid;

-- name: GetProductDocumentBySlug :one
SELECT d.id AS internal_id, d.public_id AS id, d.kind, d.slug, d.title, d.category,
       d.status, d.visibility, d.policy, d.body, d.frontmatter_yaml, d.author_id AS author_internal_id,
       author.public_id AS author_id, d.published_at, publisher.public_id AS published_by,
       d.deleted_at, deleter.public_id AS deleted_by, d.created_at, d.updated_at, d.version,
       COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id
                      WHERE dr.document_id=d.id ORDER BY reader.public_id), ARRAY[]::uuid[]) AS reader_ids,
       document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])) AS readable,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])),FALSE) AS admin_override,
       COALESCE(ARRAY(SELECT member.public_id FROM lieutenant_assignments la JOIN members member ON member.id=la.member_id
                      WHERE la.npc_document_id=d.id ORDER BY member.public_id), ARRAY[]::uuid[]) AS lieutenant_ids,
       COALESCE(ARRAY(SELECT q.public_id FROM document_links l JOIN quests q ON q.id=l.quest_target_id
                      WHERE l.source_id=d.id AND l.target_type='quest' ORDER BY q.public_id), ARRAY[]::uuid[]) AS linked_quest_ids
FROM documents d
LEFT JOIN members author ON author.id=d.author_id
LEFT JOIN members publisher ON publisher.id=d.published_by
LEFT JOIN members deleter ON deleter.id=d.deleted_by
WHERE d.slug=sqlc.arg(slug)::text AND d.deleted_at IS NULL;

-- name: LockProductDocumentByID :one
SELECT d.id AS internal_id, d.public_id AS id, d.kind, d.slug, d.title, d.category,
       d.status, d.visibility, d.policy, d.body, d.frontmatter_yaml, d.author_id AS author_internal_id,
       author.public_id AS author_id, d.published_at, publisher.public_id AS published_by,
       d.deleted_at, deleter.public_id AS deleted_by, d.created_at, d.updated_at, d.version,
       COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id
                      WHERE dr.document_id=d.id ORDER BY reader.public_id), ARRAY[]::uuid[]) AS reader_ids,
       COALESCE(ARRAY(SELECT member.public_id FROM lieutenant_assignments la JOIN members member ON member.id=la.member_id
                      WHERE la.npc_document_id=d.id ORDER BY member.public_id), ARRAY[]::uuid[]) AS lieutenant_ids,
       COALESCE(ARRAY(SELECT q.public_id FROM document_links l JOIN quests q ON q.id=l.quest_target_id
                      WHERE l.source_id=d.id AND l.target_type='quest' ORDER BY q.public_id), ARRAY[]::uuid[]) AS linked_quest_ids
FROM documents d
LEFT JOIN members author ON author.id=d.author_id
LEFT JOIN members publisher ON publisher.id=d.published_by
LEFT JOIN members deleter ON deleter.id=d.deleted_by
WHERE d.public_id=sqlc.arg(document_id)::uuid
FOR UPDATE OF d;

-- name: ListProductDocuments :many
WITH population AS (
 SELECT d.*, author.public_id AS author_public_id,
        COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id
                       WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid), ARRAY[]::uuid[]) AS readable_document_ids
 FROM documents d LEFT JOIN members author ON author.id=d.author_id
 WHERE d.deleted_at IS NULL
   AND (sqlc.narg(kind)::text IS NULL OR d.kind=sqlc.narg(kind)::text)
   AND (sqlc.narg(category)::text IS NULL OR d.category=sqlc.narg(category)::text)
   AND (sqlc.narg(status)::text IS NULL OR d.status=sqlc.narg(status)::text)
   AND (sqlc.narg(visibility)::text IS NULL OR d.visibility=sqlc.narg(visibility)::text)
   AND (sqlc.narg(author_id)::uuid IS NULL OR author.public_id=sqlc.narg(author_id)::uuid)
   AND (sqlc.narg(search)::text IS NULL OR d.title ILIKE '%'||replace(replace(replace(sqlc.narg(search)::text,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' ESCAPE chr(92))
   AND (sqlc.narg(region_id)::uuid IS NULL OR EXISTS (
       SELECT 1 FROM document_links dl JOIN regions r ON r.id=dl.region_target_id
       WHERE dl.source_id=d.id AND r.public_id=sqlc.narg(region_id)::uuid))
)
SELECT d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility,
       d.body, d.frontmatter_yaml, d.policy, d.author_public_id AS author_id,
       d.published_at, d.deleted_at, d.updated_at, d.version, d.created_at,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(
         d.public_id,d.author_public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,
         sqlc.arg(viewer_live_dm)::boolean,d.readable_document_ids),FALSE) AS admin_override
FROM population d
WHERE document_readable(d.public_id,d.author_public_id,d.status,d.visibility,d.policy,
      sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,d.readable_document_ids)
ORDER BY d.updated_at DESC,d.public_id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;

-- name: CountProductDocuments :one
WITH population AS (
 SELECT d.*, author.public_id AS author_public_id,
        COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id
                       WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid), ARRAY[]::uuid[]) AS readable_document_ids
 FROM documents d LEFT JOIN members author ON author.id=d.author_id
 WHERE d.deleted_at IS NULL
   AND (sqlc.narg(kind)::text IS NULL OR d.kind=sqlc.narg(kind)::text)
   AND (sqlc.narg(category)::text IS NULL OR d.category=sqlc.narg(category)::text)
   AND (sqlc.narg(status)::text IS NULL OR d.status=sqlc.narg(status)::text)
   AND (sqlc.narg(visibility)::text IS NULL OR d.visibility=sqlc.narg(visibility)::text)
   AND (sqlc.narg(author_id)::uuid IS NULL OR author.public_id=sqlc.narg(author_id)::uuid)
   AND (sqlc.narg(search)::text IS NULL OR d.title ILIKE '%'||replace(replace(replace(sqlc.narg(search)::text,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' ESCAPE chr(92))
   AND (sqlc.narg(region_id)::uuid IS NULL OR EXISTS (
       SELECT 1 FROM document_links dl JOIN regions r ON r.id=dl.region_target_id
       WHERE dl.source_id=d.id AND r.public_id=sqlc.narg(region_id)::uuid))
)
SELECT count(*)::bigint AS total,
       COALESCE(bool_or(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(
         d.public_id,d.author_public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,
         sqlc.arg(viewer_live_dm)::boolean,d.readable_document_ids)),FALSE) AS admin_override
FROM population d
WHERE document_readable(d.public_id,d.author_public_id,d.status,d.visibility,d.policy,
      sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,d.readable_document_ids);

-- name: ListProductDocumentsTrash :many
SELECT d.public_id AS id,d.kind,d.slug,d.title,d.category,d.status,d.visibility,d.body,
       d.frontmatter_yaml,d.policy,author.public_id AS author_id,d.deleted_at,deleter.public_id AS deleted_by,
       d.updated_at,d.version,d.created_at
FROM documents d LEFT JOIN members author ON author.id=d.author_id
LEFT JOIN members deleter ON deleter.id=d.deleted_by
WHERE d.deleted_at IS NOT NULL
ORDER BY d.deleted_at DESC,d.public_id DESC LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;

-- name: CountProductDocumentsTrash :one
SELECT count(*)::bigint AS total FROM documents d WHERE d.deleted_at IS NOT NULL;

-- name: ListProductDocumentRevisions :many
SELECT r.public_id AS id,d.public_id AS document_id,r.rev,r.reason,r.title,r.body,r.frontmatter_yaml,
       r.policy,r.visibility,r.published_at,publisher.public_id AS published_by,
       actor.public_id AS recorded_by,r.created_at AS recorded_at,r.old_value,r.new_value
FROM document_revisions r JOIN documents d ON d.id=r.document_id
LEFT JOIN members publisher ON publisher.id=r.published_by
LEFT JOIN members actor ON actor.id=r.created_by
WHERE d.public_id=sqlc.arg(document_id)::uuid
ORDER BY r.rev DESC LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;

-- name: CountProductDocumentRevisions :one
SELECT count(*)::bigint AS total FROM document_revisions r JOIN documents d ON d.id=r.document_id
WHERE d.public_id=sqlc.arg(document_id)::uuid;

-- name: ListProductCodexCategories :many
SELECT d.category,count(*)::bigint AS count
FROM documents d LEFT JOIN members author ON author.id=d.author_id
WHERE d.kind='codex_entry' AND d.status='published' AND d.deleted_at IS NULL AND d.category IS NOT NULL
  AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
      sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,
      COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
GROUP BY d.category ORDER BY d.category;

-- name: GetProductCodexEntryBySlug :one
SELECT d.public_id AS id,d.kind,d.slug,d.title,d.category,d.status,d.visibility,d.body,
       d.frontmatter_yaml,d.policy,author.public_id AS author_id,d.updated_at,d.version,
       document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])) AS readable,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND NOT document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,sqlc.narg(viewer_id)::uuid,
         sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,
         sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])),FALSE) AS admin_override
FROM documents d LEFT JOIN members author ON author.id=d.author_id
WHERE d.slug=sqlc.arg(slug)::text AND d.kind='codex_entry' AND d.deleted_at IS NULL;

-- name: ListProductCodexDirectory :many
SELECT d.public_id AS id,d.kind,d.slug,d.title,d.category,d.status,d.visibility,d.body,
       d.frontmatter_yaml,d.policy,author.public_id AS author_id,d.updated_at,d.version
FROM documents d LEFT JOIN members author ON author.id=d.author_id
WHERE d.kind='codex_entry' AND d.deleted_at IS NULL
  AND (sqlc.narg(category_prefix)::text IS NULL OR d.category=sqlc.narg(category_prefix)::text OR d.category LIKE replace(replace(replace(sqlc.narg(category_prefix)::text,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'/%' ESCAPE chr(92))
  AND (sqlc.narg(search)::text IS NULL OR d.title ILIKE '%'||replace(replace(replace(sqlc.narg(search)::text,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' ESCAPE chr(92))
  AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
      sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,
      COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
ORDER BY d.updated_at DESC,d.public_id DESC LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;

-- name: CountProductCodexDirectory :one
SELECT count(*)::bigint AS total FROM documents d LEFT JOIN members author ON author.id=d.author_id
WHERE d.kind='codex_entry' AND d.deleted_at IS NULL
  AND (sqlc.narg(category_prefix)::text IS NULL OR d.category=sqlc.narg(category_prefix)::text OR d.category LIKE replace(replace(replace(sqlc.narg(category_prefix)::text,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'/%' ESCAPE chr(92))
  AND (sqlc.narg(search)::text IS NULL OR d.title ILIKE '%'||replace(replace(replace(sqlc.narg(search)::text,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' ESCAPE chr(92))
  AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
      sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,
      COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]));

-- name: CountProductDocumentBacklinks :one
SELECT count(*)::bigint AS total,
       COALESCE(bool_or(sqlc.arg(viewer_admin)::boolean AND (
        NOT document_readable(src.public_id,sa.public_id,src.status,src.visibility,src.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT src.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=src.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
        OR NOT document_readable(tgt.public_id,ta.public_id,tgt.status,tgt.visibility,tgt.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT tgt.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=tgt.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[])))),FALSE) AS admin_override
FROM document_links l JOIN documents src ON src.id=l.source_id AND src.deleted_at IS NULL
LEFT JOIN members sa ON sa.id=src.author_id
JOIN documents tgt ON l.target_type='document' AND tgt.id=l.document_target_id AND tgt.deleted_at IS NULL
LEFT JOIN members ta ON ta.id=tgt.author_id
WHERE tgt.slug=sqlc.arg(slug)::text
AND document_readable(src.public_id,sa.public_id,src.status,src.visibility,src.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT src.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=src.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
AND document_readable(tgt.public_id,ta.public_id,tgt.status,tgt.visibility,tgt.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT tgt.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=tgt.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]));

-- name: ListProductDocumentBacklinks :many
SELECT src.public_id AS source_id,tgt.public_id AS target_id,l.relation,src.kind,src.slug,
       COALESCE(sqlc.arg(viewer_admin)::boolean AND (
        NOT document_readable(src.public_id,sa.public_id,src.status,src.visibility,src.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT src.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=src.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
        OR NOT document_readable(tgt.public_id,ta.public_id,tgt.status,tgt.visibility,tgt.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,FALSE,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT tgt.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=tgt.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))),FALSE) AS admin_override
FROM document_links l JOIN documents src ON src.id=l.source_id AND src.deleted_at IS NULL
LEFT JOIN members sa ON sa.id=src.author_id
JOIN documents tgt ON l.target_type='document' AND tgt.id=l.document_target_id AND tgt.deleted_at IS NULL
LEFT JOIN members ta ON ta.id=tgt.author_id
WHERE tgt.slug=sqlc.arg(slug)::text
AND document_readable(src.public_id,sa.public_id,src.status,src.visibility,src.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT src.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=src.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
AND document_readable(tgt.public_id,ta.public_id,tgt.status,tgt.visibility,tgt.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT tgt.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=tgt.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
ORDER BY src.updated_at DESC,src.public_id DESC,l.relation LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;

-- name: ListProductLieutenantAssignments :many
SELECT member.public_id AS member_id,d.public_id AS npc_document_id,la.created_at AS granted_at,grantor.public_id AS granted_by
FROM lieutenant_assignments la JOIN members member ON member.id=la.member_id
JOIN documents d ON d.id=la.npc_document_id LEFT JOIN members grantor ON grantor.id=la.granted_by
WHERE (sqlc.narg(member_id)::uuid IS NULL OR member.public_id=sqlc.narg(member_id)::uuid)
  AND (sqlc.narg(npc_document_id)::uuid IS NULL OR d.public_id=sqlc.narg(npc_document_id)::uuid)
ORDER BY d.public_id,member.public_id
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;

-- name: CountProductLieutenantAssignments :one
SELECT count(*)::bigint AS total FROM lieutenant_assignments la
JOIN members member ON member.id=la.member_id JOIN documents d ON d.id=la.npc_document_id
WHERE (sqlc.narg(member_id)::uuid IS NULL OR member.public_id=sqlc.narg(member_id)::uuid)
  AND (sqlc.narg(npc_document_id)::uuid IS NULL OR d.public_id=sqlc.narg(npc_document_id)::uuid);

-- name: ListProductDocumentSubjects :many
SELECT l.target_type,l.relation,
       CASE l.target_type WHEN 'document' THEN td.public_id WHEN 'quest' THEN q.public_id WHEN 'character' THEN c.public_id WHEN 'region' THEN r.public_id END AS target_id
FROM document_links l
JOIN documents src ON src.id=l.source_id AND src.public_id=sqlc.arg(document_id)::uuid AND src.deleted_at IS NULL
LEFT JOIN members source_author ON source_author.id=src.author_id
LEFT JOIN documents td ON l.target_type='document' AND td.id=l.document_target_id AND td.deleted_at IS NULL
LEFT JOIN members target_author ON target_author.id=td.author_id
LEFT JOIN quests q ON l.target_type='quest' AND q.id=l.quest_target_id
LEFT JOIN characters c ON l.target_type='character' AND c.id=l.character_target_id
LEFT JOIN regions r ON l.target_type='region' AND r.id=l.region_target_id
WHERE document_readable(src.public_id,source_author.public_id,src.status,src.visibility,src.policy,
      sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
      sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,
      COALESCE(ARRAY(SELECT src.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=src.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
  AND CASE l.target_type
    WHEN 'document' THEN td.id IS NOT NULL AND document_readable(td.public_id,target_author.public_id,td.status,td.visibility,td.policy,sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,COALESCE(ARRAY(SELECT td.public_id FROM document_readers dr JOIN members m ON m.id=dr.member_id WHERE dr.document_id=td.id AND m.public_id=sqlc.narg(viewer_id)::uuid),ARRAY[]::uuid[]))
    -- Quest identity is public; the separate held protected-relation admission clause is not inferred here.
    WHEN 'quest' THEN q.id IS NOT NULL
    WHEN 'character' THEN c.id IS NOT NULL
    WHEN 'region' THEN r.id IS NOT NULL END
ORDER BY l.target_type,l.relation,target_id LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::int;

-- name: FindProductDocumentSlug :one
WITH population AS (
 SELECT count(*)::bigint AS occupied FROM documents WHERE slug=sqlc.arg(base)::text OR slug LIKE sqlc.arg(base)::text||'-%'
), candidates AS (
 SELECT n,CASE WHEN n=1 THEN sqlc.arg(base)::text ELSE sqlc.arg(base)::text||'-'||n::text END AS candidate
 FROM population CROSS JOIN LATERAL generate_series(1::bigint,occupied+1) n
)
SELECT c.candidate FROM candidates c WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.slug=c.candidate)
ORDER BY c.n LIMIT 1;

-- Aggregate writes are separate named statements and run in the caller's UOW.
-- name: LoadProductDocumentWriteFacts :many
SELECT d.public_id AS document_id, r.public_id AS region_id,
       EXISTS (SELECT 1 FROM archon_assignments aa JOIN members m ON m.id=aa.member_id
               WHERE aa.region_id=r.id AND m.public_id=sqlc.narg(actor_id)::uuid) AS assigned_archon,
       dm.public_id AS quest_dm_id, q.public_id AS quest_id
FROM documents d
LEFT JOIN LATERAL (
 SELECT region.id,region.public_id FROM regions region JOIN (
   SELECT l.region_target_id AS id FROM document_links l
   WHERE l.source_id=d.id AND l.region_target_id IS NOT NULL
   UNION
   SELECT m.region_id FROM pointcrawl_entry_links pel JOIN maps m ON m.id=pel.map_id
   WHERE pel.document_id=d.id AND pel.relation='location' AND m.region_id IS NOT NULL
 ) linked ON linked.id=region.id
) r ON TRUE
LEFT JOIN quests q ON q.document_id=d.id AND q.deleted_at IS NULL
LEFT JOIN members dm ON dm.id=q.dm_id
WHERE d.public_id=ANY(sqlc.arg(document_ids)::uuid[])
ORDER BY d.public_id,r.public_id;

-- name: NextProductDocumentRevision :one
SELECT (COALESCE(max(r.rev),0)+1)::integer AS rev FROM document_revisions r
JOIN documents d ON d.id=r.document_id WHERE d.public_id=sqlc.arg(document_id)::uuid;

-- name: LockProductSummaryQuests :many
SELECT q.public_id AS id FROM quests q
WHERE q.deleted_at IS NULL AND (
 q.public_id=ANY(sqlc.arg(quest_ids)::uuid[]) OR EXISTS (
   SELECT 1 FROM document_links l JOIN documents d ON d.id=l.source_id
   WHERE l.quest_target_id=q.id AND l.relation='summarizes'
     AND d.public_id=sqlc.narg(document_id)::uuid))
ORDER BY q.public_id FOR UPDATE OF q;

-- name: InsertProductDocument :one
INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,policy,body,frontmatter_yaml,author_id,version,created_at,updated_at)
VALUES(sqlc.arg(id)::uuid,sqlc.arg(kind)::text,sqlc.arg(slug)::text,sqlc.arg(title)::text,sqlc.narg(category)::text,'draft',sqlc.arg(visibility)::text,sqlc.narg(policy)::jsonb,sqlc.arg(body)::text,sqlc.narg(frontmatter_yaml)::text,(SELECT id FROM members WHERE public_id=sqlc.arg(author_id)::uuid),1,sqlc.arg(at)::timestamptz,sqlc.arg(at)::timestamptz)
RETURNING id AS internal_id,public_id AS id,version,created_at,updated_at;

-- name: UpdateProductDocument :one
UPDATE documents SET title=sqlc.arg(title)::text,category=sqlc.narg(category)::text,
 body=sqlc.arg(body)::text,frontmatter_yaml=sqlc.narg(frontmatter_yaml)::text,
 policy=sqlc.narg(policy)::jsonb,visibility=sqlc.arg(visibility)::text,
 status=sqlc.arg(status)::text,published_at=sqlc.narg(published_at)::timestamptz,
 published_by=(SELECT id FROM members WHERE public_id=sqlc.narg(published_by)::uuid),
 deleted_at=sqlc.narg(deleted_at)::timestamptz,
 deleted_by=(SELECT id FROM members WHERE public_id=sqlc.narg(deleted_by)::uuid),
 version=version+1,updated_at=sqlc.arg(at)::timestamptz
WHERE public_id=sqlc.arg(id)::uuid AND version=sqlc.arg(expected_version)::int
RETURNING id AS internal_id,public_id AS id,version,updated_at,published_at,deleted_at;

-- name: InsertProductDocumentRevision :one
INSERT INTO document_revisions(public_id,document_id,rev,reason,title,body,frontmatter_yaml,created_by,created_at,old_value,new_value,policy,published_at,published_by,visibility)
SELECT sqlc.arg(id)::uuid,d.id,sqlc.arg(rev)::int,sqlc.arg(reason)::text,sqlc.arg(title)::text,sqlc.arg(body)::text,sqlc.narg(frontmatter_yaml)::text,(SELECT id FROM members WHERE public_id=sqlc.narg(recorded_by)::uuid),sqlc.arg(at)::timestamptz,sqlc.narg(old_value)::jsonb,sqlc.narg(new_value)::jsonb,sqlc.narg(policy)::jsonb,sqlc.narg(published_at)::timestamptz,(SELECT id FROM members WHERE public_id=sqlc.narg(published_by)::uuid),sqlc.narg(visibility)::text
FROM documents d WHERE d.public_id=sqlc.arg(document_id)::uuid
RETURNING public_id AS id,rev,created_at;

-- name: ReplaceProductDocumentReaders :exec
DELETE FROM document_readers WHERE document_id=(SELECT id FROM documents WHERE public_id=sqlc.arg(document_id)::uuid);

-- name: InsertProductDocumentReaders :exec
INSERT INTO document_readers(document_id,member_id)
SELECT d.id,m.id FROM documents d CROSS JOIN unnest(sqlc.arg(reader_ids)::uuid[]) wanted(id)
JOIN members m ON m.public_id=wanted.id WHERE d.public_id=sqlc.arg(document_id)::uuid
ON CONFLICT(document_id,member_id) DO NOTHING;

-- name: ReplaceProductDocumentLinks :exec
DELETE FROM document_links WHERE source_id=(SELECT id FROM documents WHERE public_id=sqlc.arg(document_id)::uuid) AND target_type='document';

-- name: ReplaceProductSummaryLinks :exec
WITH source_document AS MATERIALIZED (
 SELECT id FROM documents WHERE public_id=sqlc.arg(document_id)::uuid
), requested_quests AS MATERIALIZED (
 SELECT DISTINCT q.id FROM quests q JOIN unnest(sqlc.arg(quest_ids)::uuid[]) wanted(id) ON q.public_id=wanted.id
), quest_ids_to_lock AS MATERIALIZED (
 SELECT l.quest_target_id AS id FROM document_links l,source_document d
 WHERE l.source_id=d.id AND l.target_type='quest'
 UNION
 SELECT id FROM requested_quests
), locked_quests AS MATERIALIZED (
 SELECT q.id FROM quests q JOIN quest_ids_to_lock wanted ON wanted.id=q.id
 ORDER BY q.public_id FOR UPDATE OF q
), removed_quests AS (
 DELETE FROM document_links l USING source_document d
 WHERE l.source_id=d.id AND l.target_type='quest' AND l.relation='summarizes'
   AND NOT EXISTS (SELECT 1 FROM requested_quests wanted WHERE wanted.id=l.quest_target_id)
   AND EXISTS (SELECT 1 FROM locked_quests locked WHERE locked.id=l.quest_target_id)
 RETURNING l.quest_target_id
), added_quests AS (
 INSERT INTO document_links(source_id,quest_target_id,relation)
 SELECT d.id,q.id,'summarizes' FROM source_document d
 JOIN requested_quests q ON EXISTS (SELECT 1 FROM locked_quests locked WHERE locked.id=q.id)
 ON CONFLICT DO NOTHING
 RETURNING quest_target_id
), removed_characters AS (
 DELETE FROM document_links l USING source_document d
 WHERE l.source_id=d.id AND l.target_type='character' AND l.relation='subject'
   AND (sqlc.narg(character_id)::uuid IS NULL OR NOT EXISTS (
     SELECT 1 FROM characters c WHERE c.id=l.character_target_id
       AND c.public_id=sqlc.narg(character_id)::uuid))
 RETURNING l.character_target_id
), added_character AS (
 INSERT INTO document_links(source_id,character_target_id,relation)
 SELECT d.id,c.id,'subject' FROM source_document d
 JOIN characters c ON c.public_id=sqlc.narg(character_id)::uuid
 WHERE sqlc.narg(character_id)::uuid IS NOT NULL
 ON CONFLICT DO NOTHING
 RETURNING character_target_id
)
SELECT (SELECT count(*) FROM removed_quests)+(SELECT count(*) FROM added_quests)
      +(SELECT count(*) FROM removed_characters)+(SELECT count(*) FROM added_character);

-- name: InsertProductSummaryQuestLinks :exec
WITH requested_quests AS MATERIALIZED (
 SELECT DISTINCT q.id FROM quests q JOIN unnest(sqlc.arg(quest_ids)::uuid[]) wanted(id) ON q.public_id=wanted.id
), locked_quests AS MATERIALIZED (
 SELECT q.id FROM quests q JOIN requested_quests wanted ON wanted.id=q.id
 ORDER BY q.public_id FOR UPDATE OF q
)
INSERT INTO document_links(source_id,quest_target_id,relation)
SELECT d.id,q.id,'summarizes' FROM documents d
JOIN locked_quests q ON TRUE
WHERE d.public_id=sqlc.arg(document_id)::uuid
ON CONFLICT DO NOTHING;

-- name: InsertProductDocumentLink :exec
INSERT INTO document_links(source_id,document_target_id,relation)
VALUES((SELECT id FROM documents WHERE public_id=sqlc.arg(document_id)::uuid),
       (SELECT id FROM documents WHERE public_id=sqlc.arg(target_id)::uuid AND deleted_at IS NULL),
       sqlc.arg(relation)::text)
ON CONFLICT DO NOTHING;

-- name: AssignProductLieutenant :exec
INSERT INTO lieutenant_assignments(member_id,npc_document_id,granted_by,created_at)
SELECT member.id,d.id,(SELECT id FROM members WHERE public_id=sqlc.arg(granted_by)::uuid),sqlc.arg(at)::timestamptz
FROM members member JOIN documents d ON d.public_id=sqlc.arg(npc_document_id)::uuid
WHERE member.public_id=sqlc.arg(member_id)::uuid ON CONFLICT(member_id,npc_document_id) DO NOTHING;

-- name: RevokeProductLieutenant :exec
DELETE FROM lieutenant_assignments la USING members member,documents d
WHERE la.member_id=member.id AND la.npc_document_id=d.id
AND member.public_id=sqlc.arg(member_id)::uuid AND d.public_id=sqlc.arg(npc_document_id)::uuid;

-- name: ProductBatchDocumentReaderIds :many
SELECT input.ordinality::integer AS input_index,
       input.public_id AS document_id,
       reader.public_id AS reader_id
FROM unnest(sqlc.arg(document_ids)::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
LEFT JOIN documents d ON d.public_id = input.public_id AND d.deleted_at IS NULL
LEFT JOIN document_readers dr ON dr.document_id = d.id
LEFT JOIN members reader ON reader.id = dr.member_id
ORDER BY input.ordinality, reader.public_id NULLS LAST;

-- SummaryDerived set queries (≤3/chunk): quest links, participants, regions/pointcrawl.
-- Quest brief visibility gates admitted source quests before any derived union rows.

-- name: ProductSummaryDerivedQuestFacts :many
WITH requested AS (
    SELECT input.ordinality::integer AS input_index,
           input.public_id AS document_id
    FROM unnest(sqlc.arg(document_ids)::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
), summaries AS (
    SELECT r.input_index, r.document_id, d.id AS document_internal_id,
           author.public_id AS summary_author_id,
           COALESCE(document_readable(
               d.public_id, author.public_id, d.status, d.visibility, d.policy,
               sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
               sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
               COALESCE(ARRAY(SELECT d.public_id FROM document_readers dr
                 JOIN members reader ON reader.id=dr.member_id
                 WHERE dr.document_id=d.id AND reader.public_id=sqlc.narg(viewer_id)::uuid), ARRAY[]::uuid[])
           ), FALSE)::boolean AS summary_readable
    FROM requested r
    JOIN documents d ON d.public_id = r.document_id AND d.deleted_at IS NULL AND d.kind = 'summary'
    LEFT JOIN members author ON author.id=d.author_id
), linked AS (
    SELECT s.input_index, s.document_id,
           q.public_id AS quest_id, q.short_code, q.scheduled_at, l.summary_append_order,
           dm.public_id AS dm_id, dm.display_name AS dm_display_name,
           arc.name AS arc_name, gtm.game_day, brief.title,
           COALESCE(brief.id IS NOT NULL AND document_readable(
               brief.public_id, brief_author.public_id, brief.status, brief.visibility, brief.policy,
               sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
               sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
               COALESCE(ARRAY(
                   SELECT brief.public_id FROM document_readers dr
                   JOIN members reader ON reader.id = dr.member_id
                   WHERE dr.document_id = brief.id AND reader.public_id = sqlc.narg(viewer_id)::uuid
               ), ARRAY[]::uuid[])
           ), FALSE) AS brief_readable
    FROM summaries s
    JOIN document_links l ON l.source_id = s.document_internal_id
      AND l.relation = 'summarizes' AND l.quest_target_id IS NOT NULL
    JOIN quests q ON q.id = l.quest_target_id AND q.deleted_at IS NULL
    LEFT JOIN documents brief ON brief.id = q.document_id AND brief.deleted_at IS NULL
    LEFT JOIN members brief_author ON brief_author.id = brief.author_id
    JOIN members dm ON dm.id = q.dm_id
    LEFT JOIN quest_arcs arc ON arc.id = q.arc_id
    LEFT JOIN game_time_map gtm ON gtm.real_date = ((q.scheduled_at AT TIME ZONE 'UTC')::date)
)
SELECT s.input_index, s.document_id, linked.quest_id, COALESCE(linked.short_code,'')::text AS short_code,
       readable_brief.title AS quest_title,
       readable_quest.scheduled_at, COALESCE(linked.summary_append_order,0)::bigint AS summary_append_order,
       readable_dm.public_id AS dm_id,
       COALESCE(readable_dm.display_name,'')::text AS dm_display_name,
       readable_arc.name AS arc_name, readable_game.game_day,
       s.summary_author_id, s.summary_readable,
       ARRAY(SELECT q.public_id FROM document_links l JOIN quests q ON q.id=l.quest_target_id
         WHERE l.source_id=s.document_internal_id AND l.relation='summarizes' AND q.deleted_at IS NULL
         ORDER BY l.summary_append_order,q.public_id)::uuid[] AS authoring_quest_ids,
       ARRAY(SELECT c.public_id FROM document_links l JOIN characters c ON c.id=l.character_target_id
         WHERE l.source_id=s.document_internal_id AND l.relation='subject' AND c.deleted_at IS NULL
         ORDER BY l.summary_append_order,c.public_id)::uuid[] AS authoring_character_ids,
       (EXISTS(SELECT 1 FROM linked linked_quest WHERE linked_quest.input_index=s.input_index)
        AND NOT EXISTS(SELECT 1 FROM document_links l
          LEFT JOIN quests q ON q.id=l.quest_target_id
          WHERE l.source_id=s.document_internal_id AND l.target_type='quest' AND l.relation='summarizes'
          AND (q.id IS NULL OR q.deleted_at IS NOT NULL))
        AND NOT EXISTS(SELECT 1 FROM linked hidden WHERE hidden.input_index=s.input_index AND NOT hidden.brief_readable)
        AND NOT EXISTS(SELECT 1 FROM document_links l
          LEFT JOIN characters c ON c.id=l.character_target_id
          WHERE l.source_id=s.document_internal_id AND l.target_type='character' AND l.relation='subject'
          AND (c.id IS NULL OR c.deleted_at IS NOT NULL))
        AND (SELECT count(*) FROM document_links l WHERE l.source_id=s.document_internal_id
             AND l.character_target_id IS NOT NULL AND l.relation='subject')<=1
       )::boolean AS authoring_complete
FROM summaries s
LEFT JOIN linked ON linked.input_index=s.input_index
LEFT JOIN quests readable_quest ON readable_quest.public_id=linked.quest_id AND linked.brief_readable
LEFT JOIN documents readable_brief ON readable_brief.id=readable_quest.document_id AND readable_brief.deleted_at IS NULL
LEFT JOIN members readable_dm ON readable_dm.id=readable_quest.dm_id
LEFT JOIN quest_arcs readable_arc ON readable_arc.id=readable_quest.arc_id
LEFT JOIN game_time_map readable_game ON readable_game.real_date=((readable_quest.scheduled_at AT TIME ZONE 'UTC')::date)
ORDER BY s.input_index, linked.summary_append_order, linked.quest_id;

-- name: ProductSummaryDerivedPlayers :many
WITH requested AS (
    SELECT input.ordinality::integer AS input_index,
           input.public_id AS document_id
    FROM unnest(sqlc.arg(document_ids)::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
), summaries AS (
    SELECT r.input_index, r.document_id, d.id AS document_internal_id
    FROM requested r
    JOIN documents d ON d.public_id = r.document_id AND d.deleted_at IS NULL AND d.kind = 'summary'
), admitted AS (
    SELECT s.input_index, s.document_id, s.document_internal_id,
           q.id AS quest_internal_id, l.summary_append_order
    FROM summaries s
    JOIN document_links l ON l.source_id = s.document_internal_id
      AND l.relation = 'summarizes' AND l.quest_target_id IS NOT NULL
    JOIN quests q ON q.id = l.quest_target_id AND q.deleted_at IS NULL
    JOIN documents brief ON brief.id = q.document_id AND brief.deleted_at IS NULL
    JOIN members brief_author ON brief_author.id = brief.author_id
    WHERE document_readable(
        brief.public_id, brief_author.public_id, brief.status, brief.visibility, brief.policy,
        sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
        sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
        COALESCE(ARRAY(
            SELECT brief.public_id FROM document_readers dr
            JOIN members reader ON reader.id = dr.member_id
            WHERE dr.document_id = brief.id AND reader.public_id = sqlc.narg(viewer_id)::uuid
        ), ARRAY[]::uuid[])
    )
), quest_players AS (
    SELECT a.input_index, a.document_id,
           c.public_id AS character_id, c.short_code AS character_short_code, c.name AS character_name,
           m.public_id AS member_id, qp.manual,
           0 AS source_rank, a.summary_append_order AS quest_order,
           qp.created_at AS tie_time, 0::bigint AS tie_order
    FROM admitted a
    JOIN quest_participants qp ON qp.quest_id = a.quest_internal_id
      AND qp.status IN ('signed_up', 'played')
    JOIN characters c ON c.id = qp.character_id AND c.deleted_at IS NULL
    JOIN members m ON m.id = qp.member_id
), manual_players AS (
    SELECT s.input_index, s.document_id,
           c.public_id AS character_id, c.short_code AS character_short_code, c.name AS character_name,
           owner.public_id AS member_id, TRUE AS manual,
           1 AS source_rank, l.summary_append_order AS quest_order,
           NULL::timestamptz AS tie_time, l.summary_append_order AS tie_order
    FROM summaries s
    JOIN document_links l ON l.source_id = s.document_internal_id
      AND l.relation = 'manual_player' AND l.character_target_id IS NOT NULL
    JOIN characters c ON c.id = l.character_target_id AND c.deleted_at IS NULL
    JOIN members owner ON owner.id = c.owner_id
)
SELECT input_index, document_id, character_id, character_short_code, character_name, member_id, manual,
       source_rank, quest_order, tie_time, tie_order
FROM quest_players
UNION ALL
SELECT input_index, document_id, character_id, character_short_code, character_name, member_id, manual,
       source_rank, quest_order, tie_time, tie_order
FROM manual_players
ORDER BY input_index, source_rank, quest_order, tie_time NULLS LAST, tie_order, character_id;

-- name: ProductSummaryDerivedPlaces :many
WITH requested AS (
    SELECT input.ordinality::integer AS input_index,
           input.public_id AS document_id
    FROM unnest(sqlc.arg(document_ids)::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
), summaries AS (
    SELECT r.input_index, r.document_id, d.id AS document_internal_id
    FROM requested r
    JOIN documents d ON d.public_id = r.document_id AND d.deleted_at IS NULL AND d.kind = 'summary'
), admitted AS (
    SELECT s.input_index, s.document_id, q.id AS quest_internal_id, l.summary_append_order
    FROM summaries s
    JOIN document_links l ON l.source_id = s.document_internal_id
      AND l.relation = 'summarizes' AND l.quest_target_id IS NOT NULL
    JOIN quests q ON q.id = l.quest_target_id AND q.deleted_at IS NULL
    JOIN documents brief ON brief.id = q.document_id AND brief.deleted_at IS NULL
    JOIN members brief_author ON brief_author.id = brief.author_id
    WHERE document_readable(
        brief.public_id, brief_author.public_id, brief.status, brief.visibility, brief.policy,
        sqlc.narg(viewer_id)::uuid, sqlc.arg(viewer_roles)::text[], sqlc.arg(viewer_handle)::text,
        sqlc.arg(viewer_admin)::boolean, sqlc.arg(viewer_live_dm)::boolean,
        COALESCE(ARRAY(
            SELECT brief.public_id FROM document_readers dr
            JOIN members reader ON reader.id = dr.member_id
            WHERE dr.document_id = brief.id AND reader.public_id = sqlc.narg(viewer_id)::uuid
        ), ARRAY[]::uuid[])
    )
), regions AS (
    SELECT a.input_index, a.document_id, 'region'::text AS place_kind,
           r.public_id AS place_id, r.name AS place_name, NULL::uuid AS map_id,
           a.summary_append_order, r.public_id AS sort_id
    FROM admitted a
    JOIN quest_regions qr ON qr.quest_id = a.quest_internal_id
    JOIN regions r ON r.id = qr.region_id AND r.deleted_at IS NULL
), nodes AS (
    SELECT a.input_index, a.document_id, 'node'::text AS place_kind,
           n.public_id AS place_id, n.name AS place_name, m.public_id AS map_id,
           a.summary_append_order, n.public_id AS sort_id
    FROM admitted a
    JOIN quest_pointcrawl_nodes qpn ON qpn.quest_id = a.quest_internal_id
    JOIN pointcrawl_nodes n ON n.id = qpn.node_id
    JOIN maps m ON m.id = n.map_id
)
SELECT input_index, document_id, place_kind, place_id, place_name, map_id, summary_append_order, sort_id
FROM regions
UNION ALL
SELECT input_index, document_id, place_kind, place_id, place_name, map_id, summary_append_order, sort_id
FROM nodes
ORDER BY input_index, place_kind, summary_append_order, sort_id;

-- name: ResolveProductMentionHandles :many
SELECT public_id AS id, handle FROM members
WHERE handle=ANY(sqlc.arg(handles)::text[]) ORDER BY public_id;

-- name: ReadProductDocumentAuthor :one
SELECT author.public_id AS id FROM documents d
JOIN members author ON author.id=d.author_id
WHERE d.public_id=sqlc.arg(document_id)::uuid;

-- name: LockFeatureHexNode :many
SELECT n.id, n.map_id FROM pointcrawl_nodes n
JOIN maps m ON m.id=n.map_id
WHERE m.atlas_code=sqlc.arg(atlas_code)::text AND n.name=sqlc.arg(hex)::text
ORDER BY n.id
FOR UPDATE OF n;

-- name: FeatureLinkedToHexNode :one
SELECT EXISTS(
  SELECT 1 FROM pointcrawl_entry_links pel JOIN documents d ON d.id=pel.document_id
  WHERE d.public_id=sqlc.arg(document_id)::uuid AND pel.node_id=sqlc.arg(node_id) AND pel.relation='subject');

-- name: MemberMayPlaceFeatures :one
SELECT EXISTS(
  SELECT 1 FROM members
  WHERE public_id=sqlc.arg(member_id)::uuid AND status='active' AND roles && ARRAY['dm','admin']::text[]);

-- name: CountOtherFeaturesOnHex :one
SELECT count(*) FROM pointcrawl_entry_links pel
JOIN documents d ON d.id=pel.document_id
WHERE pel.node_id=sqlc.arg(node_id) AND pel.relation='subject'
  AND d.kind='codex_entry' AND d.category='Feature' AND d.status='published' AND d.deleted_at IS NULL
  AND d.public_id<>sqlc.arg(document_id)::uuid;

-- name: DeleteFeatureLinksOffHex :exec
-- keep_node_id 0 removes every subject link of the document on that map.
DELETE FROM pointcrawl_entry_links pel
USING documents d
WHERE d.id=pel.document_id AND d.public_id=sqlc.arg(document_id)::uuid
  AND pel.relation='subject' AND pel.map_id=(SELECT id FROM maps WHERE atlas_code=sqlc.arg(atlas_code)::text)
  AND pel.node_id<>sqlc.arg(keep_node_id)::bigint;

-- name: InsertFeatureHexLink :exec
INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by)
SELECT sqlc.arg(map_id),sqlc.arg(node_id),d.id,'subject',sqlc.arg(recorded_at),actor.id
FROM documents d JOIN members actor ON actor.public_id=sqlc.arg(actor_id)::uuid
WHERE d.public_id=sqlc.arg(document_id)::uuid
ON CONFLICT DO NOTHING;
