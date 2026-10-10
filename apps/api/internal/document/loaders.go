package document

import "context"

// BatchLoader loads documents by id for GraphQL DataLoader use.
type BatchLoader struct {
	Repo ReadRepository
}

func (b BatchLoader) LoadMany(ctx context.Context, ids []string) ([]Document, error) {
	out := make([]Document, 0, len(ids))
	for _, id := range ids {
		d, err := b.Repo.ByID(ctx, id)
		if err != nil {
			continue
		}
		out = append(out, d)
	}
	return out, nil
}
