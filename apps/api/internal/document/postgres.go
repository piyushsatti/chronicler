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

func mapDoc(id pgtype.UUID, kind, slug, title, status, visibility, body string, authorID pgtype.UUID) Document {
	var vis Visibility
	switch visibility {
	case string(VisibilityDMOnly), string(VisibilityRestricted), string(VisibilityPublic):
		vis = Visibility(visibility)
	default:
		vis = VisibilityPublic
	}
	return Document{
		ID:         db.UUIDString(id),
		Kind:       kind,
		Slug:       slug,
		Title:      title,
		Status:     Status(status),
		Visibility: vis,
		AuthorID:   db.UUIDString(authorID),
		Body:       body,
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
	return mapDoc(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.AuthorID), nil
}

func (p *PostgresReadRepo) BySlug(ctx context.Context, slug string) (Document, error) {
	row, err := p.q.GetDocumentBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Document{}, ErrNotFound
		}
		return Document{}, err
	}
	return mapDoc(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.AuthorID), nil
}

func (p *PostgresReadRepo) List(ctx context.Context, f ListFilter) ([]Document, int64, error) {
	params := dbgen.ListDocumentsParams{
		Column1: db.OptString(f.Kind),
		Column2: db.OptString(f.Category),
		Column3: db.OptString(f.Status),
		Column4: db.OptString(f.Visibility),
		Column5: db.OptString(f.Search),
		Limit:   int32(f.Limit),
		Offset:  int32(f.Offset),
	}
	rows, err := p.q.ListDocuments(ctx, params)
	if err != nil {
		return nil, 0, err
	}
	total, err := p.q.CountDocuments(ctx, dbgen.CountDocumentsParams{
		Column1: params.Column1,
		Column2: params.Column2,
		Column3: params.Column3,
		Column4: params.Column4,
		Column5: params.Column5,
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]Document, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDoc(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.AuthorID))
	}
	return out, total, nil
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

func (p *PostgresReadRepo) Backlinks(ctx context.Context, slug string) ([]Link, error) {
	rows, err := p.q.ListDocumentBacklinksBySlug(ctx, slug)
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
	return out, nil
}
