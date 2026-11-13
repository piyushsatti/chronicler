package quest

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
)

func TestSelectionExceedsSeatCap(t *testing.T) {
	dm, lastGame := dmPickSignup, lastGamePlayedSignup
	if selectionExceedsSeatCap(&dm, 1, 1, 3) {
		t.Fatal("dm_pick selection is not seat-capped")
	}
	if !selectionExceedsSeatCap(&lastGame, 1, 1, 1) {
		t.Fatal("last game played selection over the open seats must be rejected")
	}
	if selectionExceedsSeatCap(&lastGame, 4, 1, 3) {
		t.Fatal("last game played selection within open seats must be accepted")
	}
	if !selectionExceedsSeatCap(nil, 2, 2, 1) {
		t.Fatal("unset signup type stays seat-capped")
	}
}

func TestLastGamePlayedDMPickCapAndFill(t *testing.T) {
	dm, lastGame := dmPickSignup, lastGamePlayedSignup
	if lastGamePlayedDMPickBlocked(&dm, 0, 5) || lastGamePlayedDMPickBlocked(nil, 0, 3) {
		t.Fatal("only last game played hand picks are capped at two")
	}
	if lastGamePlayedDMPickBlocked(&lastGame, 0, 2) || lastGamePlayedDMPickBlocked(&lastGame, 1, 1) {
		t.Fatal("two hand picks, counting rows already picked, must be accepted")
	}
	if !lastGamePlayedDMPickBlocked(&lastGame, 2, 1) || !lastGamePlayedDMPickBlocked(&lastGame, 1, 2) || !lastGamePlayedDMPickBlocked(&lastGame, 0, 3) {
		t.Fatal("a third hand pick must be rejected")
	}
	active := func(id string) character.Admission {
		return character.Admission{ID: id, Status: "active", OwnerStatus: "active", Trusted: true}
	}
	never, long, early, recent := QuestParticipantView{CharacterId: "never"}, QuestParticipantView{CharacterId: "long"}, QuestParticipantView{CharacterId: "early"}, QuestParticipantView{CharacterId: "recent"}
	admitted := map[string]character.Admission{
		"never": active("never"), "long": active("long"),
		"early":  {ID: "early", Status: "retired", OwnerStatus: "active"},
		"recent": active("recent"),
	}
	requested := map[string]struct{}{"never": {}, "long": {}, "early": {}, "recent": {}}
	// ordered is the seat-priority query: never played, then longest wait, then earlier signup.
	ids, changed := fillLastGamePlayedSeats([]QuestParticipantView{never, long, early, recent}, 2, requested, admitted)
	if changed || len(ids) != 2 || ids[0] != "never" || ids[1] != "long" {
		t.Fatalf("fill = %v changed=%v", ids, changed)
	}
	ids, changed = fillLastGamePlayedSeats([]QuestParticipantView{never, long, recent}, 0, requested, admitted)
	if changed || len(ids) != 0 {
		t.Fatalf("no open seats = %v changed=%v", ids, changed)
	}
	if _, changed = fillLastGamePlayedSeats([]QuestParticipantView{never, {CharacterId: "new"}}, 2, requested, admitted); !changed {
		t.Fatal("a waitlisted character locked after the snapshot must be retried")
	}
}
