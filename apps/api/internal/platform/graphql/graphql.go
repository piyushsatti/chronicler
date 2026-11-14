package graphql

import (
	"net/http"
)

// Limits are the Go GraphQL complexity, depth, alias, and introspection caps.
type Limits struct {
	MaxDepth      int
	MaxComplexity int
	MaxAliases    int
	Introspection bool
}

func DefaultLimits() Limits {
	return Limits{MaxDepth: 12, MaxComplexity: 100000, MaxAliases: 20, Introspection: true}
}

// PlaceholderHandler answers until gqlgen codegen lands.
func PlaceholderHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		_, _ = w.Write([]byte(`{"errors":[{"message":"graphql schema not generated yet","extensions":{"code":"NOT_IMPLEMENTED"}}]}`))
	})
}
