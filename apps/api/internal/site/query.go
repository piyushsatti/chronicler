package site

import "context"

type Queries struct {
	Stats func(ctx context.Context) (Stats, error)
}

func (q Queries) Home(ctx context.Context) (Stats, error) {
	if q.Stats == nil {
		return Stats{}, nil
	}
	return q.Stats(ctx)
}
