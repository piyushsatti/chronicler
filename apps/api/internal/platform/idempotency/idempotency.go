package idempotency

import (
	"context"
	"errors"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

var (
	ErrMissingKey = apierr.New(apierr.Invalid, "idempotency key required")
	ErrConflict   = apierr.New(apierr.Conflict, "idempotency key already used")
)

// Store claims a key inside the caller's transaction.
type Store interface {
	// Claim inserts the key. Returns ErrConflict if the key already exists.
	Claim(ctx context.Context, endpoint, key, actorID string) error
}

func Require(key string) error {
	if key == "" {
		return ErrMissingKey
	}
	return nil
}

func IsConflict(err error) bool {
	return errors.Is(err, ErrConflict)
}
