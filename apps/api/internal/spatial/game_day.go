package spatial

import "time"

// GameDayAt is the campaign day a real UTC midnight maps to under an anchor.
// It is the one game-day formula; seed data (cmd/seedqa) calls it rather than
// restating it.
func GameDayAt(midnight time.Time, anchor TimeAnchorView) (int32, error) {
	return computeGameDay(midnight, anchor)
}
