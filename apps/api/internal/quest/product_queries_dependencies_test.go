package quest

import (
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestQuestQueriesRequireArcReader(t *testing.T) {
	pg := &ProductPostgres{}
	var typedNil *ProductPostgres
	for _, arc := range []ArcReadRepository{nil, typedNil} {
		if _, err := NewProductQueries(ProductReadRepos{Quest: pg, Batch: pg, Arc: arc}, &auth.Policy{}, time.Now, &auth.SafeOverrideObserver{}); err == nil {
			t.Fatal("missing Arc reader accepted")
		}
	}
	if _, err := NewProductQueries(ProductReadRepos{Quest: pg, Batch: pg, Arc: pg}, &auth.Policy{}, time.Now, &auth.SafeOverrideObserver{}); err != nil {
		t.Fatal(err)
	}
}
