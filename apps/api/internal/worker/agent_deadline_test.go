package worker

import (
	"context"
	"testing"
	"time"
)

type blockingSweep struct {
	started     chan struct{}
	limit       int
	hasDeadline bool
}

func (s *blockingSweep) SweepQuestions(ctx context.Context, limit int) (int, error) {
	s.limit = limit
	_, s.hasDeadline = ctx.Deadline()
	close(s.started)
	<-ctx.Done()
	return 0, ctx.Err()
}
func TestDeadlineSweepIsBoundedAndJoinsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := &blockingSweep{started: make(chan struct{})}
	done := make(chan struct{})
	go func() { RunQuestionDeadlineSweep(ctx, s); close(done) }()
	select {
	case <-s.started:
	case <-time.After(time.Second):
		t.Fatal("sweep did not start independently")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("sweep did not stop")
	}
	if s.limit != 32 || !s.hasDeadline {
		t.Fatal(s)
	}
}
