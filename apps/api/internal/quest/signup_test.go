package quest

import (
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
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

func TestValidateQuestSignupRejectsOwningDM(t *testing.T) {
	_, _, err := validateQuestSignup(signupWrite("dm-1", "dm-1"))
	apiErr, ok := errors.AsType[*apierr.Error](err)
	if !ok || apiErr.Code != apierr.Forbidden || apiErr.Message != "quest dm cannot sign up" {
		t.Fatalf("owner signup err=%v", err)
	}
	status, _, err := validateQuestSignup(signupWrite("player-1", "dm-1"))
	if err != nil || status != "open" {
		t.Fatalf("player signup status=%s err=%v", status, err)
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
