// Package notification owns member-scoped notification queries and commands.
package notification

import "context"

// Repository reads notifications for the verified caller's public member UUID.
// Reads do not acknowledge, suppress, mark read or commit.
type Repository interface {
	UnreadCount(context.Context, string) (int64, error)
}
