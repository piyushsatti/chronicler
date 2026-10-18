package graph

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"reflect"
	"testing"
	"time"
)

type graphQuestDB struct {
	args []any
	err  error
}

func (d *graphQuestDB) Query(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
	d.args = args
	return nil, d.err
}
func (*graphQuestDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("unexpected write")
}
func (*graphQuestDB) QueryRow(context.Context, string, ...any) pgx.Row { panic("unexpected query row") }
func TestQuestReadResolverFiltersAndOrder(t *testing.T) {
	at := time.Date(2035, 1, 1, 12, 0, 0, 0, time.UTC)
	end := at.Add(time.Hour)
	status, display := "OPEN", "LiVe"
	sentinel := errors.New("read failed")
	for _, name := range []string{"generic", "board", "recent"} {
		t.Run(name, func(t *testing.T) {
			store := &graphQuestDB{err: sentinel}
			r := &Resolver{Services: Services{Quests: quest.Queries{Read: quest.NewReadModel(dbgen.New(store))}}}
			var err error
			var want []any
			switch name {
			case "generic":
				_, err = r.Query().Quests(context.Background(), &QuestV2FiltersInput{Status: &status, DisplayStatus: &display, ScheduledFrom: &at, ScheduledTo: &end}, 7, 2)
				want = []any{false, pgtype.Text{}, pgtype.Text{String: "live", Valid: true}, pgtype.Timestamptz{Time: at, Valid: true}, pgtype.Timestamptz{Time: end, Valid: true}, int32(2), int32(7)}
			case "board":
				_, err = r.Query().QuestBoard(context.Background(), nil, 7, 2)
				want = []any{true, pgtype.Text{String: "open", Valid: true}, pgtype.Text{}, pgtype.Timestamptz{}, pgtype.Timestamptz{}, int32(2), int32(7)}
			case "recent":
				_, err = r.Query().RecentlyClosedQuests(context.Background(), nil, &at, 7, 2)
				want = []any{true, pgtype.Text{String: "closed", Valid: true}, pgtype.Text{}, pgtype.Timestamptz{}, pgtype.Timestamptz{}, int32(2), int32(7)}
			}
			if !errors.Is(err, sentinel) || !reflect.DeepEqual(store.args, want) {
				t.Fatalf("err=%v args=%#v want=%#v", err, store.args, want)
			}
		})
	}
}
func TestQuestReadGraphMapper(t *testing.T) {
	at := time.Date(2035, 1, 1, 12, 0, 0, 0, time.UTC)
	q := toQuestV2(quest.LegacyQuestView{ID: "public-id", ShortCode: "Q-oracle", Status: quest.Open, DisplayStatus: "live", DurationHours: 1.5, DMID: "dm-id", DocumentID: "doc-id", ScheduledAt: at, FilledCount: 2, SlotsMax: 5, DiscordDesiredRevision: 8, DiscordAppliedRevision: 3})
	if q.Status != "open" || q.DisplayStatus == nil || *q.DisplayStatus != "live" || q.DurationHours != 1.5 || q.ID != "public-id" || q.DmID != "dm-id" || q.DocumentID == nil || *q.DocumentID != "doc-id" || !q.ScheduledAt.Equal(at) || q.DiscordDelivery.DesiredRevision != 8 || q.DiscordDelivery.AppliedRevision != 3 {
		t.Fatalf("bad projection: %+v", q)
	}
}

func TestQuestReadsUnconfiguredResolver(t *testing.T) {
	r := &Resolver{}
	page, err := r.Query().Quests(context.Background(), nil, 20, 0)
	if err == nil || page != nil {
		t.Fatalf("unconfigured producer returned empty-success: page=%+v error=%v", page, err)
	}
}
