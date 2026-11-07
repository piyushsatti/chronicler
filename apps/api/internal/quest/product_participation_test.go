package quest

import "testing"

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
