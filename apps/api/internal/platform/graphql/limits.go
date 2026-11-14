package graphql

import (
	"context"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/errcode"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

type depthLimit struct{ max int }

func (depthLimit) ExtensionName() string               { return "DepthLimit" }
func (depthLimit) Validate(gql.ExecutableSchema) error { return nil }
func (d depthLimit) MutateOperationContext(_ context.Context, op *gql.OperationContext) *gqlerror.Error {
	if exceedsDepth(op, op.Operation.SelectionSet, d.max) {
		err := gqlerror.Errorf("operation exceeds the depth limit of %d", d.max)
		errcode.Set(err, "DEPTH_LIMIT_EXCEEDED")
		return err
	}
	return nil
}

func exceedsDepth(op *gql.OperationContext, selections ast.SelectionSet, remaining int) bool {
	for _, field := range gql.CollectFields(op, selections, nil) {
		if remaining == 0 || exceedsDepth(op, field.Selections, remaining-1) {
			return true
		}
	}
	return false
}

type aliasLimit struct{ max int }

func (aliasLimit) ExtensionName() string               { return "AliasLimit" }
func (aliasLimit) Validate(gql.ExecutableSchema) error { return nil }
func (a aliasLimit) MutateOperationContext(_ context.Context, op *gql.OperationContext) *gqlerror.Error {
	if countRootAliases(op) > a.max {
		err := gqlerror.Errorf("operation exceeds the alias limit of %d", a.max)
		errcode.Set(err, "ALIAS_LIMIT_EXCEEDED")
		return err
	}
	return nil
}

func countRootAliases(op *gql.OperationContext) int {
	n := 0
	for _, field := range gql.CollectFields(op, op.Operation.SelectionSet, nil) {
		if field.Alias != "" && field.Alias != field.Name {
			n++
		}
	}
	return n
}
