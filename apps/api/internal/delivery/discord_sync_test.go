package delivery_test

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
)

type fakeApplier struct {
	applied   []string
	revisions []int
}

func (f *fakeApplier) ApplyDiscordRevision(_ context.Context, questID string, desired int) error {
	f.applied = append(f.applied, questID)
	f.revisions = append(f.revisions, desired)
	return nil
}

func TestRESTSyncRequiresConfigUnlessDryRun(t *testing.T) {
	applier := &fakeApplier{}
	sync := delivery.RESTSync{Apply: applier}
	if err := sync.SyncQuest(context.Background(), "quest-1", 5); !errors.Is(err, delivery.ErrDiscordNotConfigured) {
		t.Fatalf("want ErrDiscordNotConfigured got %v", err)
	}
	if len(applier.applied) != 0 {
		t.Fatalf("must not apply without dry-run: %v", applier.applied)
	}

	sync.DryRun = true
	if err := sync.SyncQuest(context.Background(), "quest-1", 5); err != nil {
		t.Fatal(err)
	}
	if len(applier.revisions) != 1 || applier.revisions[0] != 5 || applier.applied[0] != "quest-1" {
		t.Fatalf("applied=%v revisions=%v", applier.applied, applier.revisions)
	}
}

func TestRecordingSyncAppliesRevision(t *testing.T) {
	applier := &fakeApplier{}
	sync := &delivery.RecordingSync{Apply: applier}
	if err := sync.SyncQuest(context.Background(), "quest-1", 2); err != nil {
		t.Fatal(err)
	}
	if len(sync.Calls) != 1 || applier.applied[0] != "quest-1" {
		t.Fatalf("calls=%v applied=%v", sync.Calls, applier.applied)
	}
}
