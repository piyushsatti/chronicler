package worker_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

type maintenanceGate func(context.Context, string, jobs.Receipt, func(context.Context, jobs.ExecutionScope) error) (bool, error)

func (f maintenanceGate) Do(ctx context.Context, kind string, receipt jobs.Receipt, callback func(context.Context, jobs.ExecutionScope) error) (bool, error) {
	return f(ctx, kind, receipt, callback)
}

type maintenanceTime func(context.Context, jobs.ExecutionScope, product.Date, int32) (int32, error)

func (f maintenanceTime) FillFuture(ctx context.Context, scope jobs.ExecutionScope, from product.Date, days int32) (int32, error) {
	return f(ctx, scope, from, days)
}

func testMaintenance(t *testing.T, store jobs.Store, gate maintenanceGate, writer maintenanceTime, clock product.Clock) *worker.MaintenanceHandler {
	t.Helper()
	handler, err := worker.NewMaintenanceHandler(store, gate, writer, clock)
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

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
			h := testMaintenance(t, store, func(context.Context, string, jobs.Receipt, func(context.Context, jobs.ExecutionScope) error) (bool, error) {
				t.Fatal("unknown kind entered gate")
				return false, nil
			}, func(context.Context, jobs.ExecutionScope, product.Date, int32) (int32, error) {
				t.Fatal("unknown kind entered Time")
				return 0, nil
			}, time.Now)
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

func TestMaintenanceTimeUsesCurrentUTCAndExactClaimedScope(t *testing.T) {
	now := time.Date(2026, 10, 15, 1, 0, 0, 0, time.FixedZone("East", 2*60*60))
	store := &jobs.MemoryStore{Now: time.Now}
	ctx := context.Background()
	if err := store.Enqueue(ctx, jobs.Job{Key: "time", Kind: "gametime_fill", Lane: worker.LaneMaintenance}); err != nil {
		t.Fatal(err)
	}
	called := false
	h := testMaintenance(t, store, func(ctx context.Context, kind string, receipt jobs.Receipt, callback func(context.Context, jobs.ExecutionScope) error) (bool, error) {
		if kind != "gametime_fill" || receipt.ID != "1" || receipt.Token != "1" {
			t.Fatalf("gate kind=%s receipt=%+v", kind, receipt)
		}
		return true, callback(ctx, jobs.ExecutionScope{Receipt: receipt})
	}, func(_ context.Context, scope jobs.ExecutionScope, from product.Date, days int32) (int32, error) {
		called = true
		if scope.Receipt != (jobs.Receipt{ID: "1", Token: "1"}) || from != "2026-10-14" || days != 30 {
			t.Fatalf("Time scope=%+v from=%s days=%d", scope, from, days)
		}
		return 30, nil
	}, func() time.Time { return now })
	if ok, err := h.ProcessOne(ctx); err != nil || !ok || !called || store.Jobs[0].State != jobs.Succeeded {
		t.Fatalf("processed=%v called=%v job=%+v error=%v", ok, called, store.Jobs[0], err)
	}
}

func TestMaintenanceBusyAndSafeFailureDisposition(t *testing.T) {
	for _, test := range []struct {
		name, code string
		busy       bool
		failure    error
		attempts   int
		state      jobs.State
	}{
		{"busy", "JOB_BUSY", true, nil, 0, jobs.RetryWait},
		{"invalid Time", "JOB_INVARIANT_FAILED", false, apierr.New(apierr.Invalid, "private calendar detail"), 0, jobs.RetryWait},
		{"SQL failure", "JOB_EXECUTION_FAILED", false, errors.New("SQL_PRIVATE_SENTINEL"), 0, jobs.RetryWait},
		{"deadline", "JOB_TIMEOUT", false, context.DeadlineExceeded, 0, jobs.RetryWait},
		{"exhaustion", "JOB_EXECUTION_FAILED", false, errors.New("SQL_PRIVATE_SENTINEL"), jobs.MaxAttempts - 1, jobs.Dead},
	} {
		t.Run(test.name, func(t *testing.T) {
			now := time.Now()
			store := &jobs.MemoryStore{Now: func() time.Time { return now }}
			if err := store.Enqueue(context.Background(), jobs.Job{Key: "time", Kind: "gametime_fill", Lane: worker.LaneMaintenance, Attempts: test.attempts}); err != nil {
				t.Fatal(err)
			}
			h := testMaintenance(t, store, func(ctx context.Context, _ string, receipt jobs.Receipt, callback func(context.Context, jobs.ExecutionScope) error) (bool, error) {
				if test.busy {
					return false, nil
				}
				return true, callback(ctx, jobs.ExecutionScope{Receipt: receipt})
			}, func(context.Context, jobs.ExecutionScope, product.Date, int32) (int32, error) { return 0, test.failure }, func() time.Time { return now })
			if ok, err := h.ProcessOne(context.Background()); err != nil || !ok {
				t.Fatalf("processed=%v error=%v", ok, err)
			}
			job := store.Jobs[0]
			if job.State != test.state || job.ErrorMessage != test.code || test.busy && !job.NextRunAt.Equal(now.Add(time.Second)) {
				t.Fatalf("job=%+v", job)
			}
		})
	}
}

func TestMaintenanceRejectsMissingDependencies(t *testing.T) {
	store := &jobs.MemoryStore{}
	gate := maintenanceGate(func(context.Context, string, jobs.Receipt, func(context.Context, jobs.ExecutionScope) error) (bool, error) {
		return false, nil
	})
	writer := maintenanceTime(func(context.Context, jobs.ExecutionScope, product.Date, int32) (int32, error) { return 0, nil })
	for _, construct := range []func() error{
		func() error { _, err := worker.NewMaintenanceHandler(nil, gate, writer, time.Now); return err },
		func() error {
			var typed *jobs.MemoryStore
			_, err := worker.NewMaintenanceHandler(typed, gate, writer, time.Now)
			return err
		},
		func() error { _, err := worker.NewMaintenanceHandler(store, nil, writer, time.Now); return err },
		func() error { _, err := worker.NewMaintenanceHandler(store, gate, nil, time.Now); return err },
		func() error { _, err := worker.NewMaintenanceHandler(store, gate, writer, nil); return err },
	} {
		if err := construct(); err == nil {
			t.Fatal("missing dependency accepted")
		}
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
