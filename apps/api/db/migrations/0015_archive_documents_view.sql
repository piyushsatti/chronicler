-- +goose Up
CREATE VIEW public.archive_documents_v1 AS
SELECT d.public_id AS document_id
FROM public.documents d
WHERE d.deleted_at IS NULL
  AND public.document_readable(
    d.public_id, NULL::uuid, d.status, d.visibility, d.policy,
    NULL::uuid, '{}'::text[], ''::text, FALSE, FALSE, '{}'::uuid[]
  );

-- +goose Down
DROP VIEW public.archive_documents_v1;
