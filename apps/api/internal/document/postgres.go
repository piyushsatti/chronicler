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

// SQLViewer is shared input to the Specification SQL interpreter.
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
