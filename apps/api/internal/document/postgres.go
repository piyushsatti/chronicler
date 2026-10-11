package document

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresReadRepo struct {
	q *dbgen.Queries
}

func NewPostgresReadRepo(pool *pgxpool.Pool) *PostgresReadRepo {
	return &PostgresReadRepo{q: dbgen.New(pool)}
}

func mapDoc(id pgtype.UUID, kind, slug, title, status, visibility, body string, authorID pgtype.UUID, policy []byte) Document {
	return Document{
		ID:         db.UUIDString(id),
		Kind:       kind,
		Slug:       slug,
		Title:      title,
		Status:     Status(status),
		Visibility: Visibility(visibility),
		AuthorID:   db.UUIDString(authorID),
		Body:       body,
		Policy:     policy,
	}
}

func (p *PostgresReadRepo) ByID(ctx context.Context, id string) (Document, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return Document{}, ErrNotFound
	}
	row, err := p.q.GetDocumentByID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Document{}, ErrNotFound
		}
		return Document{}, err
	}
	return mapDoc(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.AuthorID, row.Policy), nil
}

func (p *PostgresReadRepo) BySlug(ctx context.Context, slug string) (Document, error) {
	row, err := p.q.GetDocumentBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Document{}, ErrNotFound
		}
		return Document{}, err
	}
	return mapDoc(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.AuthorID, row.Policy), nil
}

func (p *PostgresReadRepo) List(ctx context.Context, scope ViewerScope, f ListFilter) ([]Document, int64, error) {
	viewer := SQLScope(scope)
	params := dbgen.ListDocumentsParams{
		Kind: optionalText(f.Kind), Category: optionalText(f.Category), Status: optionalText(f.Status),
		Visibility: optionalText(f.Visibility), Search: optionalText(f.Search),
		RowLimit: int32(f.Limit), RowOffset: int32(f.Offset),
		ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	}
	rows, err := p.q.ListDocuments(ctx, params)
	if err != nil {
		return nil, 0, err
	}
	total, err := p.q.CountDocuments(ctx, dbgen.CountDocumentsParams{
		Kind: params.Kind, Category: params.Category, Status: params.Status,
		Visibility: params.Visibility, Search: params.Search,
		ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]Document, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDoc(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.AuthorID, row.Policy))
	}
	overridden := false
	for _, row := range rows {
		overridden = overridden || row.AdminOverride
	}
	AuditSQLOverride(ctx, scope, overridden, "documents", "list")
	AuditSQLOverride(ctx, scope, total.AdminOverride, "documents", "count")
	return out, total.Total, nil
}

func (p *PostgresReadRepo) ReaderIDs(ctx context.Context, memberID string) (map[string]struct{}, error) {
	uid, err := db.ParseUUID(memberID)
	if err != nil {
		return map[string]struct{}{}, nil
	}
	ids, err := p.q.ListDocumentReaders(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		out[db.UUIDString(id)] = struct{}{}
	}
	return out, nil
}

func (p *PostgresReadRepo) ListRevisions(ctx context.Context, documentID string, limit, offset int) ([]Revision, error) {
	uid, err := db.ParseUUID(documentID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := p.q.ListDocumentRevisions(ctx, dbgen.ListDocumentRevisionsParams{
		DocumentID: uid,
		RowLimit:   int32(limit),
		RowOffset:  int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]Revision, 0, len(rows))
	for _, row := range rows {
		out = append(out, Revision{
			ID:         db.UUIDString(row.ID),
			DocumentID: db.UUIDString(row.DocumentID),
			Reason:     row.Reason,
			Title:      row.Title,
			CreatedAt:  row.CreatedAt.Time,
		})
	}
	return out, nil
}

func (p *PostgresReadRepo) RevisionAuthor(ctx context.Context, id string) (string, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return "", ErrNotFound
	}
	authorID, err := p.q.GetDocumentRevisionAuthor(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return db.UUIDString(authorID), nil
}

func (p *PostgresReadRepo) ListTrash(ctx context.Context, limit, offset int) ([]TrashItem, error) {
	rows, err := p.q.ListDocumentsTrash(ctx, dbgen.ListDocumentsTrashParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]TrashItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, TrashItem{
			ID:        db.UUIDString(row.ID),
			Slug:      row.Slug,
			Title:     row.Title,
			DeletedAt: row.DeletedAt.Time,
		})
	}
	return out, nil
}

func (p *PostgresReadRepo) Backlinks(ctx context.Context, scope ViewerScope, slug string) ([]Link, error) {
	viewer := SQLScope(scope)
	rows, err := p.q.ListDocumentBacklinksBySlug(ctx, dbgen.ListDocumentBacklinksBySlugParams{
		Slug: slug, ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Link, 0, len(rows))
	for _, row := range rows {
		out = append(out, Link{
			DocumentID: db.UUIDString(row.SourceID),
			TargetType: row.Kind,
			TargetID:   db.UUIDString(row.TargetID),
			Relation:   row.Relation,
		})
	}
	overridden := false
	for _, row := range rows {
		overridden = overridden || row.AdminOverride
	}
	AuditSQLOverride(ctx, scope, overridden, "backlinks", "list")
	return out, nil
}

// SQLViewer is the input to the Specification SQL interpreter. All consumers
// (including adjacent map-place projections) use this conversion.
type SQLViewer struct {
	ID            pgtype.UUID
	Roles         []string
	Handle        string
	Admin, LiveDM bool
	Readers       []pgtype.UUID
}

func SQLScope(scope ViewerScope) SQLViewer {
	v := SQLViewer{Roles: []string{}, Readers: []pgtype.UUID{}}
	if !scope.Authenticated() {
		return v
	}
	id, err := db.ParseUUID(scope.MemberID)
	if err != nil {
		return v
	}
	v.ID, v.Handle, v.Admin, v.LiveDM = id, scope.Handle, scope.Privileged(), scope.IsDM
	for _, role := range scope.Roles {
		v.Roles = append(v.Roles, string(role))
	}
	for reader := range scope.ReaderOf {
		if id, err := db.ParseUUID(reader); err == nil {
			v.Readers = append(v.Readers, id)
		}
	}
	return v
}

func optionalText(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func (p *PostgresReadRepo) CountBacklinks(ctx context.Context, scope ViewerScope, slug string) (int64, error) {
	viewer := SQLScope(scope)
	row, err := p.q.CountDocumentBacklinks(ctx, dbgen.CountDocumentBacklinksParams{
		Slug: slug, ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if err != nil {
		return 0, err
	}
	AuditSQLOverride(ctx, scope, row.AdminOverride, "backlinks", "count")
	return row.Total, nil
}
