package document

import (
	"context"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type Revision struct {
	ID         string
	DocumentID string
	Reason     string
	Title      string
	CreatedAt  time.Time
}

type Link struct {
	DocumentID string
	TargetType string
	TargetID   string
	Relation   string
}

type TrashItem struct {
	ID        string    `json:"id"`
	Slug      string    `json:"slug"`
	Title     string    `json:"title"`
	DeletedAt time.Time `json:"deletedAt"`
}

func (q Queries) ListRevisions(ctx context.Context, documentID string, limit, offset int) ([]Revision, error) {
	a, ok := auth.AuthorityFromContext(ctx)
	if !ok {
		return nil, apierr.New(apierr.Unauthenticated, "sign in required")
	}
	scope := ScopeFromAuthority(a)
	if q.Repo == nil {
		return nil, ErrNotFound
	}
	authorID, err := q.Repo.RevisionAuthor(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if !scope.Privileged() && !scope.IsAuthor(authorID) {
		return nil, ErrForbidden
	}
	if q.Revisions == nil {
		return nil, nil
	}
	return q.Revisions(ctx, documentID, limit, offset)
}

func (q Queries) ListTrash(ctx context.Context, limit, offset int) ([]TrashItem, error) {
	a, ok := auth.AuthorityFromContext(ctx)
	if !ok {
		return nil, apierr.New(apierr.Unauthenticated, "sign in required")
	}
	if !ScopeFromAuthority(a).Privileged() {
		return nil, ErrForbidden
	}
	if q.Trash == nil {
		return nil, nil
	}
	return q.Trash(ctx, limit, offset)
}

func (q Queries) Backlinks(ctx context.Context, slug string) ([]Link, error) {
	if q.BacklinksFn == nil {
		return nil, nil
	}
	scope, err := q.Scope(ctx)
	if err != nil {
		return nil, err
	}
	return q.BacklinksFn(ctx, scope, slug)
}

func (q Queries) CountBacklinks(ctx context.Context, slug string) (int64, error) {
	if q.BacklinkCountFn == nil {
		return 0, nil
	}
	scope, err := q.Scope(ctx)
	if err != nil {
		return 0, err
	}
	return q.BacklinkCountFn(ctx, scope, slug)
}
