package graph

import (
	"context"
	"strings"
	"testing"
)

func TestAcknowledgeSuppressedNotificationsRequiresCommands(t *testing.T) {
	r := &Resolver{Services: Services{}}
	receipt, err := r.Mutation().AcknowledgeSuppressedNotifications(context.Background(), 10, CommandMeta{
		IdempotencyKey: "test-ack-suppressed",
	})
	if receipt != nil {
		t.Fatalf("receipt = %#v, want nil", receipt)
	}
	if err == nil {
		t.Fatal("expected unavailable commands error")
	}
	if strings.Contains(err.Error(), "not available") {
		t.Fatalf("interim not-available path remains: %v", err)
	}
}
