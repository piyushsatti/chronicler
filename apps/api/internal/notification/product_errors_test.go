package notification

import (
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestErrAcknowledgeSuppressedNotAvailableIsTypedConflict(t *testing.T) {
	expected, ok := errors.AsType[*apierr.Error](ErrAcknowledgeSuppressedNotAvailable)
	if !ok {
		t.Fatalf("type %T, want *apierr.Error", ErrAcknowledgeSuppressedNotAvailable)
	}
	if expected.Code != apierr.Conflict {
		t.Fatalf("code = %s, want CONFLICT", expected.Code)
	}
	if expected.Message != "acknowledge suppressed notifications is not available" {
		t.Fatalf("message = %q", expected.Message)
	}
}
