package graph

import (
	"context"
	"fmt"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func productCommandMeta(meta CommandMeta) (product.CommandMeta, error) {
	if err := idempotency.Require(meta.IdempotencyKey); err != nil {
		return product.CommandMeta{}, err
	}
	return product.CommandMeta{IdempotencyKey: meta.IdempotencyKey}, nil
}

func (r *mutationResolver) mutationActor(ctx context.Context, meta CommandMeta) (auth.Authority, product.CommandMeta, error) {
	commandMeta, err := productCommandMeta(meta)
	if err != nil {
		return auth.Authority{}, product.CommandMeta{}, err
	}
	actor, err := LiveAuthority(ctx)
	if err != nil {
		return auth.Authority{}, product.CommandMeta{}, err
	}
	return actor, commandMeta, nil
}

func clearMutationLoaders(ctx context.Context) {
	if state, ok := RequestStateFromContext(ctx); ok {
		state.ClearLoaders()
	}
}

func invalidateMutationAuthority(ctx context.Context) {
	if state, ok := RequestStateFromContext(ctx); ok {
		state.InvalidateAuthority()
	}
}

func memberCommandsUnavailable() error {
	return fmt.Errorf("member commands unavailable")
}
