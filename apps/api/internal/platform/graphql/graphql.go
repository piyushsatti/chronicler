package graphql

import (
	"context"
	"net/http"
)

// LoaderRegistry holds per-request DataLoaders. Resolvers pull loaders from
// the request context; nothing else stores them.
type LoaderRegistry struct {
	loaders map[string]any
}

func NewLoaderRegistry() *LoaderRegistry {
	return &LoaderRegistry{loaders: map[string]any{}}
}

func (r *LoaderRegistry) Set(name string, loader any) {
	r.loaders[name] = loader
}

func (r *LoaderRegistry) Get(name string) (any, bool) {
	v, ok := r.loaders[name]
	return v, ok
}

type ctxKey struct{}

func WithLoaders(ctx context.Context, reg *LoaderRegistry) context.Context {
	return context.WithValue(ctx, ctxKey{}, reg)
}

func Loaders(ctx context.Context) *LoaderRegistry {
	reg, _ := ctx.Value(ctxKey{}).(*LoaderRegistry)
	return reg
}

// Limits are the Go GraphQL complexity and depth caps.
type Limits struct {
	MaxDepth      int
	MaxComplexity int
}

func DefaultLimits() Limits {
	return Limits{MaxDepth: 12, MaxComplexity: 250}
}

// PlaceholderHandler answers until gqlgen codegen lands.
func PlaceholderHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		_, _ = w.Write([]byte(`{"errors":[{"message":"graphql schema not generated yet","extensions":{"code":"NOT_IMPLEMENTED"}}]}`))
	})
}
