package quest

import (
	"context"
	"errors"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type questReadDB struct {
	calls int
	args  []any
	rows  *questReadRows
	err   error
}

func (d *questReadDB) Query(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
	d.calls++
	d.args = args
	if d.err != nil {
		return nil, d.err
	}
	return d.rows, nil
}
func (*questReadDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("read executed a write")
}
func (*questReadDB) QueryRow(context.Context, string, ...any) pgx.Row {
	panic("list issued a second query")
}

type questReadRows struct {
	pgx.Rows
	data                [][]any
	index               int
	scanErr, errorAfter error
	closed              bool
}

func (r *questReadRows) Next() bool {
	if r.index >= len(r.data) {
		return false
	}
	r.index++
	return true
}
func (r *questReadRows) Close()     { r.closed = true }
func (r *questReadRows) Err() error { return r.errorAfter }
func (r *questReadRows) Scan(dest ...any) error {
	if r.scanErr != nil {
		return r.scanErr
	}
	for i, v := range r.data[r.index-1] {
		reflect.ValueOf(dest[i]).Elem().Set(reflect.ValueOf(v))
	}
	return nil
}
func questText(s string) *string { return &s }

func TestQuestReadsFilterNormalization(t *testing.T) {
	at := time.Date(2035, 1, 1, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name                 string
		status, display      *string
		machine, wantDisplay pgtype.Text
		calls                int
	}{
		{"absent", nil, nil, pgtype.Text{}, pgtype.Text{}, 1},
		{"open uppercase", questText("OPEN"), nil, pgtype.Text{String: "open", Valid: true}, pgtype.Text{}, 1},
		{"full", questText("full"), nil, pgtype.Text{String: "full", Valid: true}, pgtype.Text{}, 1},
		{"played", questText("played"), nil, pgtype.Text{String: "played", Valid: true}, pgtype.Text{}, 1},
		{"closed", questText("closed"), nil, pgtype.Text{String: "closed", Valid: true}, pgtype.Text{}, 1},
		{"cancelled", questText("cancelled"), nil, pgtype.Text{String: "cancelled", Valid: true}, pgtype.Text{}, 1},
		{"empty machine", questText(""), nil, pgtype.Text{}, pgtype.Text{}, 0},
		{"unknown machine", questText("unknown"), nil, pgtype.Text{}, pgtype.Text{}, 0},
		{"no trim", questText(" open "), nil, pgtype.Text{}, pgtype.Text{}, 0},
		{"display case", nil, questText("LiVe"), pgtype.Text{}, pgtype.Text{String: "live", Valid: true}, 1},
		{"display overrides valid machine", questText("closed"), questText("LIVE"), pgtype.Text{}, pgtype.Text{String: "live", Valid: true}, 1},
		{"invalid machine before display", questText("bad"), questText("live"), pgtype.Text{}, pgtype.Text{}, 0},
		{"empty machine before display", questText(""), questText("live"), pgtype.Text{}, pgtype.Text{}, 0},
		{"empty display is present", nil, questText(""), pgtype.Text{}, pgtype.Text{String: "", Valid: true}, 1},
		{"unknown display is present", nil, questText("other"), pgtype.Text{}, pgtype.Text{String: "other", Valid: true}, 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &questReadDB{rows: &questReadRows{}}
			read := NewReadModel(dbgen.New(store))
			got, total, err := read.List(context.Background(), ListFilter{Status: tc.status, DisplayStatus: tc.display, ScheduledFrom: &at, ScheduledTo: &at, Limit: 7, Offset: 2, Order: NewestFirst})
			if err != nil || got == nil || len(got) != 0 || total != 0 || store.calls != tc.calls {
				t.Fatalf("got=%v total=%d err=%v calls=%d", got, total, err, store.calls)
			}
			if tc.calls > 0 {
				want := []any{true, tc.machine, tc.wantDisplay, pgtype.Timestamptz{Time: at, Valid: true}, pgtype.Timestamptz{Time: at, Valid: true}, int32(2), int32(7)}
				if !reflect.DeepEqual(store.args, want) {
					t.Fatalf("args=%#v want=%#v", store.args, want)
				}
			}
		})
	}
}

