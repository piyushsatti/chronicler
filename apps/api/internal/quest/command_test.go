package quest

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

var scheduledAt = time.Date(2026, 10, 1, 18, 0, 0, 0, time.UTC)

func newCommands(q Quest) (Commands, *memoryRunner) {
	runner := &memoryRunner{repo: &memoryRepo{quests: map[string]Quest{q.ID: q}}}
	now := func() time.Time { return scheduledAt.Add(time.Hour) }
	return NewCommands(runner, now), runner
}

func TestTransitionStatusCommitsOnce(t *testing.T) {
	c, runner := newCommands(Quest{ID: "q1", DMID: "dm-1", Status: Open, ScheduledAt: scheduledAt})

	got, err := c.TransitionStatus(context.Background(), auth.Claims{MemberID: "dm-1"}, "q1", Played)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != Played || runner.repo.quests["q1"].Status != Played {
		t.Fatalf("quest not played: %+v", runner.repo.quests["q1"])
	}
	if runner.commits != 1 || runner.rollbacks != 0 {
		t.Fatalf("commits=%d rollbacks=%d, want 1 and 0", runner.commits, runner.rollbacks)
	}
}

func TestTransitionStatusRollsBackRejectedWrites(t *testing.T) {
	cases := []struct {
		name  string
		actor auth.Claims
		id    string
		to    Status
		want  error
	}{
		{"another member", auth.Claims{MemberID: "someone"}, "q1", Played, ErrNotQuestDM},
		{"missing quest", auth.Claims{MemberID: "dm-1"}, "missing", Played, ErrNotFound},
		{"illegal edge", auth.Claims{MemberID: "dm-1"}, "q1", Closed, ErrUseClose},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, runner := newCommands(Quest{ID: "q1", DMID: "dm-1", Status: Open, ScheduledAt: scheduledAt})
			_, err := c.TransitionStatus(context.Background(), tc.actor, tc.id, tc.to)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if runner.commits != 0 || len(runner.repo.saved) != 0 {
				t.Fatalf("rejected command wrote: commits=%d saved=%d", runner.commits, len(runner.repo.saved))
			}
		})
	}
}

func TestDesiredRevisionCommitsWithTheQuest(t *testing.T) {
	c, runner := newCommands(Quest{ID: "q1", DMID: "dm-1", Status: Open, ScheduledAt: scheduledAt})
	if _, err := c.TransitionStatus(context.Background(), auth.Claims{MemberID: "dm-1"}, "q1", Played); err != nil {
		t.Fatal(err)
	}
	if len(runner.repo.revisions) != 1 || runner.repo.revisions[0] != "q1" {
		t.Fatalf("revisions=%v", runner.repo.revisions)
	}
}

func TestDesiredRevisionRollsBackWithRejectedCommand(t *testing.T) {
	c, runner := newCommands(Quest{ID: "q1", DMID: "dm-1", Status: Open, ScheduledAt: scheduledAt})
	if _, err := c.TransitionStatus(context.Background(), auth.Claims{MemberID: "dm-1"}, "q1", Closed); !errors.Is(err, ErrUseClose) {
		t.Fatalf("err=%v", err)
	}
	if len(runner.repo.revisions) != 0 || runner.commits != 0 {
		t.Fatalf("revisions=%v commits=%d", runner.repo.revisions, runner.commits)
	}
}

func TestSignUpNeverTouchesDiscord(t *testing.T) {
	c, runner := newCommands(Quest{ID: "q1", DMID: "dm-1", Status: Open, ScheduledAt: scheduledAt})
	if err := c.SignUp(context.Background(), auth.Claims{MemberID: "player-1"}, "q1", "char-1"); err != nil {
		t.Fatal(err)
	}
	if runner.commits != 1 {
		t.Fatalf("commits=%d", runner.commits)
	}
	if len(runner.repo.revisions) != 0 {
		t.Fatalf("a signup must not re-edit the post, got revisions %v", runner.repo.revisions)
	}
}

func TestAdminMayTransitionAnotherDMsQuest(t *testing.T) {
	c, _ := newCommands(Quest{ID: "q1", DMID: "dm-1", Status: Open, ScheduledAt: scheduledAt})
	admin := auth.Claims{MemberID: "admin-1", Roles: []auth.Role{auth.Admin}}
	if _, err := c.TransitionStatus(context.Background(), admin, "q1", Cancelled); err != nil {
		t.Fatal(err)
	}
}
