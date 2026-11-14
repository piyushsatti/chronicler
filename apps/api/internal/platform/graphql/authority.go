package graphql

import (
	"context"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type liveAuthority struct {
	resolve   auth.AuthorityResolver
	providers graph.BatchProviders
	present   func(context.Context, error) *gqlerror.Error
}

func (liveAuthority) ExtensionName() string               { return "LiveAuthority" }
func (liveAuthority) Validate(gql.ExecutableSchema) error { return nil }

func (a liveAuthority) InterceptOperation(ctx context.Context, next gql.OperationHandler) gql.ResponseHandler {
	claims := auth.FromContext(ctx)
	var initial *auth.Authority
	if !claims.Anonymous() {
		resolved, err := a.resolve(ctx, claims.MemberID)
		if err != nil {
			return gql.OneShot(&gql.Response{Errors: gqlerror.List{a.present(ctx, err)}})
		}
		if resolved.Claims().MemberID != claims.MemberID || resolved.Claims().Anonymous() {
			return gql.OneShot(&gql.Response{Errors: gqlerror.List{a.present(ctx, apierr.New(apierr.Forbidden, "member authority mismatch"))}})
		}
		initial = &resolved
	}
	state, err := graph.NewRequestState(claims, a.resolve, initial)
	if err != nil {
		return gql.OneShot(&gql.Response{Errors: gqlerror.List{a.present(ctx, err)}})
	}
	if _, err := graph.NewLoaderRegistry(a.providers, state); err != nil {
		return gql.OneShot(&gql.Response{Errors: gqlerror.List{a.present(ctx, err)}})
	}
	return next(graph.WithRequestState(ctx, state))
}
