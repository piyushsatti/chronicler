package delivery_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type captureSync struct {
	id  string
	rev int
	err error
}

func (c *captureSync) SyncQuest(_ context.Context, id string, rev int) error {
	c.id = id
	c.rev = rev
	return c.err
}

type captureReconcile struct {
	ids []string
}

func (c *captureReconcile) Reconcile(_ context.Context, id string) error {
	c.ids = append(c.ids, id)
	return nil
}

func queuedDiscordJob(t *testing.T, publicID string, desired int, attempts int) jobs.Job {
	t.Helper()
	payload, err := json.Marshal(jobs.QuestDiscordPayload{
		ID:              7,
		PublicID:        publicID,
		DesiredRevision: desired,
	})
	if err != nil {
		t.Fatal(err)
	}
	return jobs.Job{
		ID:        "1",
		Key:       jobs.QuestDiscordKey(publicID),
		Kind:      delivery.KindQuestDiscord,
		Lane:      delivery.LaneDiscord,
		State:     jobs.Queued,
		Attempts:  attempts,
		Payload:   payload,
		NextRunAt: time.Now(),
	}
}

func TestProcessOnePassesEnqueuedRevision(t *testing.T) {
	store := &delivery.MemoryStore{Jobs: []jobs.Job{queuedDiscordJob(t, "quest-1", 4, 0)}}
	sync := &captureSync{}
	reconcile := &captureReconcile{}
	ok, err := delivery.NewHandler(store, sync).WithReconciler(reconcile).ProcessOne(context.Background())
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if sync.id != "quest-1" || sync.rev != 4 {
		t.Fatalf("sync id=%s rev=%d", sync.id, sync.rev)
	}
	if len(reconcile.ids) != 1 || reconcile.ids[0] != "quest-1" {
		t.Fatalf("reconcile=%v", reconcile.ids)
	}
	if store.Jobs[0].State != jobs.Succeeded {
		t.Fatalf("state=%s", store.Jobs[0].State)
	}
}

