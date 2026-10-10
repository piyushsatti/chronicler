package document

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// Queries are read-only document access with ViewerScope applied.
type Queries struct {
	Repo       ReadRepository
	Revisions  func(ctx context.Context, documentID string, limit, offset int) ([]Revision, error)
	Trash      func(ctx context.Context, limit, offset int) ([]TrashItem, error)
	BacklinksFn func(ctx context.Context, slug string) ([]Link, error)
}

func (q Queries) ScopeFromContext(ctx context.Context) ViewerScope {
	c := auth.FromContext(ctx)
	scope := ScopeFromClaims(c)
	if scope.Anonymous || scope.MemberID == "" || q.Repo == nil {
		return scope
	}
	readers, err := q.Repo.ReaderIDs(ctx, scope.MemberID)
	if err == nil && len(readers) > 0 {
		scope.ReaderOf = readers
	}
	return scope
}

func (q Queries) BySlug(ctx context.Context, slug string) (Document, error) {
	if q.Repo == nil {
		return Document{}, ErrNotFound
	}
	d, err := q.Repo.BySlug(ctx, slug)
	if err != nil {
		return Document{}, err
	}
	scope := q.ScopeFromContext(ctx)
	if _, err := d.EffectiveBody(scope); err != nil {
		return Document{}, err
	}
	return d, nil
}

func (q Queries) ByID(ctx context.Context, id string) (Document, error) {
	if q.Repo == nil {
		return Document{}, ErrNotFound
	}
	d, err := q.Repo.ByID(ctx, id)
	if err != nil {
		return Document{}, err
	}
	scope := q.ScopeFromContext(ctx)
	if _, err := d.EffectiveBody(scope); err != nil {
		return Document{}, err
	}
	return d, nil
}

func (q Queries) List(ctx context.Context, filter ListFilter) ([]Document, int64, error) {
	if q.Repo == nil {
		return nil, 0, nil
	}
	scope := q.ScopeFromContext(ctx)
	all, total, err := q.Repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	out := make([]Document, 0, len(all))
	for _, d := range all {
		if _, err := d.EffectiveBody(scope); err != nil {
			continue
		}
		out = append(out, d)
	}
	return out, total, nil
}
