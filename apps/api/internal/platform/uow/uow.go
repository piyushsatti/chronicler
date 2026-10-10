// Package uow is the unit of work: one transaction per command.
//
// R is the set of repositories a slice needs, bound to that transaction. The
// runner commits when fn returns nil and rolls back otherwise. Nothing else
// commits.
package uow

import "context"

type Runner[R any] interface {
	Do(ctx context.Context, fn func(repos R) error) error
}
