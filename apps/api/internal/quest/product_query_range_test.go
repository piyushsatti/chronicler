package quest

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestQuestQueryRejectsInvalidScheduledRangeBeforeDependencies(t *testing.T) {
	at := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	sameInstant := at.In(time.FixedZone("offset", 2*60*60))
	later := at.Add(time.Microsecond)
	for _, test := range []struct {
		name     string
		from, to time.Time
	}{{"equal", at, at}, {"equal with different offset", sameInstant, at}, {"inverted", later, at}} {
		t.Run(test.name, func(t *testing.T) {
			queries := ProductQueries{Clock: func() time.Time { t.Fatal("invalid range reached the clock"); return at }}
			_, err := queries.Quests(context.Background(), auth.Authority{}, QuestsSpec{Filters: &QuestFiltersFields{ScheduledFrom: &test.from, ScheduledTo: &test.to}, Limit: 10})
			failure, ok := errors.AsType[*apierr.Error](err)
			if !ok || failure.Code != apierr.Invalid {
				t.Fatalf("error=%v, want INVALID", err)
			}
		})
	}
}
