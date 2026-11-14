package document

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) ReadDocument(ctx context.Context, actor auth.Authority, spec DocumentSpec) (*DocumentView, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	row, err := p.queries().GetProductDocumentBySlug(ctx, dbgen.GetProductDocumentBySlugParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
		Slug: spec.Slug,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	view, err := mapGetProductDocumentSlugRow(row, scope, ctx)
	if err != nil {
		return nil, err
	}
	if err := p.setDocumentCapabilities(ctx, actor, []*DocumentView{&view}); err != nil {
		return nil, err
	}
	return &view, nil
}

func (p *ProductPostgres) ReadDocumentById(ctx context.Context, actor auth.Authority, spec DocumentByIdSpec) (*DocumentView, error) {
	docID, err := productDocumentID(spec.Id)
	if err != nil {
		return nil, err
	}
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	row, err := p.queries().GetProductDocumentByID(ctx, dbgen.GetProductDocumentByIDParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
		DocumentID: docID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	view, err := mapGetProductDocumentRow(row, scope, ctx)
	if err != nil {
		return nil, err
	}
	if err := p.setDocumentCapabilities(ctx, actor, []*DocumentView{&view}); err != nil {
		return nil, err
	}
	return &view, nil
}

func (p *ProductPostgres) ReadDocuments(ctx context.Context, actor auth.Authority, spec DocumentsSpec) (DocumentListResult, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return DocumentListResult{}, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	params := dbgen.ListProductDocumentsParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
		RowLimit: spec.Limit, RowOffset: spec.Offset,
	}
	if spec.Filters != nil {
		params.Kind = optionalProductText(spec.Filters.Kind)
		params.Category = optionalProductText(spec.Filters.Category)
		params.Status = optionalProductText(spec.Filters.Status)
		params.Visibility = optionalProductText(spec.Filters.Visibility)
		params.Search = optionalProductText(spec.Filters.Search)
		if spec.Filters.CreatedBy != nil {
			id, err := productDocumentID(*spec.Filters.CreatedBy)
			if err != nil {
				return DocumentListResult{}, err
			}
			params.AuthorID = id
		}
		if spec.Filters.Region != nil {
			id, err := productDocumentID(*spec.Filters.Region)
			if err != nil {
				return DocumentListResult{}, err
			}
			params.RegionID = id
		}
	}
	rows, err := p.queries().ListProductDocuments(ctx, params)
	if err != nil {
		return DocumentListResult{}, err
	}
	countRow, err := p.queries().CountProductDocuments(ctx, dbgen.CountProductDocumentsParams{
		ViewerAdmin: admin, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerLiveDm: liveDM,
		Kind: params.Kind, Category: params.Category, Status: params.Status, Visibility: params.Visibility,
		AuthorID: params.AuthorID, Search: params.Search, RegionID: params.RegionID,
	})
	if err != nil {
		return DocumentListResult{}, err
	}
	if override, _ := countRow.AdminOverride.(bool); override {
		AuditSQLOverride(ctx, scope, true, "documents", "count")
	}
	items := make([]DocumentView, 0, len(rows))
	for _, row := range rows {
		view, err := mapListProductDocumentRow(row, scope, ctx)
		if err != nil {
			return DocumentListResult{}, err
		}
		items = append(items, view)
	}
	if err := p.setDocumentCapabilities(ctx, actor, documentViewPointers(items)); err != nil {
		return DocumentListResult{}, err
	}
	return DocumentListResult{Items: items, Total: int32(countRow.Total)}, nil
}

func (p *ProductPostgres) ReadDocumentsTrash(ctx context.Context, _ auth.Authority, spec DocumentsTrashSpec) (DocumentListResult, error) {
	rows, err := p.queries().ListProductDocumentsTrash(ctx, dbgen.ListProductDocumentsTrashParams{
		RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return DocumentListResult{}, err
	}
	total, err := p.queries().CountProductDocumentsTrash(ctx)
	if err != nil {
		return DocumentListResult{}, err
	}
	items := make([]DocumentView, 0, len(rows))
	for _, row := range rows {
		view, err := documentFromParts(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, pgtype.Timestamptz{}, row.DeletedAt, row.DeletedBy, row.UpdatedAt, row.Version)
		if err != nil {
			return DocumentListResult{}, err
		}
		items = append(items, view)
	}
	return DocumentListResult{Items: items, Total: int32(total)}, nil
}

func (p *ProductPostgres) ReadDocumentRevisionParent(ctx context.Context, actor auth.Authority, documentID string) (*DocumentView, error) {
	id, err := productDocumentID(documentID)
	if err != nil {
		return nil, err
	}
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	row, err := p.queries().GetProductDocumentRevisionParent(ctx, dbgen.GetProductDocumentRevisionParentParams{
		DocumentID: id, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return nil, mapNotFound(err)
	}
	view, err := mapReadableDocumentRow(row.Readable, row.AdminOverride, row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt, row.DeletedAt, row.DeletedBy, row.UpdatedAt, row.Version, scope, ctx, "document_revisions")
	if err != nil {
		return nil, err
	}
	if err := p.setDocumentCapabilities(ctx, actor, []*DocumentView{&view}); err != nil {
		return nil, err
	}
	return &view, nil
}

func (p *ProductPostgres) ReadDocumentRevisions(ctx context.Context, actor auth.Authority, spec DocumentRevisionsSpec) (DocumentRevisionPage, error) {
	docID, err := productDocumentID(spec.DocumentId)
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	parent, err := p.ReadDocumentRevisionParent(ctx, actor, spec.DocumentId)
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	rows, err := p.queries().ListProductDocumentRevisions(ctx, dbgen.ListProductDocumentRevisionsParams{
		DocumentID: docID, RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	total, err := p.queries().CountProductDocumentRevisions(ctx, docID)
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	items := make([]DocumentRevisionView, 0, len(rows))
	for _, row := range rows {
		item, err := mapRevision(row)
		if err != nil {
			return DocumentRevisionPage{}, err
		}
		projected, err := ProjectDocumentView(ctx, scope, *parent, row.Body)
		if err != nil {
			return DocumentRevisionPage{}, err
		}
		item.Body = *projected.EffectiveBody
		items = append(items, item)
	}
	return DocumentRevisionPage{Items: items, Total: int32(total)}, nil
}

func (p *ProductPostgres) ReadDocumentBacklinks(ctx context.Context, actor auth.Authority, spec DocumentBacklinksSpec) ([]DocumentLinkView, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	rows, err := p.queries().ListProductDocumentBacklinks(ctx, dbgen.ListProductDocumentBacklinksParams{
		ViewerAdmin: admin, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerLiveDm: liveDM,
		Slug: spec.Slug, RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return nil, err
	}
	out := make([]DocumentLinkView, 0, len(rows))
	for _, row := range rows {
		if override, _ := row.AdminOverride.(bool); override {
			AuditSQLOverride(ctx, scope, true, "backlinks", "list")
		}
		out = append(out, DocumentLinkView{
			DocumentId: db.UUIDString(row.SourceID),
			TargetId:   db.UUIDString(row.TargetID),
			TargetType: "document",
			Relation:   row.Relation,
		})
	}
	return out, nil
}

func (p *ProductPostgres) ReadCodexCategories(ctx context.Context, actor auth.Authority, _ CodexCategoriesSpec) ([]CategoryCountView, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	rows, err := p.queries().ListProductCodexCategories(ctx, dbgen.ListProductCodexCategoriesParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return nil, err
	}
	out := make([]CategoryCountView, 0, len(rows))
	for _, row := range rows {
		if !row.Category.Valid {
			continue
		}
		out = append(out, CategoryCountView{Category: row.Category.String, Count: int32(row.Count)})
	}
	return out, nil
}

func (p *ProductPostgres) ReadCodexDirectory(ctx context.Context, actor auth.Authority, spec CodexDirectorySpec) (CodexDirectoryResult, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return CodexDirectoryResult{}, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	params := dbgen.ListProductCodexDirectoryParams{
		CategoryPrefix: optionalProductText(spec.CategoryPrefix),
		Search:         optionalProductText(spec.Search),
		ViewerID:       viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
		RowLimit: spec.Limit, RowOffset: spec.Offset,
	}
	rows, err := p.queries().ListProductCodexDirectory(ctx, params)
	if err != nil {
		return CodexDirectoryResult{}, err
	}
	total, err := p.queries().CountProductCodexDirectory(ctx, dbgen.CountProductCodexDirectoryParams{
		CategoryPrefix: params.CategoryPrefix, Search: params.Search,
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return CodexDirectoryResult{}, err
	}
	items := make([]DocumentView, 0, len(rows))
	for _, row := range rows {
		view, err := documentFromParts(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, pgtype.Timestamptz{}, pgtype.Timestamptz{}, pgtype.UUID{}, row.UpdatedAt, row.Version)
		if err != nil {
			return CodexDirectoryResult{}, err
		}
		projected, err := ProjectDocumentView(ctx, scope, view, row.Body)
		if err != nil {
			return CodexDirectoryResult{}, err
		}
		items = append(items, projected)
	}
	if err := p.setDocumentCapabilities(ctx, actor, documentViewPointers(items)); err != nil {
		return CodexDirectoryResult{}, err
	}
	return CodexDirectoryResult{Items: items, Total: int32(total)}, nil
}

func (p *ProductPostgres) ReadCodexEntry(ctx context.Context, actor auth.Authority, spec CodexEntrySpec) (*CodexEntryCardView, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	row, err := p.queries().GetProductCodexEntryBySlug(ctx, dbgen.GetProductCodexEntryBySlugParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
		Slug: spec.Slug,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !row.Readable {
		return nil, apierr.New(apierr.Forbidden, "document read forbidden")
	}
	view, err := documentFromParts(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, pgtype.Timestamptz{}, pgtype.Timestamptz{}, pgtype.UUID{}, row.UpdatedAt, row.Version)
	if err != nil {
		return nil, err
	}
	projected, err := ProjectDocumentView(ctx, scope, view, row.Body)
	if err != nil {
		return nil, err
	}
	if err := p.setDocumentCapabilities(ctx, actor, []*DocumentView{&projected}); err != nil {
		return nil, err
	}
	count, err := p.queries().CountProductDocumentBacklinks(ctx, dbgen.CountProductDocumentBacklinksParams{
		ViewerAdmin: admin, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerLiveDm: liveDM,
		Slug: spec.Slug,
	})
	if err != nil {
		return nil, err
	}
	if override, _ := count.AdminOverride.(bool); override {
		AuditSQLOverride(ctx, scope, true, "backlinks", "count")
	}
	return &CodexEntryCardView{Document: projected, BacklinkCount: int32(count.Total)}, nil
}

func (p *ProductPostgres) ReadLieutenantAssignments(ctx context.Context, _ auth.Authority, spec LieutenantAssignmentsSpec) (LieutenantPage, error) {
	params := dbgen.ListProductLieutenantAssignmentsParams{RowLimit: spec.Limit, RowOffset: spec.Offset}
	if spec.MemberId != nil {
		id, err := productDocumentID(*spec.MemberId)
		if err != nil {
			return LieutenantPage{}, err
		}
		params.MemberID = id
	}
	if spec.NpcDocumentId != nil {
		id, err := productDocumentID(*spec.NpcDocumentId)
		if err != nil {
			return LieutenantPage{}, err
		}
		params.NpcDocumentID = id
	}
	rows, err := p.queries().ListProductLieutenantAssignments(ctx, params)
	if err != nil {
		return LieutenantPage{}, err
	}
	total, err := p.queries().CountProductLieutenantAssignments(ctx, dbgen.CountProductLieutenantAssignmentsParams{
		MemberID: params.MemberID, NpcDocumentID: params.NpcDocumentID,
	})
	if err != nil {
		return LieutenantPage{}, err
	}
	items := make([]LieutenantAssignmentView, 0, len(rows))
	for _, row := range rows {
		items = append(items, LieutenantAssignmentView{
			MemberId:      db.UUIDString(row.MemberID),
			NpcDocumentId: db.UUIDString(row.NpcDocumentID),
			GrantedAt:     row.GrantedAt.Time,
			GrantedBy:     productUUIDPointer(row.GrantedBy),
		})
	}
	return LieutenantPage{Items: items, Total: int32(total)}, nil
}

func (p *ProductPostgres) ReadPreviewBody(ctx context.Context, actor auth.Authority, spec PreviewBodySpec) (string, error) {
	scope := ScopeFromAuthority(actor)
	scope.IsAdmin = false
	scope.IsDM = false
	scope.Roles = []auth.Role{auth.Player}
	if spec.AuthorId != nil {
		scope.MemberID = *spec.AuthorId
	}
	switch spec.Audience {
	case PreviewAudienceDM:
		scope.IsDM = true
		scope.Roles = append(scope.Roles, auth.DM)
	case PreviewAudiencePlayer:
	default:
		return "", apierr.New(apierr.Invalid, "invalid preview audience")
	}
	if spec.MemberHandle != nil {
		member, err := p.previewMemberScope(ctx, *spec.MemberHandle)
		if err != nil {
			return "", err
		}
		scope = member
	}
	doc := Document{Status: StatusPublished, Visibility: VisibilityPublic, Body: spec.Body, Policy: nil}
	body, err := doc.EffectiveBody(scope)
	if err != nil {
		return "", err
	}
	return body, nil
}

// previewMemberScope is the read scope of the active member who holds exactly
// this handle, built from the same live authority row and viewerScope that
// their own reads use. The administrator bypass is removed so the preview
// shows what the member's markers allow, not what an override would.
func (p *ProductPostgres) previewMemberScope(ctx context.Context, handle string) (ViewerScope, error) {
	notFound := apierr.New(apierr.NotFound, "member not found")
	rows, err := p.queries().ResolveProductMentionHandles(ctx, []string{handle})
	if err != nil {
		return ViewerScope{}, err
	}
	if len(rows) != 1 {
		return ViewerScope{}, notFound
	}
	row, err := p.queries().GetMemberAuthority(ctx, rows[0].ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ViewerScope{}, notFound
	}
	if err != nil {
		return ViewerScope{}, err
	}
	roles := make([]auth.Role, len(row.Roles))
	for i, role := range row.Roles {
		roles[i] = auth.Role(role)
	}
	member, err := auth.NewAuthorityWithHandle(db.UUIDString(row.ID), roles, row.Status, row.DmStatus, row.Handle)
	if err != nil {
		return ViewerScope{}, notFound // inactive members read nothing
	}
	scope, err := p.viewerScope(ctx, member)
	if err != nil {
		return ViewerScope{}, err
	}
	scope.IsAdmin = false
	return scope, nil
}

type docRow = dbgen.GetProductDocumentsByIDsRow

func mapGetProductDocumentsByIDsRow(row docRow, scope ViewerScope, ctx context.Context) (DocumentView, error) {
	return mapReadableDocumentRow(row.Readable, row.AdminOverride, row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt, row.DeletedAt, row.DeletedBy, row.UpdatedAt, row.Version, scope, ctx, "document")
}

func (p *ProductPostgres) readDocumentsByIDs(ctx context.Context, scope ViewerScope, ids []string) (map[string]docRow, error) {
	out := make(map[string]docRow, len(ids))
	uuids := make([]pgtype.UUID, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		docID, err := productDocumentID(id)
		if err != nil {
			continue
		}
		uuids = append(uuids, docID)
	}
	if len(uuids) == 0 {
		return out, nil
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	rows, err := p.queries().GetProductDocumentsByIDs(ctx, dbgen.GetProductDocumentsByIDsParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
		DocumentIds: uuids,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[db.UUIDString(row.ID)] = row
	}
	return out, nil
}

func (p *ProductPostgres) ReadableDocumentIDs(ctx context.Context, actor auth.Authority, ids []string) (map[string]bool, error) {
	out := make(map[string]bool, len(ids))
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	rows, err := p.readDocumentsByIDs(ctx, scope, ids)
	if err != nil {
		return nil, err
	}
	for _, id := range ids {
		if _, err := productDocumentID(id); err != nil {
			out[id] = false
			continue
		}
		row, ok := rows[id]
		if !ok {
			out[id] = false
			continue
		}
		out[id] = row.Readable || scope.Privileged()
	}
	return out, nil
}

func documentBatchResult(view *DocumentView, err error) product.BatchResult[DocumentView] {
	if err != nil {
		if expected, ok := errors.AsType[*apierr.Error](err); ok && expected.Code == apierr.Forbidden {
			return product.BatchResult[DocumentView]{}
		}
		return product.BatchResult[DocumentView]{Err: err}
	}
	return product.BatchResult[DocumentView]{Value: view}
}

func (p *ProductPostgres) fillBatchDocumentsByIDs(ctx context.Context, actor auth.Authority, out []product.BatchResult[DocumentView], indexes []int, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		for _, idx := range indexes {
			out[idx] = product.BatchResult[DocumentView]{Err: err}
		}
		return nil
	}
	rows, err := p.readDocumentsByIDs(ctx, scope, ids)
	if err != nil {
		for _, idx := range indexes {
			out[idx] = product.BatchResult[DocumentView]{Err: err}
		}
		return nil
	}
	for j, idx := range indexes {
		row, ok := rows[ids[j]]
		if !ok {
			continue
		}
		view, err := mapGetProductDocumentsByIDsRow(row, scope, ctx)
		if err != nil {
			out[idx] = documentBatchResult(nil, err)
			continue
		}
		out[idx] = documentBatchResult(&view, nil)
	}
	return nil
}

func (p *ProductPostgres) ReadBatchDocuments(ctx context.Context, actor auth.Authority, keys []DocumentKey) ([]product.BatchResult[DocumentView], error) {
	out := make([]product.BatchResult[DocumentView], len(keys))
	readCtx := context.WithValue(ctx, deferDocumentCapabilities{}, true)
	idIndexes := make([]int, 0, len(keys))
	ids := make([]string, 0, len(keys))
	for i, key := range keys {
		if key.BySlug {
			view, err := p.ReadDocument(readCtx, actor, DocumentSpec{Slug: key.Slug})
			out[i] = documentBatchResult(view, err)
			continue
		}
		id := key.ID
		if id == "" {
			id = key.Slug
		}
		if _, err := productDocumentID(id); err != nil {
			out[i] = product.BatchResult[DocumentView]{Err: err}
			continue
		}
		idIndexes = append(idIndexes, i)
		ids = append(ids, id)
	}
	if err := p.fillBatchDocumentsByIDs(readCtx, actor, out, idIndexes, ids); err != nil {
		return nil, err
	}
	views := make([]*DocumentView, len(out))
	for i := range out {
		views[i] = out[i].Value
	}
	if err := p.setDocumentCapabilities(ctx, actor, views); err != nil {
		return nil, err
	}
	return out, nil
}

// ReadBatchDmTables is implemented in product_postgres_dm_tables.go (member-keyed D5 lookup).

func (p *ProductPostgres) ReadBatchReaderIds(ctx context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[ReaderIDList], error) {
	out := make([]product.BatchResult[ReaderIDList], len(keys))
	for i := range keys {
		out[i] = product.BatchResult[ReaderIDList]{Value: &ReaderIDList{Items: []string{}}}
	}
	if len(keys) == 0 {
		return out, nil
	}
	ids := make([]pgtype.UUID, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := productDocumentID(key.ID)
		if err != nil {
			out[i] = product.BatchResult[ReaderIDList]{Err: err}
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.queries().ProductBatchDocumentReaderIds(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		position := int(row.InputIndex) - 1
		if position < 0 || position >= len(positions) {
			continue
		}
		slot := positions[position]
		if out[slot].Err != nil || !row.ReaderID.Valid {
			continue
		}
		list := out[slot].Value
		if list == nil {
			list = &ReaderIDList{Items: []string{}}
			out[slot] = product.BatchResult[ReaderIDList]{Value: list}
		}
		list.Items = append(list.Items, db.UUIDString(row.ReaderID))
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchSummaryDerived(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[SummaryDerivedView], error) {
	out := make([]product.BatchResult[SummaryDerivedView], len(keys))
	for i := range keys {
		out[i] = product.BatchResult[SummaryDerivedView]{Value: &SummaryDerivedView{
			Quests:  []SummaryQuestRefView{},
			Dms:     []SummaryDmView{},
			Hexes:   []SummaryHexView{},
			Players: []SummaryPlayerView{},
			Regions: []SummaryRegionView{},
		}}
	}
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
			out[i] = product.BatchResult[SummaryDerivedView]{Err: err}
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	params := dbgen.ProductSummaryDerivedQuestFactsParams{
		DocumentIds: ids, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	}
	questRows, err := p.queries().ProductSummaryDerivedQuestFacts(ctx, params)
	if err != nil {
		return nil, err
	}
	playerRows, err := p.queries().ProductSummaryDerivedPlayers(ctx, dbgen.ProductSummaryDerivedPlayersParams{
		DocumentIds: ids, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return nil, err
	}
	placeRows, err := p.queries().ProductSummaryDerivedPlaces(ctx, dbgen.ProductSummaryDerivedPlacesParams{
		DocumentIds: ids, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return nil, err
	}
	applySummaryDerivedQuestFacts(out, positions, questRows)
	applySummaryDerivedPlayers(out, positions, playerRows)
	applySummaryDerivedPlaces(out, positions, placeRows)
	if err := p.applySummaryAuthoring(ctx, actor, keys, out, positions, questRows); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchDocumentSubjects(ctx context.Context, actor auth.Authority, keys []DocumentSubjectsKey) ([]product.BatchResult[SubjectLinkList], error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	out := make([]product.BatchResult[SubjectLinkList], len(keys))
	for i, key := range keys {
		docID, err := productDocumentID(key.ParentID)
		if err != nil {
			out[i] = product.BatchResult[SubjectLinkList]{Err: err}
			continue
		}
		rows, err := p.queries().ListProductDocumentSubjects(ctx, dbgen.ListProductDocumentSubjectsParams{
			DocumentID: docID, ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
			RowLimit: key.Limit, RowOffset: key.Offset,
		})
		if err != nil {
			out[i] = product.BatchResult[SubjectLinkList]{Err: err}
			continue
		}
		items := make([]DocumentLinkView, 0, len(rows))
		for _, row := range rows {
			targetID, ok := row.TargetID.(pgtype.UUID)
			if !ok {
				continue
			}
			items = append(items, DocumentLinkView{
				DocumentId: key.ParentID,
				TargetType: row.TargetType,
				TargetId:   db.UUIDString(targetID),
				Relation:   row.Relation,
			})
		}
		out[i] = product.BatchResult[SubjectLinkList]{Value: &SubjectLinkList{Items: items}}
	}
	return out, nil
}
