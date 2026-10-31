package jobs

import (
	"context"
	"testing"
	"time"
)

func claimedMemoryJob(t *testing.T, now time.Time) (*MemoryStore, Job) {
	t.Helper()
	store := &MemoryStore{Now: func() time.Time { return now }}
	if err := store.Enqueue(context.Background(), Job{ID: "1", Key: "safe-code", Kind: "quest_discord_delivery", Lane: "discord", NextRunAt: now}); err != nil {
		t.Fatal(err)
	}
	job, err := store.ClaimOne(context.Background(), "discord")
	if err != nil || job.ID == "" {
		t.Fatalf("claim=%+v err=%v", job, err)
	}
	return store, job
}

func TestMemoryFailWithCodeRecordsSafeCode(t *testing.T) {
	now := time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)
	store, job := claimedMemoryJob(t, now)
	if err := store.FailWithCode(context.Background(), job.Receipt(), RepairRequired, "raw provider text", "DISCORD_PERMISSION"); err != nil {
		t.Fatal(err)
	}
	got := store.Jobs[0]
	if got.State != RepairRequired || got.SafeErrorCode != "DISCORD_PERMISSION" || got.ErrorMessage != "raw provider text" {
		t.Fatalf("job=%+v", got)
	}
	// A replay of the same completion is accepted and leaves the code in place.
	if err := store.FailWithCode(context.Background(), job.Receipt(), RepairRequired, "raw provider text", "DISCORD_PERMISSION"); err != nil {
		t.Fatalf("replay: %v", err)
	}
	if store.Jobs[0].SafeErrorCode != "DISCORD_PERMISSION" {
		t.Fatalf("replay changed code: %+v", store.Jobs[0])
	}
}

func TestMemoryPlainFailLeavesNoSafeCode(t *testing.T) {
	now := time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)
	store, job := claimedMemoryJob(t, now)
	if err := store.Fail(context.Background(), job.Receipt(), Dead, "boom"); err != nil {
		t.Fatal(err)
	}
	if got := store.Jobs[0]; got.State != Dead || got.SafeErrorCode != "" {
		t.Fatalf("job=%+v", got)
	}
}

func TestClaimClearsSafeCode(t *testing.T) {
	now := time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)
	j := Job{ID: "1", Kind: "quest_discord_delivery", Lane: "discord", State: Queued, NextRunAt: now, ErrorMessage: "old", SafeErrorCode: "DISCORD_PERMISSION"}
	if ok, err := j.Claim(now); !ok || err != nil {
		t.Fatalf("claim ok=%v err=%v", ok, err)
	}
	if j.SafeErrorCode != "" || j.ErrorMessage != "" {
		t.Fatalf("claim kept error=%q code=%q", j.ErrorMessage, j.SafeErrorCode)
	}
}

func TestMemoryRequeuedParkedJobSucceedsWithoutSafeCode(t *testing.T) {
	now := time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)
	ctx := context.Background()
	store, job := claimedMemoryJob(t, now)
	if err := store.FailWithCode(ctx, job.Receipt(), RepairRequired, "403", "DISCORD_PERMISSION"); err != nil {
		t.Fatal(err)
	}
	if err := store.Enqueue(ctx, Job{Key: "safe-code", Kind: "quest_discord_delivery", Lane: "discord", NextRunAt: now}); err != nil {
		t.Fatal(err)
	}
	again, err := store.ClaimOne(ctx, "discord")
	if err != nil || again.ID == "" {
		t.Fatalf("claim=%+v err=%v", again, err)
	}
	if err := store.Succeed(ctx, again.Receipt()); err != nil {
		t.Fatal(err)
	}
	if got := store.Jobs[0]; got.State != Succeeded || got.SafeErrorCode != "" {
		t.Fatalf("job=%+v", got)
	}
}
