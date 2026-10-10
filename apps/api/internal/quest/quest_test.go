package quest

import (
	"errors"
	"testing"
	"time"
)

func TestTransition(t *testing.T) {
	scheduled := time.Date(2026, 10, 1, 18, 0, 0, 0, time.UTC)
	before := scheduled.Add(-time.Hour)
	after := scheduled.Add(time.Hour)

	cases := []struct {
		name string
		from Status
		to   Status
		now  time.Time
		want error
	}{
		{"open fills", Open, Full, before, nil},
		{"full reopens", Full, Open, before, nil},
		{"open is played after schedule", Open, Played, after, nil},
		{"open is cancelled", Open, Cancelled, before, nil},
		{"played before schedule", Open, Played, before, ErrNotYetScheduled},
		{"close is its own command", Played, Closed, after, ErrUseClose},
		{"cancelled is terminal", Cancelled, Open, after, ErrIllegalTransition},
		{"played cannot reopen", Played, Open, after, ErrIllegalTransition},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			q := Quest{ID: "q1", Status: tc.from, ScheduledAt: scheduled}
			got, err := q.Transition(tc.to, tc.now)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if tc.want == nil && got.Status != tc.to {
				t.Fatalf("status = %q, want %q", got.Status, tc.to)
			}
			if tc.want != nil && got.Status != tc.from {
				t.Fatalf("status changed to %q on a rejected transition", got.Status)
			}
		})
	}
}
