package notification

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

const maxMarkReadIDs = 100

var (
	errCommandUnavailable = errors.New("notification command unavailable")
	errInvalidReadRequest = apierr.New(apierr.Invalid, "Invalid notification read request")
	notificationUUID      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

// CommandRepository is bound to the command's transaction. It never commits.
// Unknown, foreign and already-read public IDs are deliberately indistinguishable.
type CommandRepository interface {
	MarkRead(context.Context, string, []string) error
}

type Commands struct{ tx uow.Runner[CommandRepository] }

func NewCommands(tx uow.Runner[CommandRepository]) Commands { return Commands{tx: tx} }

// MarkRead returns success only after the runner acknowledges commit. A commit
// error can have an unknown outcome; retry is safe because read_at never moves.
func (c Commands) MarkRead(ctx context.Context, memberID string, ids []string) error {
	normalized, err := normalizeReadIDs(ids)
	if err != nil {
		return err
	}
	if !notificationUUID.MatchString(memberID) {
		return errAuthorityUnavailable
	}
	if c.tx == nil {
		return errCommandUnavailable
	}
	return c.tx.Do(ctx, func(repo CommandRepository) error {
		if repo == nil {
			return errCommandUnavailable
		}
		return repo.MarkRead(ctx, memberID, normalized)
	})
}

func normalizeReadIDs(ids []string) ([]string, error) {
	// Apply the input bound before deduplication, including case variants.
	if ids == nil || len(ids) > maxMarkReadIDs {
		return nil, errInvalidReadRequest
	}
	result := make([]string, 0, len(ids))
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if !notificationUUID.MatchString(id) {
			return nil, errInvalidReadRequest
		}
		id = strings.ToLower(id)
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result, nil
}
