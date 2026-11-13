package spatial

import (
	"errors"
	"math"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestTimeTrajectoryUsesExactSignedRationalFloor(t *testing.T) {
	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name  string
		at    time.Time
		epoch int32
		rate  float64
		want  int32
	}{
		{"integer", start.AddDate(0, 0, 13), 100, 1, 113},
		{"decimal boundary", start.AddDate(0, 0, 10), -1, 0.1, 0},
		{"decimal floor", start.AddDate(0, 0, 9), -1, 0.1, -1},
		{"before anchor", start.Add(-time.Nanosecond), 0, 1, -1},
		{"negative fractional", start.Add(-12 * time.Hour), -1, 1, -2},
		{"pause", start.AddDate(0, 0, 30), -17, 0, -17},
		{"maximum rate", start.Add(12 * time.Hour), 0, 100, 50},
		{"small exponent", start.AddDate(0, 0, 30), -1, 1e-20, -1},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := computeGameDay(test.at, TimeAnchorView{RealUtc: start, EpochDay: test.epoch, Rate: test.rate})
			if err != nil || got != test.want {
				t.Fatalf("day=%d error=%v, want %d", got, err, test.want)
			}
		})
	}
	day, err := computeGameDay(time.Date(9000, 1, 1, 0, 0, 0, 0, time.UTC), TimeAnchorView{RealUtc: time.Date(1000, 1, 1, 0, 0, 0, 0, time.UTC), EpochDay: -1, Rate: 0.1})
	if err != nil || day != 292193 {
		t.Fatalf("8000-year span=%d error=%v", day, err)
	}
}

func TestTimeTrajectoryRejectsInvalidRatesAndOverflow(t *testing.T) {
	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for _, rate := range []float64{-0.1, 100.1, math.NaN(), math.Inf(1), math.Inf(-1)} {
		if _, err := computeGameDay(start, TimeAnchorView{RealUtc: start, Rate: rate}); err == nil {
			t.Fatalf("accepted rate %v", rate)
		}
	}
	for _, test := range []struct {
		epoch int32
		at    time.Time
	}{{math.MaxInt32, start.AddDate(0, 0, 1)}, {math.MinInt32, start.Add(-time.Nanosecond)}} {
		if _, err := computeGameDay(test.at, TimeAnchorView{RealUtc: start, EpochDay: test.epoch, Rate: 1}); err == nil {
			t.Fatal("accepted overflowing day")
		}
	}
}

func TestTimeProjectionUsesMidnightsAndLatestCalibration(t *testing.T) {
	start := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	anchors := []TimeAnchorView{
		{RealUtc: start.AddDate(0, 0, -1), EpochDay: -1, Rate: 1},
		{RealUtc: start.Add(12 * time.Hour), EpochDay: 5, Rate: 0},
		{RealUtc: start.AddDate(0, 0, 2), EpochDay: 9, Rate: 2},
	}
	cells, err := projectTimeCells("2026-10-14", "2026-10-17", anchors)
	if err != nil || len(cells) != 3 {
		t.Fatalf("cells=%v error=%v", cells, err)
	}
	for i, want := range []int32{0, 5, 9} {
		if cells[i].GameDay == nil || *cells[i].GameDay != want || cells[i].RealDate != product.Date(start.AddDate(0, 0, i).Format("2006-01-02")) {
			t.Fatalf("cell %d=%+v, want %d", i, cells[i], want)
		}
	}
	_, err = projectTimeCells("2026-10-14", "2026-10-17", anchors[1:])
	failure, ok := errors.AsType[*apierr.Error](err)
	if !errors.Is(err, ErrTimeAnchorUncovered) || !ok || failure.Code != apierr.Invalid {
		t.Fatalf("uncovered error=%v", err)
	}
}
