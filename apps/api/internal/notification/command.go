package notification

import (
	"regexp"
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

const maxMarkReadIDs = 100

var (
	errInvalidReadRequest = apierr.New(apierr.Invalid, "Invalid notification read request")
	notificationUUID      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

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
