package worker

import (
	"context"
	"log/slog"
	"time"
)

type QuestionSweeper interface {
	SweepQuestions(context.Context, int) (int, error)
}

// RunQuestionDeadlineSweep never shares the potentially slow lane-drain loop.
func RunQuestionDeadlineSweep(ctx context.Context, store QuestionSweeper) {
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		pass, stop := context.WithTimeout(ctx, 2*time.Second)
		_, err := store.SweepQuestions(pass, 32)
		stop()
		if err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "agent deadline sweep failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
