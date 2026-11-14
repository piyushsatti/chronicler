package jobs

import (
	"errors"
	"math"
	"testing"
	"time"
)

func questionFixture(now time.Time) Job {
	return Job{ID: "1", PublicID: "11111111-1111-4111-8111-111111111111", Kind: "agent_question", State: Queued, NextRunAt: now, QuestionDeadlineAt: now.Add(QuestionBudget)}
}
func TestLeaseReclaimFencesAllOldMutations(t *testing.T) {
	now := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)
	j := questionFixture(now)
	if ok, e := j.Claim(now); !ok || e != nil {
		t.Fatal(ok, e)
	}
	deadline := j.QuestionDeadlineAt
	if ok, e := j.Claim(now.Add(29 * time.Second)); ok || e != nil {
		t.Fatal("live lease reclaimed", e)
	}
	if ok, e := j.Claim(now.Add(30 * time.Second)); !ok || e != nil {
		t.Fatal("expired lease not reclaimed", e)
	}
	if j.Token != 2 || j.Attempts != 2 || j.AttemptDeadlineAt != deadline {
		t.Fatalf("reclaim=%+v", j)
	}
	for _, op := range []string{"succeed", "fail", "retry"} {
		if e := j.Finish(1, now.Add(31*time.Second), op, Succeeded, []byte(`{}`), time.Second, ""); !errors.Is(e, ErrLease) {
			t.Fatalf("stale %s: %v", op, e)
		}
	}
	if e := j.Renew(1, now.Add(31*time.Second)); !errors.Is(e, ErrLease) {
		t.Fatal(e)
	}
	if e := j.Renew(2, now.Add(40*time.Second)); e != nil {
		t.Fatal(e)
	}
	if j.LeaseExpiresAt != now.Add(70*time.Second) || j.AttemptDeadlineAt != deadline {
		t.Fatal(j)
	}
}
func TestTerminalReplayAndRetryRelease(t *testing.T) {
	now := time.Now()
	j := questionFixture(now)
	if ok, err := j.Claim(now); !ok || err != nil {
		t.Fatal(ok, err)
	}
	payload := []byte(`{"answer":"ok","sources":[]}`)
	if e := j.Finish(1, now, "succeed", Succeeded, payload, 0, ""); e != nil {
		t.Fatal(e)
	}
	before := j
	if e := j.Finish(1, now.Add(time.Hour), "succeed", Succeeded, []byte(`{"sources":[],"answer":"ok"}`), 0, ""); e != nil {
		t.Fatal(e)
	}
	if j.State != before.State || j.Token != before.Token || !j.LeaseExpiresAt.IsZero() {
		t.Fatal(j)
	}
	for _, changed := range [][]byte{[]byte(`{"answer":"changed"}`), []byte(`{}`)} {
		if e := j.Finish(1, now, "succeed", Succeeded, changed, 0, ""); !errors.Is(e, ErrLease) {
			t.Fatal(e)
		}
	}
	if e := j.Finish(1, now, "fail", Dead, payload, 0, ""); !errors.Is(e, ErrLease) {
		t.Fatal(e)
	}
	j = questionFixture(now)
	if ok, err := j.Claim(now); !ok || err != nil {
		t.Fatal(ok, err)
	}
	if e := j.Finish(1, now, "retry", RetryWait, nil, time.Second, "transient_error"); e != nil {
		t.Fatal(e)
	}
	if e := j.Finish(1, now, "retry", RetryWait, nil, time.Second, "transient_error"); !errors.Is(e, ErrLease) {
		t.Fatal("retry replay", e)
	}
	if ok, e := j.Claim(now.Add(time.Second)); !ok || e != nil || j.Token != 2 {
		t.Fatal(j, e)
	}
}
func TestDeadlineCapsRenewAndTerminalizesQueuedOrRunning(t *testing.T) {
	now := time.Now()
	for _, claimed := range []bool{false, true} {
		j := questionFixture(now)
		if claimed {
			if ok, err := j.Claim(now.Add(75 * time.Second)); !ok || err != nil {
				t.Fatal(ok, err)
			}
			if j.LeaseExpiresAt != j.QuestionDeadlineAt {
				t.Fatal(j)
			}
			if e := j.Renew(j.Token, now.Add(90*time.Second)); e != nil {
				t.Fatal(e)
			}
			if j.LeaseExpiresAt != j.QuestionDeadlineAt || j.Lease(now.Add(90*time.Second)).RemainingBudgetSeconds != 10 {
				t.Fatal(j)
			}
		}
		if !j.ExpireQuestion(now.Add(100*time.Second)) || j.State != Dead || j.CompletionOperation != "deadline" || !j.LeaseExpiresAt.IsZero() {
			t.Fatal(j)
		}
		if e := j.Finish(j.Token, now.Add(101*time.Second), "succeed", Succeeded, []byte(`{}`), 0, ""); !errors.Is(e, ErrLease) {
			t.Fatal(e)
		}
	}
}
func TestCancellationAndCompletionOrder(t *testing.T) {
	now := time.Now()
	j := questionFixture(now)
	if ok, err := j.Claim(now); !ok || err != nil {
		t.Fatal(ok, err)
	}
	if e := j.Cancel(); e != nil {
		t.Fatal(e)
	}
	if e := j.Finish(1, now, "succeed", Succeeded, []byte(`{}`), 0, ""); !errors.Is(e, ErrLease) {
		t.Fatal(e)
	}
	j = questionFixture(now)
	if ok, err := j.Claim(now); !ok || err != nil {
		t.Fatal(ok, err)
	}
	if err := j.Finish(1, now, "succeed", Succeeded, []byte(`{}`), 0, ""); err != nil {
		t.Fatal(err)
	}
	if e := j.Cancel(); !errors.Is(e, ErrLease) || j.State != Succeeded {
		t.Fatal(j, e)
	}
}
func TestBackoffSchedule(t *testing.T) {
	want := []time.Duration{
		time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second,
		16 * time.Second, 32 * time.Second, 64 * time.Second,
	}
	for i, d := range want {
		if got := Backoff(i + 1); got != d {
			t.Fatalf("Backoff(%d)=%v want %v", i+1, got, d)
		}
	}
	var sum time.Duration
	for attempt := 1; attempt <= 19; attempt++ {
		sum += Backoff(attempt)
	}
	if sum < 50*time.Minute || sum > 70*time.Minute {
		t.Fatalf("sum Backoff(1..19)=%v want 50-70m", sum)
	}
	if got := Backoff(100); got != 5*time.Minute {
		t.Fatalf("Backoff(100)=%v want 5m", got)
	}
}

