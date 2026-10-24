package jobs

import (
	"context"
	"time"
)

// RunLeased cancels and joins work/renewal on lease loss or shutdown. External
// effects must still be idempotent; a database receipt cannot undo remote I/O.
func RunLeased(ctx context.Context, store Store, job Job, work func(context.Context) error) error {
	workCtx, cancel := context.WithDeadline(ctx, job.AttemptDeadlineAt)
	defer cancel()
	done := make(chan struct{})
	var workErr error
	go func() {
		workErr = work(workCtx)
		close(done)
	}()
	ticker := time.NewTicker(job.leaseDuration() / 3)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return workErr
		case <-workCtx.Done():
			cancel()
			<-done
			return workCtx.Err()
		case <-ticker.C:
			renewCtx, stop := context.WithTimeout(workCtx, 5*time.Second)
			_, e := store.Renew(renewCtx, job.Receipt())
			stop()
			if e != nil {
				cancel()
				<-done
				return e
			}
		}
	}
}
