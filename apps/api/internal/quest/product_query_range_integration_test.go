//go:build integration

package quest

import (
	"context"
	"errors"
	"log/slog"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestQuestQueryScheduledRangeKeepsHalfOpenPagesAndRejectsInvalid(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	memberID, documentID := uuid.NewString(), uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1::uuid,$1::text,$1::text,'Range DM',ARRAY['dm'])`, memberID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id) SELECT $1::uuid,'quest_brief',$1::text,'Range brief','published','public','',id FROM members`, documentID); err != nil {
		t.Fatal(err)
	}
	at := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	ids := []string{"30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002", "30000000-0000-4000-8000-000000000003"}
	for i, id := range ids {
		scheduled := at
		if i == 2 {
			scheduled = at.Add(time.Microsecond)
		}
		if _, err := f.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by) SELECT $1::uuid,$1::text,ARRAY['standard'],'open',m.id,$2,d.id,m.id FROM members m,documents d`, id, scheduled); err != nil {
			t.Fatal(err)
		}
	}
	repo, _ := NewProductPostgres(f.Pool)
	policy, _ := auth.NewPoolPolicy(f.Pool)
	observer, _ := auth.NewSafeOverrideObserver(slog.Default())
	queries, err := NewProductQueries(ProductReadRepos{Quest: repo, Arc: repo, Batch: repo}, policy, func() time.Time { return at.Add(-time.Hour) }, observer)
	if err != nil {
		t.Fatal(err)
	}
	from, to := at.In(time.FixedZone("offset", 2*60*60)), at.Add(time.Microsecond)
	for _, test := range []struct {
		name    string
		filters *QuestFiltersFields
		want    []string
	}{
		{"omitted", nil, ids},
		{"empty", &QuestFiltersFields{}, ids},
		{"lower only", &QuestFiltersFields{ScheduledFrom: &from}, ids},
		{"upper only", &QuestFiltersFields{ScheduledTo: &to}, ids[:2]},
		{"one microsecond half-open", &QuestFiltersFields{ScheduledFrom: &from, ScheduledTo: &to}, ids[:2]},
	} {
		t.Run(test.name, func(t *testing.T) {
			for offset := 0; offset <= len(test.want); offset++ {
				page, err := queries.Quests(ctx, auth.Authority{}, QuestsSpec{Filters: test.filters, Limit: 1, Offset: int32(offset)})
				if err != nil || page.Total != int32(len(test.want)) {
					t.Fatalf("offset%d page=%+v error=%v", offset, page, err)
				}
				got := []string{}
				for _, item := range page.Items {
					got = append(got, item.Id)
				}
				want := []string{}
				if offset < len(test.want) {
					want = append(want, test.want[offset])
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("offset%d ids=%v want=%v", offset, got, want)
				}
			}
		})
	}
	for _, bounds := range [][2]time.Time{{at, at}, {to, at}, {from, at}} {
		_, err := queries.Quests(ctx, auth.Authority{}, QuestsSpec{Filters: &QuestFiltersFields{ScheduledFrom: &bounds[0], ScheduledTo: &bounds[1]}, Limit: 1})
		failure, ok := errors.AsType[*apierr.Error](err)
		if !ok || failure.Code != apierr.Invalid {
			t.Fatalf("invalid range error=%v", err)
		}
	}
}
