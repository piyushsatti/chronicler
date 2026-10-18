package graphql

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/transport"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

func NewHandler(resolver *graph.Resolver, limits Limits, authority auth.AuthorityResolver) http.Handler {
	if resolver == nil {
		return PlaceholderHandler()
	}
	srv := handler.New(graph.NewExecutableSchema(graph.Config{Resolvers: resolver}))
	srv.SetErrorPresenter(func(ctx context.Context, err error) *gqlerror.Error {
		presented := gql.DefaultErrorPresenter(ctx, err)
		if expected, ok := errors.AsType[*apierr.Error](err); ok {
			presented.Message = expected.Message
			presented.Extensions = map[string]any{"code": string(expected.Code)}
		} else if presented.Err != nil {
			// gqlgen wraps resolver errors in gqlerror.Error before presenting.
			// Parser/validation errors have no wrapped cause and remain useful.
			slog.ErrorContext(ctx, "unexpected GraphQL error", "error", err)
			presented.Message = "Internal error"
			presented.Extensions = map[string]any{"code": string(apierr.Internal)}
		}
		return presented
	})
	srv.AddTransport(transport.POST{})
	srv.Use(extension.Introspection{})
	if limits.MaxComplexity > 0 {
		srv.Use(extension.FixedComplexityLimit(limits.MaxComplexity))
	}
	if limits.MaxDepth > 0 {
		srv.Use(extension.FixedComplexityLimit(limits.MaxComplexity))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := document.WithScopeCache(r.Context())
		ctx = WithLoaders(ctx, NewLoaderRegistry())
		if authority != nil {
			claims := auth.FromContext(r.Context())
			var initial *auth.Authority
			if live, ok := auth.AuthorityFromContext(r.Context()); ok {
				copy := live
				initial = &copy
			}
			state, err := graph.NewRequestState(claims, authority, initial)
			if err == nil {
				if _, err := graph.NewLoaderRegistry(resolver.BatchProviders, state); err == nil {
					ctx = graph.WithRequestState(ctx, state)
				}
			}
		}
		srv.ServeHTTP(w, r.WithContext(ctx))
	})
}
