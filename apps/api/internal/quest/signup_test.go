package quest

import (
	"testing"
)

func TestCanSignUp(t *testing.T) {
	open := LegacyQuestView{Status: Open, FilledCount: 1, SlotsMax: 3}
	if err := canSignUp(open); err != nil {
		t.Fatalf("open: %v", err)
	}
	fullStatus := LegacyQuestView{Status: Full, FilledCount: 2, SlotsMax: 3}
	if err := canSignUp(fullStatus); err != nil {
		t.Fatalf("full status with seats: %v", err)
	}
	if err := canSignUp(LegacyQuestView{Status: Open, FilledCount: 3, SlotsMax: 3}); err != ErrQuestFull {
		t.Fatalf("want ErrQuestFull got %v", err)
	}
	if err := canSignUp(LegacyQuestView{Status: Closed, FilledCount: 0, SlotsMax: 3}); err != ErrQuestNotOpen {
		t.Fatalf("want ErrQuestNotOpen got %v", err)
	}
}
