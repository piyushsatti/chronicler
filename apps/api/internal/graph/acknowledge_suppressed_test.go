package graph

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestAcknowledgeSuppressedNotificationsReturnsNotAvailable(t *testing.T) {
	r := &Resolver{}
	receipt, err := r.Mutation().AcknowledgeSuppressedNotifications(context.Background(), 10, CommandMeta{
		IdempotencyKey: "test-ack-suppressed",
	})
	if receipt != nil {
		t.Fatalf("expected nil receipt, got %+v", receipt)
	}
	if !errors.Is(err, notification.ErrAcknowledgeSuppressedNotAvailable) {
		t.Fatalf("err = %v, want ErrAcknowledgeSuppressedNotAvailable", err)
	}
	expected, ok := errors.AsType[*apierr.Error](err)
	if !ok {
		t.Fatalf("err type %T, want *apierr.Error", err)
	}
	if expected.Code != apierr.Conflict {
		t.Fatalf("code = %s, want CONFLICT", expected.Code)
	}
	if expected.Message != "acknowledge suppressed notifications is not available" {
		t.Fatalf("message = %q", expected.Message)
	}
}
