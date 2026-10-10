package worker

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

// RunScheduled enqueues maintenance jobs (handlers run in the worker loop).
func RunScheduled(ctx context.Context, pool *pgxpool.Pool, jobStore jobs.Store) {
	_ = pool
	EnqueueDailyMaintenance(ctx, jobStore, time.Now())
}
