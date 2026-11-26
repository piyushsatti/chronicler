package quest

import (
	"testing"
	"time"
)

func TestPlanLiveSignupSeat(t *testing.T) {
	seat := func(id string, held bool) seatOrderEntry {
		return seatOrderEntry{CharacterID: id, Status: "signed_up", Held: held}
	}
	wait := func(id string) seatOrderEntry { return seatOrderEntry{CharacterID: id, Status: "waitlisted"} }
	cases := []struct {
		name    string
		ordered []seatOrderEntry
		open    int32
		want    liveSignupSeat
	}{
		{"open seat is taken", []seatOrderEntry{seat("a", true), wait("new")}, 1, liveSignupSeat{Take: true}},
		{"ranks above lowest held seat", []seatOrderEntry{seat("a", true), wait("new"), seat("b", true)}, 0, liveSignupSeat{Take: true, Bump: "b"}},
		{"takes the lowest of several held seats", []seatOrderEntry{wait("new"), seat("a", true), seat("b", true)}, 0, liveSignupSeat{Take: true, Bump: "b"}},
		{"ranks below every held seat", []seatOrderEntry{seat("a", true), seat("b", true), wait("new")}, 0, liveSignupSeat{}},
		{"dm pick below is skipped", []seatOrderEntry{seat("a", true), wait("new"), seat("pick", false)}, 0, liveSignupSeat{}},
		{"held seat above a lower dm pick", []seatOrderEntry{wait("new"), seat("a", true), seat("pick", false)}, 0, liveSignupSeat{Take: true, Bump: "a"}},
		{"waitlisted players below are not seats", []seatOrderEntry{seat("a", true), wait("new"), wait("w")}, 0, liveSignupSeat{}},
		{"newcomer missing", []seatOrderEntry{seat("a", true)}, 1, liveSignupSeat{}},
		{"newcomer already seated", []seatOrderEntry{seat("new", true)}, 1, liveSignupSeat{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := planLiveSignupSeat(tc.ordered, "new", tc.open); got != tc.want {
				t.Fatalf("got %+v want %+v", got, tc.want)
			}
		})
	}
}

func TestQuestViewLiveWindow(t *testing.T) {
	now := time.Now()
	lgp, pick := lastGamePlayedSignup, dmPickSignup
	cases := []struct {
		name          string
		view          QuestView
		live, filling bool
	}{
		{"before fill", QuestView{SignupType: &lgp, Status: "open"}, false, true},
		{"after fill", QuestView{SignupType: &lgp, Status: "full", LiveFillStartedAt: &now}, true, true},
		{"after publish", QuestView{SignupType: &lgp, Status: "full", LiveFillStartedAt: &now, PlayerListPublishedAt: &now}, false, false},
		{"played", QuestView{SignupType: &lgp, Status: "played", LiveFillStartedAt: &now}, false, false},
		{"dm pick quest", QuestView{SignupType: &pick, Status: "open", LiveFillStartedAt: &now}, false, false},
		{"no signup type", QuestView{Status: "open", LiveFillStartedAt: &now}, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.view.LiveReshuffle(); got != tc.live {
				t.Fatalf("LiveReshuffle=%v want %v", got, tc.live)
			}
			if got := tc.view.liveWindow(true); got != tc.filling {
				t.Fatalf("liveWindow(filling)=%v want %v", got, tc.filling)
			}
		})
	}
}
