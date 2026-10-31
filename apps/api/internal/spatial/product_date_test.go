package spatial

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestCalendarCellDatesRejectNullAndInfiniteValues(t *testing.T) {
	for _, value := range []pgtype.Date{{}, {Valid: true, InfinityModifier: pgtype.Infinity}, {Valid: true, InfinityModifier: pgtype.NegativeInfinity}} {
		if _, err := productDateFromPGDate(value); err == nil {
			t.Fatalf("accepted non-finite date=%+v", value)
		}
	}
	got, err := productDateFromPGDate(pgtype.Date{Time: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), Valid: true})
	if err != nil || got != "2027-01-01" {
		t.Fatalf("date=%s err=%v, want stored civil date", got, err)
	}
}
