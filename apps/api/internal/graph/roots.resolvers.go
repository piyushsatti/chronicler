package graph

// Query/Mutation root wiring for M1 _roots.graphql. gqlgen emits _roots.resolvers.go
// (ignored by Go because of the leading underscore); this file is compiled.

import (
	"context"
)

// ContractLayoutStub is the resolver for the _contractLayoutStub field.
func (r *mutationResolver) ContractLayoutStub(ctx context.Context) (bool, error) {
	return false, nil
}

// ContractLayoutStub is the resolver for the _contractLayoutStub field.
func (r *queryResolver) ContractLayoutStub(ctx context.Context) (bool, error) {
	return false, nil
}

// Mutation returns MutationResolver implementation.
func (r *Resolver) Mutation() MutationResolver { return &mutationResolver{r} }

// Query returns QueryResolver implementation.
func (r *Resolver) Query() QueryResolver { return &queryResolver{r} }

type mutationResolver struct{ *Resolver }
type queryResolver struct{ *Resolver }
