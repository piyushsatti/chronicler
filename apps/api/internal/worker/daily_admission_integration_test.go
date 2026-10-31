//go:build integration

package worker_test

import (
	"context"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

func TestDailyMaintenanceAdmissionDoesNotReviveTerminalJobs(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	store := jobs.NewPostgresStore(f.Pool.Pool)
	slot := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	worker.EnqueueDailyMaintenance(ctx, store, slot)
	snapshot := func() string {
		t.Helper()
		var rows string
		if err := f.Pool.QueryRow(ctx, `SELECT jsonb_agg(to_jsonb(j) ORDER BY job_key)::text FROM background_jobs j`).Scan(&rows); err != nil {
			t.Fatal(err)
		}
		return rows
	}
	for _, state := range []string{"queued", "running", "retry_wait", "succeeded", "dead", "repair_required", "cancelled"} {
		t.Run(state, func(t *testing.T) {
			if _, err := f.Pool.Exec(ctx, `UPDATE background_jobs SET
  state=$1, attempts=7, lease_token=89, payload='{"original":true}',
  lease_expires_at=CASE WHEN $1='running' THEN clock_timestamp()+interval '120 seconds' END,
  claimed_at=CASE WHEN $1='running' THEN clock_timestamp() END,
  attempt_deadline_at=CASE WHEN $1='running' THEN clock_timestamp()+interval '10 minutes' END,
  completion_operation='original.completion', completion_payload='{"originalReceipt":true}',
  error_message='retained-error', redrive_count=3, safe_error_code='RETAINED_CODE'`, state); err != nil {
				t.Fatal(err)
			}
			before := snapshot()
			worker.EnqueueDailyMaintenance(ctx, store, slot.Add(time.Hour))
			if after := snapshot(); after != before {
				t.Fatalf("repeat changed %s jobs\nbefore=%s\nafter=%s", state, before, after)
			}
		})
	}
}
