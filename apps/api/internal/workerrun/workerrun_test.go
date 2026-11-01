package workerrun

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
)

func TestRequireDatabaseRefusesMemoryFallback(t *testing.T) {
	cfg := config.Config{DatabaseURL: "postgres://x:y@127.0.0.1:1/z?sslmode=disable", RequireDatabase: true}
	if _, err := configureWorker(context.Background(), cfg, nil); err == nil {
		t.Fatal("expected error when postgres unavailable and database required")
	}
}

type workerLaneFunc func(context.Context) (bool, error)

func (f workerLaneFunc) ProcessOne(ctx context.Context) (bool, error) { return f(ctx) }

func TestProcessWorkerLane(t *testing.T) {
	for _, tt := range []struct {
		name      string
		jobs      int
		failAt    int
		wantCalls int
		wantJobs  int
	}{
		{name: "drains jobs", jobs: 3, wantCalls: 4, wantJobs: 3},
		{name: "stops on error", jobs: 3, failAt: 2, wantCalls: 2, wantJobs: 1},
		{name: "caps jobs", jobs: 30, wantCalls: 25, wantJobs: 25},
	} {
		t.Run(tt.name, func(t *testing.T) {
			calls, processed := 0, 0
			lane := workerLaneFunc(func(context.Context) (bool, error) {
				calls++
				if calls == tt.failAt {
					return false, errors.New("job failed")
				}
				if processed == tt.jobs {
					return false, nil
				}
				processed++
				return true, nil
			})
			processWorkerLane(context.Background(), lane, "test")
			if calls != tt.wantCalls || processed != tt.wantJobs {
				t.Fatalf("calls=%d jobs=%d, want calls=%d jobs=%d", calls, processed, tt.wantCalls, tt.wantJobs)
			}
		})
	}
	for _, alreadyCancelled := range []bool{false, true} {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		wantCalls := 1
		if alreadyCancelled {
			cancel()
			wantCalls = 0
		}
		calls := 0
		lane := workerLaneFunc(func(context.Context) (bool, error) {
			calls++
			cancel()
			return true, nil
		})
		processWorkerLane(ctx, lane, "test")
		if calls != wantCalls {
			t.Fatalf("cancelled=%t: calls=%d, want %d", alreadyCancelled, calls, wantCalls)
		}
	}
}
