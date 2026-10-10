package member

import "context"

type Queries struct {
	Lookup   func(ctx context.Context, id string) (Member, error)
	ByHandle func(ctx context.Context, handle string) (Member, error)
	ListFn   func(ctx context.Context, f ListFilter) ([]Member, int64, error)
	AvailabilityFn func(ctx context.Context, memberID string) ([]AvailabilityWindow, error)
}

func (q Queries) Get(ctx context.Context, id, handle *string) (Member, error) {
	if id != nil && *id != "" && q.Lookup != nil {
		return q.Lookup(ctx, *id)
	}
	if handle != nil && *handle != "" && q.ByHandle != nil {
		return q.ByHandle(ctx, *handle)
	}
	return Member{}, ErrNotFound
}

func (q Queries) List(ctx context.Context, f ListFilter) ([]Member, int64, error) {
	if q.ListFn == nil {
		return nil, 0, nil
	}
	return q.ListFn(ctx, f)
}

func (q Queries) Availability(ctx context.Context, memberID string) ([]AvailabilityWindow, error) {
	if q.AvailabilityFn == nil {
		return nil, nil
	}
	return q.AvailabilityFn(ctx, memberID)
}
