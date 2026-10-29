package jobs_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type recStore struct {
	job jobs.Job
}

func (r *recStore) Enqueue(_ context.Context, job jobs.Job) error {
	r.job = job
	return nil
}
func (r *recStore) EnqueueScheduled(ctx context.Context, job jobs.Job) (bool, error) {
	return true, r.Enqueue(ctx, job)
}
func (r *recStore) ClaimOne(context.Context, string) (jobs.Job, error) { return jobs.Job{}, nil }
func (r *recStore) Succeed(context.Context, jobs.Receipt) error        { return nil }
func (r *recStore) Retry(context.Context, jobs.Receipt, time.Duration, string) error {
	return nil
}
func (r *recStore) Fail(context.Context, jobs.Receipt, jobs.State, string) error { return nil }
func (r *recStore) FailWithCode(context.Context, jobs.Receipt, jobs.State, string, string) error {
	return nil
}

func TestEnqueueQuestDiscordUsesPublicKeyAndRevision(t *testing.T) {
	store := &recStore{}
	err := jobs.NewEnqueuer(store).EnqueueQuestDiscord(context.Background(), jobs.QuestDiscordPayload{
		ID:              9,
		PublicID:        "11111111-1111-4111-8111-111111111111",
		DesiredRevision: 3,
	})
	if err != nil {
		t.Fatal(err)
	}
	if store.job.Key != "quest-discord:11111111-1111-4111-8111-111111111111" {
		t.Fatalf("key=%s", store.job.Key)
	}
	if store.job.Lane != "discord" || store.job.Kind != "quest_discord_delivery" {
		t.Fatalf("lane=%s kind=%s", store.job.Lane, store.job.Kind)
	}
	var body jobs.QuestDiscordPayload
	if err := json.Unmarshal(store.job.Payload, &body); err != nil {
		t.Fatal(err)
	}
	if body.ID != 9 || body.DesiredRevision != 3 {
		t.Fatalf("payload=%+v", body)
	}
}

func (r *recStore) Renew(context.Context, jobs.Receipt) (jobs.Lease, error) { return jobs.Lease{}, nil }
