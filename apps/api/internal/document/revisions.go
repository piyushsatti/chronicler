package document

import (
	"context"
	"time"
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
	if q.Revisions == nil {
		return nil, nil
	}
	return q.Revisions(ctx, documentID, limit, offset)
}

func (q Queries) ListTrash(ctx context.Context, limit, offset int) ([]TrashItem, error) {
	if q.Trash == nil {
		return nil, nil
	}
	return q.Trash(ctx, limit, offset)
}

func (q Queries) Backlinks(ctx context.Context, slug string) ([]Link, error) {
	if q.BacklinksFn == nil {
		return nil, nil
	}
	return q.BacklinksFn(ctx, slug)
}
