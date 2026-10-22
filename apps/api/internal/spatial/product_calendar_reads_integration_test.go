//go:build integration

package spatial_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	productgraphql "github.com/piyushsatti/chronicler/apps/api/internal/platform/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func TestRetainedCalendarReadsUseStoredNamedDatesAndInjectedCurrentUTC(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	modern := json.RawMessage(`{"era":{"name":"Pi Era","abbrev":"PI"},"periods":[{"name":"River","type":"month","days":30}],"leap":null}`)
	if _, err := f.Pool.Exec(ctx, `INSERT INTO game_calendar(id,definition) VALUES(1,$1)`, modern); err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		date string
		day  int32
	}{{"2026-10-12", 112}, {"2026-10-13", 112}, {"2026-10-14", 113}, {"2026-10-15", 114}, {"2026-10-17", 0}, {"2026-10-18", -1}} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO game_time_map(real_date,game_day) VALUES($1::date,$2)`, row.date, row.day); err != nil {
			t.Fatal(err)
		}
	}
	pg, _ := spatial.NewProductPostgres(f.Pool)
	policy, _ := auth.NewPoolPolicy(f.Pool)
	observer, _ := auth.NewSafeOverrideObserver(slog.Default())
	clock := func() time.Time { return time.Date(2026, 10, 14, 23, 0, 0, 0, time.UTC) }
	queries, err := spatial.NewProductQueries(spatial.ProductReadRepos{Map: pg, Region: pg, Time: pg, Batch: pg, TimeBatch: pg}, policy, clock, observer)
	if err != nil {
		t.Fatal(err)
	}
	handler := productgraphql.NewHandler(&graph.Resolver{Services: graph.Services{SpatialQueries: queries}, BatchProviders: graph.BatchProviders{Spatial: queries}}, productgraphql.Limits{}, func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, nil })
	call := func(query string) (map[string]json.RawMessage, []json.RawMessage) {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"query": query})
		request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		var result struct {
			Data   map[string]json.RawMessage `json:"data"`
			Errors []json.RawMessage          `json:"errors"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatalf("response=%s err=%v", response.Body.String(), err)
		}
		return result.Data, result.Errors
	}
	snapshot := func() string {
		t.Helper()
		var state string
		if err := f.Pool.QueryRow(ctx, `SELECT jsonb_build_object('calendar',(SELECT jsonb_agg(to_jsonb(c)) FROM game_calendar c),'map',(SELECT jsonb_agg(to_jsonb(m) ORDER BY real_date) FROM game_time_map m))::text`).Scan(&state); err != nil {
			t.Fatal(err)
		}
		return state
	}
	before := snapshot()
	query := `query {gameCalendar(realFrom:"2026-10-14",realTo:"2026-10-17"){definition currentGameDay currentGameDate{eraAbbrev year periodName periodIndex periodType day} monthGrid{realDate gameDay}} selected:gameDate(realDate:"2026-10-14"){eraAbbrev year periodName periodIndex periodType day} missing:gameDate(realDate:"2026-10-16"){day} zero:gameDate(realDate:"2026-10-17"){year day} negative:gameDate(realDate:"2026-10-18"){year day}}`
	data, failures := call(query)
	if len(failures) > 0 {
		t.Fatalf("named reads errors=%s", failures)
	}
	var selected product.GameDateView
	if err := json.Unmarshal(data["selected"], &selected); err != nil || selected != (product.GameDateView{EraAbbrev: "PI", Year: 4, PeriodName: "River", PeriodIndex: 0, PeriodType: "month", Day: 24}) {
		t.Fatalf("selected=%s err=%v", data["selected"], err)
	}
	if string(data["missing"]) != "null" || string(data["zero"]) != `{"year":1,"day":1}` || string(data["negative"]) != `{"year":0,"day":30}` {
		t.Fatalf("missing=%s zero=%s negative=%s", data["missing"], data["zero"], data["negative"])
	}
	var calendar struct {
		Definition      json.RawMessage
		CurrentGameDay  int32
		CurrentGameDate product.GameDateView
		MonthGrid       []struct {
			RealDate string
			GameDay  *int32
		}
	}
	if err := json.Unmarshal(data["gameCalendar"], &calendar); err != nil {
		t.Fatal(err)
	}
	if calendar.CurrentGameDay != 113 || calendar.CurrentGameDate != selected || len(calendar.MonthGrid) != 3 || calendar.MonthGrid[0].RealDate != "2026-10-14" || calendar.MonthGrid[2].GameDay != nil {
		t.Fatalf("calendar=%s", data["gameCalendar"])
	}
	var inputDefinition, outputDefinition any
	if err := json.Unmarshal(modern, &inputDefinition); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(calendar.Definition, &outputDefinition); err != nil || !reflect.DeepEqual(inputDefinition, outputDefinition) {
		t.Fatalf("definition changed: %s %v", calendar.Definition, err)
	}
	for offset, want := range []string{`{"items":["2026-10-12"],"total":2}`, `{"items":["2026-10-13"],"total":2}`, `{"items":[],"total":2}`} {
		result, err := queries.RealDates(ctx, auth.Authority{}, spatial.RealDatesSpec{GameDay: 112, Limit: 1, Offset: int32(offset)})
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(map[string]any{"items": result.Items, "total": result.Total})
		if string(raw) != want {
			t.Fatalf("reverse page=%s want=%s", raw, want)
		}
	}
	for _, to := range []string{"2026-10-14", "2026-10-13", "2027-10-16"} {
		if _, err := queries.GameCalendar(ctx, auth.Authority{}, spatial.GameCalendarSpec{RealFrom: "2026-10-14", RealTo: product.Date(to)}); err == nil {
			t.Fatalf("accepted invalid range to %s", to)
		}
	}
	if snapshot() != before {
		t.Fatal("Calendar read filled or changed stored map/definition")
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE game_calendar SET definition='{"epoch":"E","months":[{"name":"M","days":0}]}'::jsonb`); err != nil {
		t.Fatal(err)
	}
	data, failures = call(query)
	if len(failures) != 4 {
		t.Fatalf("malformed definition errors=%s data=%s", failures, data["gameCalendar"])
	}
	var partial struct {
		CurrentGameDay  int32
		CurrentGameDate *json.RawMessage
		MonthGrid       []json.RawMessage
		Definition      json.RawMessage
	}
	if err := json.Unmarshal(data["gameCalendar"], &partial); err != nil || partial.CurrentGameDay != 113 || partial.CurrentGameDate != nil || len(partial.MonthGrid) != 3 || len(partial.Definition) == 0 {
		t.Fatalf("lazy malformed field destroyed factual siblings: %s %v", data["gameCalendar"], err)
	}
	if _, err := f.Pool.Exec(ctx, `DELETE FROM game_calendar`); err != nil {
		t.Fatal(err)
	}
	data, failures = call(`query {gameCalendar(realFrom:"2026-10-14",realTo:"2026-10-17"){definition currentGameDay currentGameDate{day} monthGrid{realDate gameDay}}}`)
	if len(failures) > 0 {
		t.Fatalf("absent singleton errors=%s", failures)
	}
	if err := json.Unmarshal(data["gameCalendar"], &partial); err != nil || partial.CurrentGameDay != 113 || partial.CurrentGameDate != nil || len(partial.MonthGrid) != 3 || string(partial.Definition) != "null" {
		t.Fatalf("absent singleton facts=%s err=%v", data["gameCalendar"], err)
	}
}
