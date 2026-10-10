package document

import "context"

type ReadRepository interface {
	ByID(ctx context.Context, id string) (Document, error)
	BySlug(ctx context.Context, slug string) (Document, error)
	List(ctx context.Context, filter ListFilter) ([]Document, int64, error)
	ReaderIDs(ctx context.Context, memberID string) (map[string]struct{}, error)
}

type ListFilter struct {
	Kind       *string
	Category   *string
	Status     *string
	Visibility *string
	Search     *string
	Limit      int
	Offset     int
}
