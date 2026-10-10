package character

import "context"

type CharacterView struct {
	ID        string
	ShortCode string
	Name      string
	OwnerID   string
	Status    string
	PCXP      int
}

type Queries struct {
	GetByID        func(ctx context.Context, id string) (CharacterView, error)
	GetByShortCode func(ctx context.Context, code string) (CharacterView, error)
	ListByOwnerFn  func(ctx context.Context, ownerID string, limit, offset int) ([]CharacterView, error)
	ListAll        func(ctx context.Context, status *string, limit, offset int) ([]CharacterView, error)
}

func (q Queries) Character(ctx context.Context, id, shortCode *string) (CharacterView, error) {
	if id != nil && *id != "" && q.GetByID != nil {
		return q.GetByID(ctx, *id)
	}
	if shortCode != nil && *shortCode != "" && q.GetByShortCode != nil {
		return q.GetByShortCode(ctx, *shortCode)
	}
	return CharacterView{}, ErrNotFound
}

func (q Queries) List(ctx context.Context, status *string, limit, offset int) ([]CharacterView, error) {
	if q.ListAll == nil {
		return nil, nil
	}
	return q.ListAll(ctx, status, limit, offset)
}

func (q Queries) ListByOwner(ctx context.Context, ownerID string, limit, offset int) ([]CharacterView, error) {
	if q.ListByOwnerFn == nil {
		return nil, nil
	}
	return q.ListByOwnerFn(ctx, ownerID, limit, offset)
}
