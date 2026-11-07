package quest

import (
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestQuestSignupAlwaysWaitlists(t *testing.T) {
	if got := placeQuestSignup(); got != "waitlisted" {
		t.Fatalf("signup status=%s, want waitlisted", got)
	}
}

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

func TestValidateQuestSignupRejectsOwningDM(t *testing.T) {
	_, err := validateQuestSignup(signupWrite("dm-1", "dm-1"))
	apiErr, ok := errors.AsType[*apierr.Error](err)
	if !ok || apiErr.Code != apierr.Forbidden || apiErr.Message != "quest dm cannot sign up" {
		t.Fatalf("owner signup err=%v", err)
	}
	previous, err := validateQuestSignup(signupWrite("player-1", "dm-1"))
	if err != nil || previous != nil {
		t.Fatalf("player signup previous=%v err=%v", previous, err)
	}
}

func signupWrite(actor, dm string) SignupForQuestWrite {
	return SignupForQuestWrite{
		ActorID:        actor,
		ValidatedInput: SignupForQuestSpec{QuestId: "quest-1", CharacterId: "character-1"},
		Locked: SignupForQuestState{
			Exists:  true,
			OwnerID: dm,
			Before:  &QuestView{Status: "open", DmId: dm},
			Character: &character.Admission{
				OwnerID: actor, Status: "active", Trusted: true, OwnerStatus: "active",
			},
		},
	}
}
