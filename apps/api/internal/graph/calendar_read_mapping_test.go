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
