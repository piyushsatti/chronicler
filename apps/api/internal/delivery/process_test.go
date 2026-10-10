package delivery_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type captureSync struct {
	id  string
	rev int
}

func (c *captureSync) SyncQuest(_ context.Context, id string, rev int) error {
	c.id = id
	c.rev = rev
	return nil
}

func TestProcessOnePassesEnqueuedRevision(t *testing.T) {
	payload, err := json.Marshal(jobs.QuestDiscordPayload{
		ID:              7,
		PublicID:        "quest-1",
		DesiredRevision: 4,
	})
	if err != nil {
		t.Fatal(err)
	}
	store := &delivery.MemoryStore{Jobs: []jobs.Job{{
		ID:        "1",
		Key:       jobs.QuestDiscordKey("quest-1"),
		Kind:      delivery.KindQuestDiscord,
		Lane:      delivery.LaneDiscord,
		State:     jobs.Queued,
		Payload:   payload,
		NextRunAt: time.Now(),
	}}}
	sync := &captureSync{}
	ok, err := delivery.NewHandler(store, sync).ProcessOne(context.Background())
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if sync.id != "quest-1" || sync.rev != 4 {
		t.Fatalf("sync id=%s rev=%d", sync.id, sync.rev)
	}
}
