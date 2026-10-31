package graph

import (
	"context"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/ast"
)

func collectedSelection(ctx context.Context, path ...string) bool {
	operation := graphql.GetOperationContext(ctx)
	var selected func(ast.SelectionSet, []string) bool
	selected = func(selections ast.SelectionSet, remaining []string) bool {
		for _, field := range graphql.CollectFields(operation, selections, nil) {
			if field.Name == remaining[0] && (len(remaining) == 1 || selected(field.Selections, remaining[1:])) {
				return true
			}
		}
		return false
	}
	return selected(graphql.GetFieldContext(ctx).Field.Selections, path)
}
