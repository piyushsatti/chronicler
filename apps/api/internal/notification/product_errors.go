package notification

import "github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"

// ErrAcknowledgeSuppressedNotAvailable is the interim NOT06=C expected failure
// until document-subject proof and Lock/Store exist. It must not be replaced by
// panic, silent success, or mark-oldest-unread shortcuts.
var ErrAcknowledgeSuppressedNotAvailable = apierr.New(
	apierr.Conflict,
	"acknowledge suppressed notifications is not available",
)
