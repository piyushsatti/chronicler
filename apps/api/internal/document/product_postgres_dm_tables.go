package document

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const listProductDmTablesForMembersSQL = `
SELECT input.ordinality::integer AS input_index,
       input.public_id AS member_public_id,
       d.public_id AS id, d.kind, d.slug, d.title, d.category, d.status, d.visibility,
       d.policy, d.body, d.frontmatter_yaml, author.public_id AS author_id,
       d.published_at, d.deleted_at, deleter.public_id AS deleted_by, d.updated_at, d.version,
       document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,$2::uuid,
         $3::text[],$4::text,$5::boolean,
         $6::boolean,COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id),ARRAY[]::uuid[])) AS readable,
       COALESCE($5::boolean AND NOT document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,$2::uuid,
         $3::text[],$4::text,FALSE,
         $6::boolean,COALESCE(ARRAY(SELECT reader.public_id FROM document_readers dr JOIN members reader ON reader.id=dr.member_id WHERE dr.document_id=d.id),ARRAY[]::uuid[])),FALSE) AS admin_override
FROM unnest($1::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
LEFT JOIN members m ON m.public_id = input.public_id
LEFT JOIN documents d ON d.author_id = m.id AND d.kind = 'community' AND d.category = 'dm_table' AND d.deleted_at IS NULL
LEFT JOIN members author ON author.id = d.author_id
LEFT JOIN members deleter ON deleter.id = d.deleted_by
ORDER BY input.ordinality`

// ReadBatchDmTables loads each member's live dm_table community document (D5 / NEST-quest).
// Keys are member public IDs. Missing or unreadable tables return nil Value without error.
func (p *ProductPostgres) ReadBatchDmTables(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[DocumentView], error) {
	out := make([]product.BatchResult[DocumentView], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	ids := make([]pgtype.UUID, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := productDocumentID(key.ID)
		if err != nil {
			out[i] = product.BatchResult[DocumentView]{Err: err}
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.DB.Query(ctx, listProductDmTablesForMembersSQL, ids, viewerID, roles, handle, admin, liveDM)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			inputIndex                                  int32
			memberPublicID, docID, authorID, deletedBy  pgtype.UUID
			kind, slug, title, status, visibility, body string
			category, frontmatter                       pgtype.Text
			policy                                      []byte
			publishedAt, deletedAt, updatedAt           pgtype.Timestamptz
			version                                     int32
			readable                                    bool
			adminOverride                               any
		)
		if err := rows.Scan(
			&inputIndex, &memberPublicID,
			&docID, &kind, &slug, &title, &category, &status, &visibility,
			&policy, &body, &frontmatter, &authorID,
			&publishedAt, &deletedAt, &deletedBy, &updatedAt, &version,
			&readable, &adminOverride,
		); err != nil {
			return nil, err
		}
		position := int(inputIndex) - 1
		if position < 0 || position >= len(positions) {
			continue
		}
		slot := positions[position]
		if !docID.Valid {
			continue
		}
		if !readable && !scope.Privileged() {
			continue
		}
		view, err := mapReadableDocumentRow(readable, adminOverride, docID, kind, slug, title, status, visibility, body, category, policy, frontmatter, authorID, publishedAt, deletedAt, deletedBy, updatedAt, version, scope, ctx, "document")
		if err != nil {
			if expected, ok := errors.AsType[*apierr.Error](err); ok && expected.Code == apierr.NotFound {
				continue
			}
			out[slot] = product.BatchResult[DocumentView]{Err: err}
			continue
		}
		out[slot] = product.BatchResult[DocumentView]{Value: &view}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	views := make([]*DocumentView, len(out))
	for i := range out {
		views[i] = out[i].Value
	}
	if err := p.setDocumentCapabilities(ctx, actor, views); err != nil {
		return nil, err
	}
	return out, nil
}
