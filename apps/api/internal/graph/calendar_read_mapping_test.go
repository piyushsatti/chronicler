package graph

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func TestCurrentGameDatePreservesMissingDefinitionAndMalformedBoundary(t *testing.T) {
	r := &gameCalendarTypeResolver{Resolver: &Resolver{Services: Services{SpatialQueries: &spatial.ProductQueries{}}}}
	day := 0
	calendar := &GameCalendarType{CurrentGameDay: &day}
	if date, err := r.CurrentGameDate(context.Background(), calendar); date != nil || err != nil {
		t.Fatalf("absent definition fabricated a date or failed: date=%v err=%v", date, err)
	}
	calendar.Definition = json.RawMessage(`{}`)
	if date, err := r.CurrentGameDate(context.Background(), calendar); date != nil || err == nil {
		t.Fatalf("malformed definition did not fail its nullable date: date=%v err=%v", date, err)
	}
	if calendar.CurrentGameDay == nil || *calendar.CurrentGameDay != 0 || string(calendar.Definition) != `{}` {
		t.Fatal("date failure changed factual calendar fields")
	}
}

func TestMonthGridRendersEachMappedCellWithTheCalendarInterpreter(t *testing.T) {
	r := &gameCalendarTypeResolver{Resolver: &Resolver{Services: Services{SpatialQueries: &spatial.ProductQueries{}}}}
	day := func(v int) *int { return &v }
	cells := func() []*GameDayCellType {
		return []*GameDayCellType{
			{RealDate: "2026-10-12", GameDay: day(1)},
			{RealDate: "2026-10-13", GameDay: day(2)},
			{RealDate: "2026-10-14", GameDay: day(3)},
			{RealDate: "2026-10-15", GameDay: nil},
		}
	}
	calendar := &GameCalendarType{
		Definition: json.RawMessage(`{"era":{"name":"Pi Era","abbrev":"PI"},"periods":[{"name":"River","type":"month","days":2},{"name":"Thaw","type":"festival","days":1}]}`),
		MonthGrid:  cells(),
	}
	grid, err := r.MonthGrid(context.Background(), calendar)
	if err != nil || len(grid) != 4 {
		t.Fatalf("month grid failed: grid=%v err=%v", grid, err)
	}
	want := []*GameDateType{
		{EraAbbrev: "PI", Year: 1, PeriodName: "River", PeriodIndex: 0, PeriodType: "month", Day: 2},
		{EraAbbrev: "PI", Year: 1, PeriodName: "Thaw", PeriodIndex: 1, PeriodType: "festival", Day: 1},
		{EraAbbrev: "PI", Year: 2, PeriodName: "River", PeriodIndex: 0, PeriodType: "month", Day: 1},
		nil,
	}
	for i, cell := range grid {
		if cell.RealDate != calendar.MonthGrid[i].RealDate {
			t.Fatalf("cell %d changed its real date: %v", i, cell.RealDate)
		}
		if (cell.GameDate == nil) != (want[i] == nil) || cell.GameDate != nil && *cell.GameDate != *want[i] {
			t.Fatalf("cell %d game date = %+v, want %+v", i, cell.GameDate, want[i])
		}
	}
	if *grid[1].GameDate != *must(r.CurrentGameDate(context.Background(), &GameCalendarType{Definition: calendar.Definition, CurrentGameDay: day(2)})) {
		t.Fatal("cell and current date disagree for the same game day")
	}

	malformed := &GameCalendarType{Definition: json.RawMessage(`{}`), MonthGrid: cells()}
	grid, err = r.MonthGrid(context.Background(), malformed)
	if err != nil || len(grid) != 4 {
		t.Fatalf("malformed definition made the factual grid unreadable: grid=%v err=%v", grid, err)
	}
	for i, cell := range grid {
		if cell.GameDate != nil || (cell.GameDay == nil) != (malformed.MonthGrid[i].GameDay == nil) {
			t.Fatalf("malformed definition cell %d = %+v", i, cell)
		}
	}

	noCalendar := &GameCalendarType{MonthGrid: cells()}
	grid, err = r.MonthGrid(context.Background(), noCalendar)
	if err != nil || len(grid) != 4 {
		t.Fatalf("month grid without calendar failed: grid=%v err=%v", grid, err)
	}
	for i, cell := range grid {
		if cell.GameDate != nil {
			t.Fatalf("cell %d fabricated a game date without a calendar: %+v", i, cell.GameDate)
		}
		if (cell.GameDay == nil) != (noCalendar.MonthGrid[i].GameDay == nil) {
			t.Fatalf("cell %d lost its game day", i)
		}
	}
}

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}