func TestDiscordEventStateFailureParksJobForRepair(t *testing.T) {
	store := &delivery.MemoryStore{Jobs: []jobs.Job{queuedDiscordJob(t, testQuestID, 2, 0)}}
	q := baseQuest(testVoice)
	q.Status, q.MessageID, q.EventID = "cancelled", "existing-message", "existing-event"
	posts := 0
	sync := delivery.RESTSync{
		Token: "tok", GuildID: testGuild, FallbackChannelID: testChannel, FallbackOrigin: testOrigin,
		Quests: &fakeQuests{quest: q},
		HTTP: &http.Client{Transport: discordTransport(func(r *http.Request) (*http.Response, error) {
			if r.Method == http.MethodPost {
				posts++
			}
			return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"status":9}`))}, nil
		})},
	}
	ok, err := delivery.NewHandler(store, sync).ProcessOne(context.Background())
	if err != nil || !ok {
		t.Fatalf("processed=%v error=%v", ok, err)
	}
	job := store.Jobs[0]
	if job.State != jobs.RepairRequired || job.Attempts != 1 || job.SafeErrorCode != "" || posts != 0 {
		t.Fatalf("state=%s attempts=%d code=%q creations=%d", job.State, job.Attempts, job.SafeErrorCode, posts)
	}
}

func TestProcessOneDryRunWorkerAdvancesAppliedRevision(t *testing.T) {
	store := &delivery.MemoryStore{Jobs: []jobs.Job{queuedDiscordJob(t, "quest-dry", 3, 0)}}
	applier := &fakeApplier{}
	sync := delivery.RESTSync{
		Token:   "tok",
		GuildID: testGuild,
		DryRun:  true,
		Apply:   applier,
	}
	ok, err := delivery.NewHandler(store, sync).ProcessOne(context.Background())
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if len(applier.revisions) != 1 || applier.revisions[0] != 3 || applier.applied[0] != "quest-dry" {
		t.Fatalf("applied=%v revisions=%v", applier.applied, applier.revisions)
	}
	if store.Jobs[0].State != jobs.Succeeded {
		t.Fatalf("state=%s", store.Jobs[0].State)
	}
}

func TestProcessOneBadPayloadGoesDead(t *testing.T) {
	cases := []struct {
		name    string
		payload []byte
	}{
		{"empty", nil},
		{"invalid json", []byte(`{`)},
		{"missing public_id", []byte(`{"desired_revision":1}`)},
		{"zero revision", []byte(`{"public_id":"quest-1","desired_revision":0}`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := &delivery.MemoryStore{Jobs: []jobs.Job{{
				ID:        "1",
				Key:       "quest-discord:bad",
				Kind:      delivery.KindQuestDiscord,
				Lane:      delivery.LaneDiscord,
				State:     jobs.Queued,
				Payload:   tc.payload,
				NextRunAt: time.Now(),
			}}}
			ok, err := delivery.NewHandler(store, &captureSync{}).ProcessOne(context.Background())
			if err != nil || !ok {
				t.Fatalf("ok=%v err=%v", ok, err)
			}
			if store.Jobs[0].State != jobs.Dead {
				t.Fatalf("state=%s want dead", store.Jobs[0].State)
			}
			if !strings.Contains(store.Jobs[0].ErrorMessage, delivery.ErrBadPayload.Error()) {
				t.Fatalf("error message=%q", store.Jobs[0].ErrorMessage)
			}
		})
	}
}

func TestProcessOneSyncFailureRetriesThenDies(t *testing.T) {
	store := &delivery.MemoryStore{Jobs: []jobs.Job{queuedDiscordJob(t, "quest-1", 2, 0)}}
	sync := &captureSync{err: delivery.ErrDiscordNotConfigured}
	ok, err := delivery.NewHandler(store, sync).ProcessOne(context.Background())
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if store.Jobs[0].State != jobs.RetryWait {
		t.Fatalf("state=%s want retry_wait", store.Jobs[0].State)
	}

	// Claim increments attempts; MaxAttempts-1 before claim yields MaxAttempts after.
	store.Jobs[0].State = jobs.Queued
	store.Jobs[0].Attempts = jobs.MaxAttempts - 1
	store.Jobs[0].NextRunAt = time.Now()
	ok, err = delivery.NewHandler(store, sync).ProcessOne(context.Background())
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if store.Jobs[0].State != jobs.Dead {
		t.Fatalf("state=%s want dead after max attempts", store.Jobs[0].State)
	}
}

// restDiscordJob runs one claimed delivery job against the fake Discord API.
func restDiscordJob(t *testing.T, f *fakeDiscord) *delivery.MemoryStore {
	t.Helper()
	store := &delivery.MemoryStore{Jobs: []jobs.Job{queuedDiscordJob(t, testQuestID, 1, 0)}}
	sync := newSync(f, &fakeQuests{quest: baseQuest(testVoice)}, fullSettings, &fakeApplier{})
	ok, err := delivery.NewHandler(store, sync).ProcessOne(context.Background())
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	return store
}

func TestProcessOneDiscordForbiddenParksForRepairWithoutRetry(t *testing.T) {
	f := newFakeDiscord(t)
	f.failStatus = http.StatusForbidden
	f.fail = func(c discordCall) bool { return c.Method == http.MethodPost && strings.HasSuffix(c.Path, "/messages") }
	store := restDiscordJob(t, f)
	job := store.Jobs[0]
	if job.State != jobs.RepairRequired {
		t.Fatalf("state=%s want repair_required", job.State)
	}
	if job.Attempts != 1 {
		t.Fatalf("attempts=%d want 1", job.Attempts)
	}
	if !strings.Contains(job.ErrorMessage, "discord create message: discord api status 403") {
		t.Fatalf("error message=%q", job.ErrorMessage)
	}
	if job.SafeErrorCode != delivery.SafeCodeDiscordPermission {
		t.Fatalf("safe error code=%q want %q", job.SafeErrorCode, delivery.SafeCodeDiscordPermission)
	}
	if n := len(f.find(http.MethodPost, "/messages")); n != 1 {
		t.Fatalf("create message calls=%d want 1", n)
	}
}

func TestProcessOneDiscordServerErrorStillRetries(t *testing.T) {
	f := newFakeDiscord(t)
	f.failStatus = http.StatusInternalServerError
	f.fail = func(c discordCall) bool { return c.Method == http.MethodPost && strings.HasSuffix(c.Path, "/messages") }
	store := restDiscordJob(t, f)
	if store.Jobs[0].State != jobs.RetryWait || store.Jobs[0].SafeErrorCode != "" {
		t.Fatalf("state=%s code=%q want retry_wait without a safe code", store.Jobs[0].State, store.Jobs[0].SafeErrorCode)
	}
}

func TestProcessOneThreadForbiddenDoesNotFailTheJob(t *testing.T) {
	f := newFakeDiscord(t)
	f.failStatus = http.StatusForbidden
	f.fail = func(c discordCall) bool { return strings.HasSuffix(c.Path, "/threads") }
	store := restDiscordJob(t, f)
	if store.Jobs[0].State != jobs.Succeeded {
		t.Fatalf("state=%s want succeeded", store.Jobs[0].State)
	}
}

func TestDiscordForbiddenErrorIsIdentifiable(t *testing.T) {
	f := newFakeDiscord(t)
	f.failStatus = http.StatusForbidden
	f.fail = func(discordCall) bool { return true }
	err := newSync(f, &fakeQuests{quest: baseQuest("")}, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1)
	if !errors.Is(err, delivery.ErrDiscordForbidden) {
		t.Fatalf("want ErrDiscordForbidden in chain, got %v", err)
	}
	var status *delivery.DiscordAPIError
	if !errors.As(err, &status) || status.Status != http.StatusForbidden {
		t.Fatalf("want DiscordAPIError 403, got %v", err)
	}
	if err.Error() != `discord create message: discord api status 403: {"message":"boom"}` {
		t.Fatalf("error text changed: %q", err.Error())
	}
}
