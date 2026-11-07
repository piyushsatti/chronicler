package quest

import (
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestRosterCorrection(t *testing.T) {
	const (
		dmID     = "10000000-0000-4000-8000-000000000001"
		playerID = "10000000-0000-4000-8000-000000000002"
		adminID  = "10000000-0000-4000-8000-000000000003"
		memberID = "10000000-0000-4000-8000-000000000004"
		questID  = "30000000-0000-4000-8000-000000000001"
	)
	player := &character.Admission{ID: "c", OwnerID: playerID, Status: "active", OwnerStatus: "active", Trusted: true}
	seated := &QuestParticipantView{CharacterId: "c", Status: "signed_up"}
	for _, signup := range []string{lastGamePlayedSignup, dmPickSignup} {
		t.Run(signup, func(t *testing.T) {
			open := &QuestView{Status: "open", SignupType: &signup, SlotsMax: 1, FilledCount: 0, DmId: dmID}
			got, err := planRosterCorrection("add", open, player, nil, true)
			if err != nil || got.Status != "signed_up" || got.Delta != 1 || got.Skip {
				t.Fatalf("add open seat = %+v %v", got, err)
			}
			full := &QuestView{Status: "full", SignupType: &signup, SlotsMax: 1, FilledCount: 1, DmId: dmID}
			got, err = planRosterCorrection("add", full, player, nil, true)
			if signup == dmPickSignup {
				if err != nil || got.Status != "signed_up" || got.Delta != 1 {
					t.Fatalf("add past an uncapped roster = %+v %v", got, err)
				}
			} else if !rosterConflict(err, "quest capacity exceeded") {
				t.Fatalf("add on a full capped roster = %v", err)
			}
			got, err = planRosterCorrection("remove", full, nil, seated, false)
			if err != nil || got.Status != "withdrawn" || got.Delta != -1 || got.Skip {
				t.Fatalf("remove seated = %+v %v", got, err)
			}
		})
	}
	dm := &character.Admission{ID: "dm-char", OwnerID: dmID, Status: "active", OwnerStatus: "active", Trusted: true}
	if _, err := planRosterCorrection("add", &QuestView{Status: "open", SignupType: signupPtr(dmPickSignup), SlotsMax: 4, FilledCount: 0, DmId: dmID}, dm, nil, false); !rosterCode(err, apierr.Forbidden) {
		t.Fatalf("add quest dm character = %v", err)
	}

	facts := arcGuardPolicyFacts{}
	policy, err := auth.NewPolicy(auth.PolicyProviders{Assignments: facts, Audience: facts, Identities: facts, SummaryRelationships: facts})
	if err != nil {
		t.Fatal(err)
	}
	admin, err := auth.NewAuthorityWithOwner(adminID, []auth.Role{auth.Admin}, "active", "draft", "admin", "")
	if err != nil {
		t.Fatal(err)
	}
	member, err := auth.NewAuthorityWithOwner(memberID, []auth.Role{auth.Player}, "active", "draft", "member", "")
	if err != nil {
		t.Fatal(err)
	}
	foreignDM, err := auth.NewAuthorityWithOwner(memberID, []auth.Role{auth.DM}, "active", "approved", "other-dm", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, operation := range []auth.Operation{"Mutation.addQuestParticipant", "Mutation.removeQuestParticipant"} {
		request, err := auth.ForQuest(operation, auth.QuestFacts{ID: questID, DMID: dmID})
		if err != nil {
			t.Fatal(err)
		}
		adminDecision, err := policy.Decide(t.Context(), admin, request)
		if err != nil || adminDecision != (auth.Decision{Allowed: true, UsedOverride: true, RuleCode: "OWNERSHIP"}) {
			t.Fatalf("%s admin = %+v %v", operation, adminDecision, err)
		}
		for _, actor := range []auth.Authority{member, foreignDM} {
			decision, err := policy.Decide(t.Context(), actor, request)
			if err != nil || decision != (auth.Decision{RuleCode: "OWNERSHIP"}) {
				t.Fatalf("%s caller %s = %+v %v", operation, actor.Claims().MemberID, decision, err)
			}
		}
	}
}

func TestLastGamePlayedRosterAddIsStaffOnly(t *testing.T) {
	const (
		dmID     = "10000000-0000-4000-8000-000000000001"
		playerID = "10000000-0000-4000-8000-000000000002"
	)
	player := &character.Admission{ID: "c", OwnerID: playerID, Status: "active", OwnerStatus: "active", Trusted: true}
	open := func(signup string) *QuestView {
		return &QuestView{Status: "open", SignupType: signupPtr(signup), SlotsMax: 2, FilledCount: 0, DmId: dmID}
	}
	if _, err := planRosterCorrection("add", open(lastGamePlayedSignup), player, nil, false); !rosterConflict(err, "use your two picks and the fill") {
		t.Fatalf("dm add on last game played = %v", err)
	}
	got, err := planRosterCorrection("add", open(lastGamePlayedSignup), player, nil, true)
	if err != nil || got.Status != "signed_up" || got.Delta != 1 {
		t.Fatalf("staff add on last game played = %+v %v", got, err)
	}
	got, err = planRosterCorrection("add", open(dmPickSignup), player, nil, false)
	if err != nil || got.Status != "signed_up" || got.Delta != 1 {
		t.Fatalf("dm add on dm pick = %+v %v", got, err)
	}
}

func signupPtr(value string) *string { return &value }

func rosterCode(err error, code apierr.Code) bool {
	var got *apierr.Error
	return errors.As(err, &got) && got.Code == code
}

func rosterConflict(err error, message string) bool {
	var got *apierr.Error
	return errors.As(err, &got) && got.Code == apierr.Conflict && got.Message == message
}
