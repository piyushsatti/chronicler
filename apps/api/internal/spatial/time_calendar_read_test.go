package spatial

import (
	"encoding/json"
	"errors"
	"math"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const modernReadCalendar = `{"era":{"name":"Pi Era","abbrev":"PI"},"periods":[{"name":"River","type":"month","days":30}],"days_per_week":2,"weekdays":["One","Two"],"leap":null,"rate_real_days_per_game_day":1.5,"moons":[{"name":"Moon","cycle_days":28}]}`
const legacyReadCalendar = `{"epoch":"Year of the Kept Tower","months":[{"name":"Thaw","days":30},{"name":"Salt","days":30},{"name":"Harrow","days":30},{"name":"Ember","days":30}]}`

func calendarReadCode(t *testing.T, err error, code apierr.Code) {
	t.Helper()
	failure, ok := errors.AsType[*apierr.Error](err)
	if !ok || failure.Code != code {
		t.Fatalf("error=%v want=%v", err, code)
	}
}

func TestCalendarReadRendererUsesAcceptedDefinitionsAndMathematicalFloor(t *testing.T) {
	for _, test := range []struct {
		raw  string
		day  int32
		want product.GameDateView
	}{
		{modernReadCalendar, 113, product.GameDateView{EraAbbrev: "PI", Year: 4, PeriodName: "River", PeriodIndex: 0, PeriodType: "month", Day: 24}},
		{legacyReadCalendar, 214, product.GameDateView{EraAbbrev: "Year of the Kept Tower", Year: 2, PeriodName: "Ember", PeriodIndex: 3, PeriodType: "month", Day: 5}},
		{modernReadCalendar, 0, product.GameDateView{EraAbbrev: "PI", Year: 1, PeriodName: "River", PeriodType: "month", Day: 1}},
		{modernReadCalendar, -1, product.GameDateView{EraAbbrev: "PI", Year: 0, PeriodName: "River", PeriodType: "month", Day: 30}},
		{modernReadCalendar, -31, product.GameDateView{EraAbbrev: "PI", Year: -1, PeriodName: "River", PeriodType: "month", Day: 30}},
		{`{"era":{"name":"Era","abbrev":"E"},"periods":[{"name":"Month","type":"month","days":2},{"name":"Feast","type":"festival","days":1}]}`, 2, product.GameDateView{EraAbbrev: "E", Year: 1, PeriodName: "Feast", PeriodIndex: 1, PeriodType: "festival", Day: 1}},
	} {
		raw := json.RawMessage(test.raw)
		before := string(raw)
		view, err := (ProductQueries{}).RenderStoredGameDate(&test.day, &raw)
		if err != nil || view == nil || *view != test.want || string(raw) != before {
			t.Fatalf("day=%d view=%+v want=%+v err=%v", test.day, view, test.want, err)
		}
	}
}

func TestCalendarReadRendererRejectsMalformedStoredDefinitionsWithoutFabricatedDates(t *testing.T) {
	for _, raw := range []string{
		`null`, `{}`, `{"epoch":"E","months":[]}`, `{"epoch":"E","months":[{"name":"M","days":0}]}`,
		`{"epoch":"E","months":[{"name":"M","days":367}]}`,
		`{"epoch":"E","months":[{"name":"M","days":30}],"periods":[]}`,
		`{"era":{"name":"E","abbrev":"E"},"periods":[{"name":"M","type":"unknown","days":30}]}`,
		`{"era":{"name":"E","abbrev":"E"},"periods":[{"name":"M","type":"month","days":30}],"leap":{"every":4}}`,
		`{"era":{"name":"E","abbrev":"E"},"periods":[{"name":"M","type":"month","days":30}],"rate_real_days_per_game_day":0}`,
		`{"epoch":"E","months":[{"name":"M","days":30}],"days_per_week":2,"weekdays":["One"]}`,
	} {
		parsed, err := parseCalendarDefinition(json.RawMessage(raw))
		if err == nil {
			t.Fatalf("accepted malformed definition: %s -> %+v", raw, parsed)
		}
		day := int32(1)
		definition := json.RawMessage(raw)
		_, err = (ProductQueries{}).RenderStoredGameDate(&day, &definition)
		calendarReadCode(t, err, apierr.Internal)
	}
	day := int32(0)
	_, err := (ProductQueries{}).RenderStoredGameDate(&day, nil)
	calendarReadCode(t, err, apierr.Internal)
	if view, err := (ProductQueries{}).RenderStoredGameDate(nil, nil); err != nil || view != nil {
		t.Fatalf("unmapped date=%+v err=%v", view, err)
	}
	definition, err := parseCalendarDefinition(json.RawMessage(`{"epoch":"E","months":[{"name":"One","days":1}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := renderCalendarDate(math.MaxInt32, definition); err == nil {
		t.Fatal("unrepresentable GraphQL year silently overflowed")
	}
}
