package spatial

import (
	"encoding/json"
	"math"
	"math/big"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func validateTimeAnchor(input TimeAnchorFields) error {
	if input.RealUtc.IsZero() || math.IsNaN(input.Rate) || math.IsInf(input.Rate, 0) || input.Rate < 0 || input.Rate > 100 {
		return apierr.New(apierr.Invalid, "invalid time anchor")
	}
	return nil
}

func computeGameDay(midnight time.Time, anchor TimeAnchorView) (int32, error) {
	if err := validateTimeAnchor(TimeAnchorFields{RealUtc: anchor.RealUtc, Rate: anchor.Rate}); err != nil {
		return 0, err
	}
	// Unix seconds and nanoseconds separately avoid time.Duration's 290-year limit.
	elapsed := new(big.Int).Sub(big.NewInt(midnight.Unix()), big.NewInt(anchor.RealUtc.Unix()))
	elapsed.Mul(elapsed, big.NewInt(1_000_000_000))
	elapsed.Add(elapsed, big.NewInt(int64(midnight.Nanosecond()-anchor.RealUtc.Nanosecond())))
	rate, ok := new(big.Rat).SetString(strconv.FormatFloat(anchor.Rate, 'g', -1, 64))
	if !ok {
		return 0, apierr.New(apierr.Invalid, "invalid time anchor")
	}
	day := new(big.Rat).SetFrac(elapsed, big.NewInt(86_400_000_000_000))
	day.Mul(day, rate)
	day.Add(day, new(big.Rat).SetInt64(int64(anchor.EpochDay)))
	floor, remainder := new(big.Int), new(big.Int)
	floor.QuoRem(day.Num(), day.Denom(), remainder)
	if remainder.Sign() < 0 {
		floor.Sub(floor, big.NewInt(1))
	}
	if !floor.IsInt64() || floor.Int64() < math.MinInt32 || floor.Int64() > math.MaxInt32 {
		return 0, apierr.New(apierr.Invalid, "game day is outside the supported range")
	}
	return int32(floor.Int64()), nil
}

type calendarPeriod struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Days int32  `json:"days"`
}

type calendarDefinition struct {
	Era        string
	Periods    []calendarPeriod
	YearLength int64
}

func invalidCalendarDefinition() error {
	return apierr.New(apierr.Invalid, "invalid calendar definition")
}

func calendarLabel(value string, maximum int) bool {
	return strings.TrimSpace(value) != "" && utf8.RuneCountInString(value) <= maximum
}

// The anti-corruption layer normalizes the two accepted authored shapes once.
// It never rewrites the raw definition or calculates a real-to-game trajectory.
func parseCalendarDefinition(raw json.RawMessage) (calendarDefinition, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	var input struct {
		Epoch  string           `json:"epoch"`
		Months []calendarPeriod `json:"months"`
		Era    struct {
			Name   string `json:"name"`
			Abbrev string `json:"abbrev"`
		} `json:"era"`
		Periods     []calendarPeriod `json:"periods"`
		DaysPerWeek *int32           `json:"days_per_week"`
		Weekdays    *[]string        `json:"weekdays"`
		Leap        json.RawMessage  `json:"leap"`
		Rate        *float64         `json:"rate_real_days_per_game_day"`
		Moons       []struct {
			Name      string `json:"name"`
			CycleDays int32  `json:"cycle_days"`
		} `json:"moons"`
	}
	if err := json.Unmarshal(raw, &input); err != nil {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	_, legacy := fields["months"]
	_, modern := fields["periods"]
	if legacy == modern {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	definition := calendarDefinition{Era: input.Era.Abbrev, Periods: input.Periods}
	if legacy {
		if !calendarLabel(input.Epoch, 200) {
			return calendarDefinition{}, invalidCalendarDefinition()
		}
		definition.Era, definition.Periods = input.Epoch, input.Months
	} else if !calendarLabel(input.Era.Name, 200) || !calendarLabel(input.Era.Abbrev, 32) {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	if len(definition.Periods) < 1 || len(definition.Periods) > 36 {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	for i := range definition.Periods {
		period := &definition.Periods[i]
		if legacy {
			period.Type = "month"
		}
		if !calendarLabel(period.Name, 200) || period.Days < 1 || period.Days > 366 || period.Type != "month" && period.Type != "festival" {
			return calendarDefinition{}, invalidCalendarDefinition()
		}
		definition.YearLength += int64(period.Days)
	}
	if definition.YearLength > 3660 || len(input.Leap) > 0 && string(input.Leap) != "null" {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	if input.DaysPerWeek != nil && (*input.DaysPerWeek < 1 || *input.DaysPerWeek > 32) {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	if input.Weekdays != nil {
		if input.DaysPerWeek == nil || len(*input.Weekdays) != int(*input.DaysPerWeek) {
			return calendarDefinition{}, invalidCalendarDefinition()
		}
		for _, day := range *input.Weekdays {
			if !calendarLabel(day, 200) {
				return calendarDefinition{}, invalidCalendarDefinition()
			}
		}
	}
	if input.Rate != nil && (math.IsInf(*input.Rate, 0) || math.IsNaN(*input.Rate) || *input.Rate <= 0 || *input.Rate > 100) {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	if len(input.Moons) > 20 {
		return calendarDefinition{}, invalidCalendarDefinition()
	}
	for _, moon := range input.Moons {
		if !calendarLabel(moon.Name, 200) || moon.CycleDays < 1 || moon.CycleDays > 3660 {
			return calendarDefinition{}, invalidCalendarDefinition()
		}
	}
	return definition, nil
}

func renderCalendarDate(gameDay int32, definition calendarDefinition) (product.GameDateView, error) {
	yearIndex := int64(gameDay) / definition.YearLength
	withinYear := int64(gameDay) % definition.YearLength
	if withinYear < 0 {
		yearIndex--
		withinYear += definition.YearLength
	}
	year := yearIndex + 1
	if year < math.MinInt32 || year > math.MaxInt32 {
		return product.GameDateView{}, invalidCalendarDefinition()
	}
	for index, period := range definition.Periods {
		if withinYear < int64(period.Days) {
			return product.GameDateView{EraAbbrev: definition.Era, Year: int32(year), PeriodName: period.Name, PeriodIndex: int32(index), PeriodType: period.Type, Day: int32(withinYear) + 1}, nil
		}
		withinYear -= int64(period.Days)
	}
	return product.GameDateView{}, invalidCalendarDefinition()
}
