package graphql

import (
	"net/http"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/transport"

	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
)

func NewHandler(resolver *graph.Resolver, limits Limits) http.Handler {
	if resolver == nil {
		return PlaceholderHandler()
	}
	srv := handler.New(graph.NewExecutableSchema(graph.Config{Resolvers: resolver}))
	srv.AddTransport(transport.POST{})
	srv.Use(extension.Introspection{})
	if limits.MaxComplexity > 0 {
		srv.Use(extension.FixedComplexityLimit(limits.MaxComplexity))
	}
	if limits.MaxDepth > 0 {
		srv.Use(extension.FixedComplexityLimit(limits.MaxComplexity))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := WithLoaders(r.Context(), NewLoaderRegistry())
		srv.ServeHTTP(w, r.WithContext(ctx))
	})
}
