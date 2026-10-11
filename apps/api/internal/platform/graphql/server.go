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
	"github.com/vektah/gqlparser/v2/gqlerror"
)

func NewHandler(resolver *graph.Resolver, limits Limits) http.Handler {
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
		ctx := WithLoaders(document.WithScopeCache(r.Context()), NewLoaderRegistry())
		srv.ServeHTTP(w, r.WithContext(ctx))
	})
}