func TestQuestReadsDependencyAndErrors(t *testing.T) {
	for _, read := range []*ReadModel{nil, NewReadModel(nil)} {
		for _, status := range []*string{nil, questText("invalid")} {
			if _, _, err := (Queries{Read: read}).List(context.Background(), ListFilter{Status: status}); err == nil {
				t.Fatal("missing dependency must fail before empty filter")
			}
		}
	}
	for _, stage := range []string{"query", "scan", "rows"} {
		t.Run(stage, func(t *testing.T) {
			sentinel := errors.New(stage + " private database failure")
			rows := &questReadRows{}
			store := &questReadDB{rows: rows}
			switch stage {
			case "query":
				store.err = sentinel
			case "scan":
				rows.data = [][]any{{}}
				rows.scanErr = sentinel
			case "rows":
				rows.errorAfter = sentinel
			}
			got, total, err := NewReadModel(dbgen.New(store)).List(context.Background(), ListFilter{Limit: 20})
			if !errors.Is(err, sentinel) || got != nil || total != 0 {
				t.Fatalf("got=%v total=%d err=%v", got, total, err)
			}
			if stage != "query" && !rows.closed {
				t.Fatal("rows not closed")
			}
		})
	}
	for _, f := range []ListFilter{{Limit: math.MaxInt32 + 1}, {Offset: math.MinInt32 - 1}, {Order: ListOrder(9)}} {
		store := &questReadDB{}
		if _, _, err := NewReadModel(dbgen.New(store)).List(context.Background(), f); err == nil || store.calls != 0 {
			t.Fatalf("invalid internal input reached database: %+v", f)
		}
	}
	// In-range negatives retain the SQL error boundary rather than silently clamping.
	store := &questReadDB{err: errors.New("negative pagination")}
	_, _, err := NewReadModel(dbgen.New(store)).List(context.Background(), ListFilter{Limit: -1, Offset: -2})
	if err == nil || store.args[5] != int32(-2) || store.args[6] != int32(-1) {
		t.Fatal("negative inputs changed")
	}
}

func TestQuestReadsCarrierAndCommandMapping(t *testing.T) {
	zero := pgtype.UUID{}
	at := pgtype.Timestamptz{Time: time.Date(2035, 1, 1, 12, 0, 0, 0, time.UTC), Valid: true}
	store := &questReadDB{rows: &questReadRows{data: [][]any{{int64(7), false, int64(0), zero, "", "", "", zero, at, float64(0), int32(0), int32(0), zero, int32(0), int32(0)}}}}
	rows, total, err := NewReadModel(dbgen.New(store)).List(context.Background(), ListFilter{Limit: 0})
	if err != nil || total != 7 || rows == nil || len(rows) != 0 || store.calls != 1 {
		t.Fatalf("carrier escaped: %+v %d %v", rows, total, err)
	}
	id, _ := db.ParseUUID("10000000-0000-4000-8000-000000000001")
	dm, _ := db.ParseUUID("10000000-0000-4000-8000-000000000002")
	doc, _ := db.ParseUUID("10000000-0000-4000-8000-000000000003")
	for _, tc := range []struct {
		status, display string
		allowed         bool
	}{{"open", "live", true}, {"full", "scheduled", true}, {"closed", "closed", false}} {
		source := dbgen.GetQuestRow{PublicID: id, DmPublicID: dm, DocumentPublicID: doc, ShortCode: "Q-oracle", Status: tc.status, DisplayStatus: tc.display, ScheduledAt: at, DurationHours: 1.5, FilledCount: 2, SlotsMax: 5, DiscordDesiredRevision: 8, DiscordAppliedRevision: 3}
		view := mapQuestView(source)
		command := mapQuestRow(source)
		if string(view.Status) != tc.status || string(command.Status) != tc.status || view.DisplayStatus != tc.display || view.DurationHours != 1.5 || view.ID != db.UUIDString(id) || view.DocumentID != db.UUIDString(doc) || view.DMID != db.UUIDString(dm) || view.DiscordDesiredRevision != 8 || view.DiscordAppliedRevision != 3 {
			t.Fatalf("mapping changed identity/state: %+v %+v", view, command)
		}
		if (canSignUp(view) == nil) != tc.allowed {
			t.Fatal("signup used display state")
		}
	}
}
