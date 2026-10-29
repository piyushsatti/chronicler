package document

import "context"

type ReadRepository interface {
	// RevisionAuthor includes trashed rows for exact author/admin recovery.
	RevisionAuthor(ctx context.Context, id string) (string, error)
}
