package document

import "context"

type ReadRepository interface {
	ByID(ctx context.Context, id string) (Document, error)
	BySlug(ctx context.Context, slug string) (Document, error)
	// RevisionAuthor includes trashed rows; raw revision recovery remains
	// available only after the query boundary verifies exact author/admin.
	RevisionAuthor(ctx context.Context, id string) (string, error)
	// List applies scope before paging/counting, using the Specification SQL interpreter.
	List(ctx context.Context, scope ViewerScope, filter ListFilter) ([]Document, int64, error)
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
