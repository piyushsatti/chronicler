package worker_test

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

func TestMaintenanceHandlerUnknownKindSucceeds(t *testing.T) {
	store := &delivery.MemoryStore{}
	ctx := context.Background()
	_ = store.Enqueue(ctx, jobs.Job{
		ID: "job-1", Key: "k1", Kind: "noop_kind", Lane: worker.LaneMaintenance,
	})
	h := worker.NewMaintenanceHandler(store, nil)
	ok, err := h.ProcessOne(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected job processed")
	}
}
