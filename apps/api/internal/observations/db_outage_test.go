package observations_test

import (
	"sync"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/observations"
)

func TestPhase3TaskOB06Acceptance(t *testing.T) {
	accepted := time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)

	t.Run("only acceptance begins fixed sixty second suppression", func(t *testing.T) {
		var monitor observations.DBOutageMonitor = observations.NewDBOutageMonitor()
		for range 3 {
			if !monitor.ShouldSend(accepted) {
				t.Fatal("unaccepted attempt suppressed a retry")
			}
		}
		monitor.MarkAccepted(accepted)
		for _, elapsed := range []time.Duration{0, time.Second, 59999 * time.Millisecond} {
			if monitor.ShouldSend(accepted.Add(elapsed)) {
				t.Fatalf("accepted alert eligible after %s, before sixty seconds", elapsed)
			}
		}
		for _, elapsed := range []time.Duration{60 * time.Second, 60*time.Second + time.Nanosecond, 24 * time.Hour} {
			if !monitor.ShouldSend(accepted.Add(elapsed)) {
				t.Fatalf("accepted alert suppressed after %s", elapsed)
			}
		}
		if !monitor.ShouldSend(accepted.Add(60 * time.Second)) {
			t.Fatal("eligibility check reserved an unsent alert")
		}
		monitor.MarkAccepted(accepted.Add(60 * time.Second))
		if monitor.ShouldSend(accepted.Add(119999 * time.Millisecond)) {
			t.Fatal("second acceptance did not restart suppression")
		}
		if !monitor.ShouldSend(accepted.Add(120 * time.Second)) {
			t.Fatal("second acceptance suppressed beyond sixty seconds")
		}
	})

	t.Run("reset and process restart allow another send", func(t *testing.T) {
		monitor := observations.NewDBOutageMonitor()
		monitor.MarkAccepted(accepted)
		if monitor.ShouldSend(accepted) {
			t.Fatal("acceptance did not suppress duplicate")
		}
		restarted := observations.NewDBOutageMonitor()
		if !restarted.ShouldSend(accepted) {
			t.Fatal("new monitor inherited another instance's acceptance")
		}
		monitor.Reset()
		if !monitor.ShouldSend(accepted) {
			t.Fatal("recovered condition retained suppression after reset")
		}
		monitor.Reset()
		if !monitor.ShouldSend(accepted) {
			t.Fatal("repeated reset suppressed delivery")
		}
	})

	t.Run("zero time is a legitimate acceptance", func(t *testing.T) {
		monitor := observations.NewDBOutageMonitor()
		var zero time.Time
		if !monitor.ShouldSend(zero) {
			t.Fatal("fresh monitor suppressed zero time")
		}
		monitor.MarkAccepted(zero)
		if monitor.ShouldSend(zero.Add(59999 * time.Millisecond)) {
			t.Fatal("zero time acceptance was treated as absent")
		}
		if !monitor.ShouldSend(zero.Add(60 * time.Second)) {
			t.Fatal("zero time acceptance suppressed past sixty seconds")
		}
	})

	t.Run("elapsed instants ignore location and suppress backward clocks", func(t *testing.T) {
		monitor := observations.NewDBOutageMonitor()
		monitor.MarkAccepted(accepted)
		if monitor.ShouldSend(accepted.Add(-time.Second)) {
			t.Fatal("backward clock bypassed suppression")
		}
		zone := time.FixedZone("fixture", 7*60*60)
		if monitor.ShouldSend(accepted.Add(59999 * time.Millisecond).In(zone)) {
			t.Fatal("time location bypassed suppression")
		}
		if !monitor.ShouldSend(accepted.Add(60 * time.Second).In(zone)) {
			t.Fatal("time location extended suppression")
		}
	})

	t.Run("concurrent individual methods preserve usable state", func(t *testing.T) {
		monitor := observations.NewDBOutageMonitor()
		var callers sync.WaitGroup
		for range 8 {
			callers.Go(func() {
				for range 100 {
					monitor.MarkAccepted(accepted)
					monitor.ShouldSend(accepted)
					monitor.Reset()
				}
			})
		}
		callers.Wait()
		monitor.MarkAccepted(accepted)
		if monitor.ShouldSend(accepted) {
			t.Fatal("monitor did not suppress after concurrent callers completed")
		}
		monitor.Reset()
		if !monitor.ShouldSend(accepted) {
			t.Fatal("monitor did not reset after concurrent callers completed")
		}
	})
}
