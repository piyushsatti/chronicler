package spatial

import (
	"context"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func TestTimeFillRejectsMissingDependenciesAndInvalidRanges(t *testing.T) {
	if _, err := NewTimeFillWriter(nil, db.NewConnectionRunner()); err == nil {
		t.Fatal("nil clock accepted")
	}
	if _, err := NewTimeFillWriter(time.Now, nil); err == nil {
		t.Fatal("nil runner accepted")
	}
	var typed *db.ConnectionRunner
	if _, err := NewTimeFillWriter(time.Now, typed); err == nil {
		t.Fatal("typed nil runner accepted")
	}
	writer, _ := NewTimeFillWriter(time.Now, db.NewConnectionRunner())
	for _, days := range []int32{0, -1, 367} {
		if _, err := writer.FillFuture(context.Background(), jobs.ExecutionScope{}, "2026-10-14", days); err == nil {
			t.Fatal("invalid range accepted")
		}
	}
}
