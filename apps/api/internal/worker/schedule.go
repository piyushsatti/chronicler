package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

const (
	agentQuestionRetention  = 30 * 24 * time.Hour
	agentQuestionPruneBatch = 1000
)

// RunScheduled enqueues maintenance jobs (handlers run in the worker loop).
func RunScheduled(ctx context.Context, pool *pgxpool.Pool, jobStore jobs.Store) {
	at := time.Now()
	EnqueueDailyMaintenance(ctx, jobStore, at)
	if pool != nil {
		q := dbgen.New(pool)
		if err := q.PruneBotHeartbeats(ctx, pgtype.Timestamptz{Time: at.Add(-7 * 24 * time.Hour), Valid: true}); err != nil {
			slog.ErrorContext(ctx, "heartbeat prune failed", "error", err)
		}
		if err := q.PruneFinishedAgentQuestions(ctx, dbgen.PruneFinishedAgentQuestionsParams{
			Cutoff:     pgtype.Timestamptz{Time: at.Add(-agentQuestionRetention), Valid: true},
			BatchLimit: agentQuestionPruneBatch,
		}); err != nil {
			slog.ErrorContext(ctx, "agent question prune failed", "error", err)
		}
	}
}
