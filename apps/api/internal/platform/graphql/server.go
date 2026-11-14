package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/transport"

	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

func NewHandler(resolver *graph.Resolver, limits Limits, authority auth.AuthorityResolver) http.Handler {
	if resolver == nil {
		return PlaceholderHandler()
	}
	srv := handler.New(graph.NewExecutableSchema(graph.Config{Resolvers: resolver, Complexity: graph.ListComplexity()}))
	present := func(ctx context.Context, err error) *gqlerror.Error {
		presented := gql.DefaultErrorPresenter(ctx, err)
		if expected, ok := errors.AsType[*apierr.Error](err); ok {
			presented.Message = expected.Message
			presented.Extensions = map[string]any{"code": string(expected.Code)}
			// Recover already logged bare Internal; Wrap sites carry a cause to log.
			if expected.Cause != nil {
				slog.ErrorContext(ctx, "unexpected GraphQL error", "error", expected)
			}
		} else if presented.Err != nil {
			// gqlgen wraps resolver errors in gqlerror.Error before presenting.
			// Parser/validation errors have no wrapped cause and remain useful.
			slog.ErrorContext(ctx, "unexpected GraphQL error", "error", err)
			presented.Message = "Internal error"
			presented.Extensions = map[string]any{"code": string(apierr.Internal)}
		}
		return presented
	}
	srv.SetErrorPresenter(present)
	srv.SetRecoverFunc(func(ctx context.Context, v any) error {
		slog.ErrorContext(ctx, "panic", "panic", v, "stack", string(debug.Stack()))
		return apierr.New(apierr.Internal, "Internal error")
	})
	srv.AddTransport(transport.POST{})
	srv.Use(extension.Introspection{})
	if limits.MaxDepth > 0 {
		srv.Use(depthLimit{max: limits.MaxDepth})
	}
	if limits.MaxComplexity > 0 {
		srv.Use(extension.FixedComplexityLimit(limits.MaxComplexity))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if authority != nil {
			claims := auth.FromContext(r.Context())
			var initial *auth.Authority
			if live, ok := auth.AuthorityFromContext(r.Context()); ok {
				copy := live
				initial = &copy
			}
			state, err := graph.NewRequestState(claims, authority, initial)
			if err != nil {
				writeRequestError(w, r, present, err)
				return
			}
			if _, err := graph.NewLoaderRegistry(resolver.BatchProviders, state); err != nil {
				writeRequestError(w, r, present, err)
				return
			}
			ctx = graph.WithRequestState(ctx, state)
		}
		srv.ServeHTTP(w, r.WithContext(ctx))
	})
}

func writeRequestError(w http.ResponseWriter, r *http.Request, present func(context.Context, error) *gqlerror.Error, err error) {
	slog.ErrorContext(r.Context(), "graphql request state", "error", err)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"errors": []*gqlerror.Error{present(r.Context(), err)}})
}