func TestDiscordLaneAttemptBudget(t *testing.T) {
	now := time.Now()
	discord := Job{ID: "1", Lane: LaneDiscord, State: Queued, NextRunAt: now, Attempts: MaxAttempts}
	if ok, err := discord.Claim(now); !ok || err != nil || discord.State != Running {
		t.Fatalf("discord at 8 attempts: ok=%v err=%v state=%s", ok, err, discord.State)
	}
	mid := Job{ID: "4", Lane: LaneDiscord, State: Queued, NextRunAt: now, Attempts: MaxAttempts - 1}
	if ok, err := mid.Claim(now); !ok || err != nil {
		t.Fatalf("discord claim before attempt 8: ok=%v err=%v", ok, err)
	}
	if err := mid.Finish(mid.Token, now, "retry", RetryWait, nil, time.Second, "transient"); err != nil {
		t.Fatal(err)
	}
	if mid.State != RetryWait || mid.Attempts != MaxAttempts {
		t.Fatalf("discord retry at attempt 8: state=%s attempts=%d want retry_wait/%d", mid.State, mid.Attempts, MaxAttempts)
	}
	exhausted := Job{ID: "2", Lane: LaneDiscord, State: Queued, NextRunAt: now, Attempts: DiscordMaxAttempts}
	if ok, err := exhausted.Claim(now); ok || err != nil || exhausted.State != Dead {
		t.Fatalf("discord at 20 attempts: ok=%v err=%v state=%s", ok, err, exhausted.State)
	}
	maintenance := Job{ID: "3", Lane: "maintenance", State: Queued, NextRunAt: now, Attempts: MaxAttempts}
	if ok, err := maintenance.Claim(now); ok || err != nil || maintenance.State != Dead {
		t.Fatalf("maintenance at 8 attempts: ok=%v err=%v state=%s", ok, err, maintenance.State)
	}
}

func TestExhaustionAndTokenOverflow(t *testing.T) {
	now := time.Now()
	j := questionFixture(now)
	j.Attempts = MaxAttempts
	if ok, e := j.Claim(now); ok || e != nil || j.State != Dead {
		t.Fatal(j, e)
	}
	j = questionFixture(now)
	j.Token = math.MaxInt64
	if ok, e := j.Claim(now); ok || e == nil || j.Token != math.MaxInt64 {
		t.Fatal(j, e)
	}
	for _, token := range []string{"", "0", "01", "+1", "-1", "9223372036854775808"} {
		if _, e := ParseToken(token); e == nil {
			t.Fatal(token)
		}
	}
	if n, e := ParseToken("9223372036854775807"); e != nil || n != math.MaxInt64 {
		t.Fatal(n, e)
	}
}

func TestOperatorCancellationPreservesEveryTerminalState(t *testing.T) {
	for _, state := range []State{Succeeded, Dead, RepairRequired, Cancelled} {
		t.Run(string(state), func(t *testing.T) {
			j := Job{State: state, Token: 7, CompletionOperation: "terminal", CompletionPayload: []byte(`{"kept":true}`)}
			if e := j.Cancel(); !errors.Is(e, ErrLease) {
				t.Fatal(e)
			}
			if j.State != state || j.Token != 7 || j.CompletionOperation != "terminal" || string(j.CompletionPayload) != `{"kept":true}` {
				t.Fatal("terminal mutation", j)
			}
		})
	}
}
