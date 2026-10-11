package document

import (
	"context"
	"errors"
)

// BatchLoader loads documents by id for GraphQL DataLoader use.
type BatchLoader struct {
	Queries Queries
}

func (b BatchLoader) LoadMany(ctx context.Context, ids []string) ([]Document, error) {
	out := make([]Document, 0, len(ids))
	for _, id := range ids {
		d, err := b.Queries.ByID(ctx, id)
		if err != nil {
			if errors.Is(err, ErrNotFound) || errors.Is(err, ErrForbidden) {
				continue
			}
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}
