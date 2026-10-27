package delivery_test

import (
	"context"
	"errors"
	"net/http"
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

func TestRESTSyncDryRunSkipsDiscordWhenConfigured(t *testing.T) {
	applier := &fakeApplier{}
	quests := &fakeQuests{}
	sync := delivery.RESTSync{
		Token:   "tok",
		GuildID: testGuild,
		DryRun:  true,
		Apply:   applier,
		Quests:  quests,
		HTTP: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			t.Fatal("dry-run must not call Discord")
			return nil, nil
		})},
	}
	if err := sync.SyncQuest(context.Background(), "quest-1", 9); err != nil {
		t.Fatal(err)
	}
	if len(applier.revisions) != 1 || applier.revisions[0] != 9 {
		t.Fatalf("revisions=%v", applier.revisions)
	}
	if quests.msgs != 0 || quests.thread != 0 || quests.events != 0 {
		t.Fatalf("dry-run must not touch the quest store: %+v", quests)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

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
