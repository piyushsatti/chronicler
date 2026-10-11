package notification

import (
	"context"
	"errors"
)

var (
	errUnavailable          = errors.New("notification unread count unavailable")
	errInvalidCount         = errors.New("negative notification unread count")
	errAuthorityUnavailable = errors.New("notification member authority unavailable")
)

// Queries is the read side of the notification slice. A missing repository is
// an internal failure, never a successful empty inbox.
type Queries struct {
	Repo Repository
}

func (q Queries) UnreadCount(ctx context.Context, memberID string) (int64, error) {
	if q.Repo == nil {
		return 0, errUnavailable
	}
	count, err := q.Repo.UnreadCount(ctx, memberID)
	if err != nil {
		return 0, err
	}
	if count < 0 {
		return 0, errInvalidCount
	}
	return count, nil
}
