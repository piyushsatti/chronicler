package document

import (
	"context"
	"log/slog"
	"sync"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// Queries are read-only document access with ViewerScope applied.
type Queries struct {
	Repo            ReadRepository
	Revisions       func(ctx context.Context, documentID string, limit, offset int) ([]Revision, error)
	Trash           func(ctx context.Context, limit, offset int) ([]TrashItem, error)
	BacklinksFn     func(ctx context.Context, scope ViewerScope, slug string) ([]Link, error)
	BacklinkCountFn func(ctx context.Context, scope ViewerScope, slug string) (int64, error)
}

type scopeCacheKey struct{}
type scopeCache struct {
	once  sync.Once
	scope ViewerScope
	err   error
}

// WithScopeCache shares one reader-grant read across concurrent GraphQL fields
// in this request. Live authority is already the request's verified snapshot.
func WithScopeCache(ctx context.Context) context.Context {
	return context.WithValue(ctx, scopeCacheKey{}, &scopeCache{})
}

func (q Queries) Scope(ctx context.Context) (ViewerScope, error) {
	if cache, ok := ctx.Value(scopeCacheKey{}).(*scopeCache); ok {
		cache.once.Do(func() { cache.scope, cache.err = q.resolveScope(ctx) })
		return cache.scope, cache.err
	}
	return q.resolveScope(ctx)
}

// ScopeFromContext is retained for legacy visibility-only callers. Query paths
// use Scope so a failed grant read propagates as an error instead of widening.
func (q Queries) ScopeFromContext(ctx context.Context) ViewerScope {
	scope, err := q.Scope(ctx)
	if err != nil {
		return ScopeFromClaims(auth.Claims{})
	}
	return scope
}

func (q Queries) resolveScope(ctx context.Context) (ViewerScope, error) {
	a, ok := auth.AuthorityFromContext(ctx)
	if !ok {
		return ScopeFromClaims(auth.Claims{}), nil
	}
	scope := ScopeFromAuthority(a)
	if scope.Anonymous || scope.MemberID == "" || q.Repo == nil {
		return scope, nil
	}
	readers, err := q.Repo.ReaderIDs(ctx, scope.MemberID)
	if err != nil {
		return ViewerScope{}, err
	}
	scope.ReaderOf = readers
	return scope, nil
}

func (q Queries) BySlug(ctx context.Context, slug string) (Document, error) {
	if q.Repo == nil {
		return Document{}, ErrNotFound
	}
	d, err := q.Repo.BySlug(ctx, slug)
	if err != nil {
		return Document{}, err
	}
	return q.checkDocument(ctx, d)
}

func (q Queries) ByID(ctx context.Context, id string) (Document, error) {
	if q.Repo == nil {
		return Document{}, ErrNotFound
	}
	d, err := q.Repo.ByID(ctx, id)
	if err != nil {
		return Document{}, err
	}
	return q.checkDocument(ctx, d)
}

func (q Queries) checkDocument(ctx context.Context, d Document) (Document, error) {
	scope, err := q.Scope(ctx)
	if err != nil {
		return Document{}, err
	}
	return projectDocument(ctx, d, scope)
}

// projectDocument is the sole returned-body boundary for direct, enumerated and
// batch reads. Repository bodies stay raw; returned values are request-scoped.
func projectDocument(ctx context.Context, d Document, scope ViewerScope) (Document, error) {
	projection, err := d.projectBody(scope)
	if err != nil {
		return Document{}, err
	}
	if projection.Overridden {
		ordinary := scope
		ordinary.IsAdmin = false
		auditScope := "block"
		if !d.Readable(ordinary) {
			auditScope = "document"
		}
		slog.InfoContext(ctx, "audience.admin_override", "document_id", d.ID, "member_id", scope.MemberID, "scope", auditScope)
	}
	d.Body = projection.Body
	d.BodyComplete = projection.Complete
	return d, nil
}

func (q Queries) List(ctx context.Context, filter ListFilter) ([]Document, int64, error) {
	if q.Repo == nil {
		return nil, 0, nil
	}
	scope, err := q.Scope(ctx)
	if err != nil {
		return nil, 0, err
	}
	items, total, err := q.Repo.List(ctx, scope, filter)
	if err != nil {
		return nil, 0, err
	}
	for i, d := range items {
		items[i], err = projectDocument(ctx, d, scope)
		if err != nil {
			return nil, 0, err
		}
	}
	return items, total, nil
}
