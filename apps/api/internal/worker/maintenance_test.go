package worker_test

import (
	"context"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

func TestMaintenanceHandlerUnknownKindsRequireRepair(t *testing.T) {
	for _, kind := range []string{"purge_idempotency", "noop_kind"} {
		t.Run(kind, func(t *testing.T) {
			store := &delivery.MemoryStore{}
			ctx := context.Background()
			if err := store.Enqueue(ctx, jobs.Job{
				ID: "job-1", Key: "k1", Kind: kind, Lane: worker.LaneMaintenance,
			}); err != nil {
				t.Fatal(err)
			}
			h := worker.NewMaintenanceHandler(store, nil)
			ok, err := h.ProcessOne(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if !ok {
				t.Fatal("expected job processed")
			}
			if len(store.Jobs) != 1 {
				t.Fatalf("job count=%d, want 1", len(store.Jobs))
			}
			got := store.Jobs[0]
			if got.ID != "job-1" || got.Key != "k1" || got.Kind != kind || got.State != jobs.RepairRequired || got.ErrorMessage != "UNKNOWN_MAINTENANCE_KIND" {
				t.Fatalf("unknown job result=%+v", got)
			}
			if got.Attempts != 1 || got.Token != 1 || got.CompletionOperation != "fail" {
				t.Fatalf("unknown job was not failed under its claimed receipt: %+v", got)
			}
		})
	}
}

func TestEnqueueDailyMaintenanceRetainsKnownKinds(t *testing.T) {
	store := &delivery.MemoryStore{}
	slot := time.Date(2026, 10, 17, 0, 30, 0, 0, time.UTC)
	worker.EnqueueDailyMaintenance(context.Background(), store, slot)
	if len(store.Jobs) != 2 {
		t.Fatalf("scheduled jobs=%+v", store.Jobs)
	}
	if store.Jobs[0].Kind != "gametime_fill" || store.Jobs[1].Kind != "reconcile_dry_run" {
		t.Fatalf("scheduled kinds=%q,%q", store.Jobs[0].Kind, store.Jobs[1].Kind)
	}
}
