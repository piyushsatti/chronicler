//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestProductionTimeProjectionThroughGraphHTTP(t *testing.T) {
	f := newAuthorityDBFixture(t)
	ctx := context.Background()
	admin := f.member(t, auth.Admin)
	player := f.member(t, auth.Player)
	token := f.token(t, admin.publicID, auth.Admin)
	today := time.Now().UTC()
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	from, to := today.Format("2006-01-02"), today.AddDate(0, 0, 30).Format("2006-01-02")
	note := "Time HTTP boundary " + admin.publicID
	var priorCalendar, priorMap json.RawMessage
	if err := f.pool.QueryRow(ctx, `SELECT COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM game_calendar c),'[]'::jsonb),COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM game_time_map m WHERE real_date>=$1::date AND real_date<$2::date),'[]'::jsonb)`, from, to).Scan(&priorCalendar, &priorMap); err != nil {
		t.Fatal(err)
	}
	// Restore only this disposable fixture's singleton/range and owned identities.
	t.Cleanup(func() {
		f.exec(t, `DELETE FROM idempotency_keys WHERE actor_id=ANY($1::bigint[])`, []int64{admin.rowID, player.rowID})
		f.exec(t, `DELETE FROM time_anchors WHERE note=$1`, note)
		f.exec(t, `DELETE FROM game_time_map WHERE real_date>=$1::date AND real_date<$2::date`, from, to)
		f.exec(t, `INSERT INTO game_time_map SELECT * FROM jsonb_populate_recordset(NULL::game_time_map,$1::jsonb)`, priorMap)
		f.exec(t, `DELETE FROM game_calendar`)
		f.exec(t, `INSERT INTO game_calendar SELECT * FROM jsonb_populate_recordset(NULL::game_calendar,$1::jsonb)`, priorCalendar)
	})
	type failure struct {
		Path       []any                 `json:"path"`
		Extensions struct{ Code string } `json:"extensions"`
	}
	call := func(actorToken, query string, variables map[string]any) (map[string]json.RawMessage, []failure) {
		t.Helper()
		payload, err := json.Marshal(map[string]any{"query": query, "variables": variables})
		if err != nil {
			t.Fatal(err)
		}
		response := authorityDBRequest(f.handler, http.MethodPost, "/v1/graphql", actorToken, payload)
		assertAuthorityDBCORS(t, response)
		var result struct {
			Data   map[string]json.RawMessage `json:"data"`
			Errors []failure                  `json:"errors"`
		}
		if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &result) != nil {
			t.Fatalf("Graph HTTP status=%d body=%s", response.Code, response.Body)
		}
		return result.Data, result.Errors
	}
	success := func(actorToken, query string, variables map[string]any) map[string]json.RawMessage {
		t.Helper()
		data, failures := call(actorToken, query, variables)
		if len(failures) != 0 {
			t.Fatalf("Graph errors=%+v data=%s", failures, data)
		}
		return data
	}
	expectCode := func(actorToken, query string, variables map[string]any, code, path string) {
		t.Helper()
		_, failures := call(actorToken, query, variables)
		if len(failures) != 1 || failures[0].Extensions.Code != code || !reflect.DeepEqual(failures[0].Path, []any{path}) {
			t.Fatalf("Graph failures=%+v want %s at %s", failures, code, path)
		}
	}
	snapshot := func() string {
		t.Helper()
		var state string
		if err := f.pool.QueryRow(ctx, `SELECT jsonb_build_object('anchors',(SELECT jsonb_agg(to_jsonb(a) ORDER BY public_id) FROM time_anchors a),'calendar',(SELECT jsonb_agg(to_jsonb(c)) FROM game_calendar c),'map',(SELECT jsonb_agg(to_jsonb(m) ORDER BY real_date) FROM game_time_map m),'receipts',(SELECT jsonb_agg(to_jsonb(i) ORDER BY endpoint,actor_id,key) FROM idempotency_keys i WHERE actor_id=ANY($1::bigint[])))::text`, []int64{admin.rowID, player.rowID}).Scan(&state); err != nil {
			t.Fatal(err)
		}
		return state
	}
	createQuery := `mutation($input:TimeAnchorInput!,$meta:CommandMeta!){createTimeAnchor(input:$input,meta:$meta){id realUtc epochDay rate note}}`
	input := map[string]any{"realUtc": today.Format(time.RFC3339), "epochDay": 0, "rate": 1, "note": note}
	createVars := map[string]any{"input": input, "meta": map[string]string{"idempotencyKey": uuid.NewString()}}
	created := success(token, createQuery, createVars)
	var anchor struct {
		ID       string
		EpochDay int
		Rate     float64
	}
	if err := json.Unmarshal(created["createTimeAnchor"], &anchor); err != nil || anchor.ID == "" || anchor.EpochDay != 0 || anchor.Rate != 1 {
		t.Fatalf("created anchor=%s error=%v", created["createTimeAnchor"], err)
	}
	calendarQuery := `mutation($definition:JSON!,$meta:CommandMeta!){updateGameCalendar(definition:$definition,meta:$meta){definition currentGameDay currentGameDate{eraAbbrev year day} monthGrid{realDate gameDay}}}`
	before := snapshot()
	expectCode(token, calendarQuery, map[string]any{"definition": map[string]any{"months": []map[string]any{{"name": "Month", "days": 30}}}, "meta": map[string]string{"idempotencyKey": uuid.NewString()}}, "INVALID", "updateGameCalendar")
	if snapshot() != before {
		t.Fatal("invalid definition changed Time or receipt state")
	}
	definition := map[string]any{"era": map[string]string{"name": "Time Boundary Era", "abbrev": "TB"}, "periods": []map[string]any{{"name": "River", "type": "month", "days": 30}}, "leap": nil}
	calendar := success(token, calendarQuery, map[string]any{"definition": definition, "meta": map[string]string{"idempotencyKey": uuid.NewString()}})
	type cell struct {
		RealDate string
		GameDay  *int
	}
	var projection struct {
		CurrentGameDay  *int
		CurrentGameDate struct {
			EraAbbrev string
			Year, Day int
		}
		MonthGrid []cell
	}
	if err := json.Unmarshal(calendar["updateGameCalendar"], &projection); err != nil || projection.CurrentGameDay == nil || *projection.CurrentGameDay != 0 || projection.CurrentGameDate.EraAbbrev != "TB" || projection.CurrentGameDate.Year != 1 || projection.CurrentGameDate.Day != 1 || len(projection.MonthGrid) != 30 {
		t.Fatalf("calendar mutation=%s error=%v", calendar["updateGameCalendar"], err)
	}
	for i, cell := range projection.MonthGrid {
		if cell.RealDate != today.AddDate(0, 0, i).Format("2006-01-02") || cell.GameDay == nil || *cell.GameDay != i {
			t.Fatalf("calendar cell %d=%+v", i, cell)
		}
	}
	readQuery := `query($from:Date!,$to:Date!){gameCalendar(realFrom:$from,realTo:$to){currentGameDay currentGameDate{eraAbbrev year day} monthGrid{realDate gameDay}} gameDate(realDate:$from){eraAbbrev year periodName day} realDates(gameDay:0,limit:1,offset:0){total items}}`
	read := success("", readQuery, map[string]any{"from": from, "to": to})
	var date struct {
		EraAbbrev, PeriodName string
		Year, Day             int
	}
	if err := json.Unmarshal(read["gameDate"], &date); err != nil || date.EraAbbrev != "TB" || date.PeriodName != "River" || date.Year != 1 || date.Day != 1 {
		t.Fatalf("g0 read=%s error=%v", read["gameDate"], err)
	}
	var reverse struct {
		Total int
		Items []string
	}
	if err := json.Unmarshal(read["realDates"], &reverse); err != nil || reverse.Total != 1 || !reflect.DeepEqual(reverse.Items, []string{from}) {
		t.Fatalf("g0 reverse=%s error=%v", read["realDates"], err)
	}
	updateQuery := `mutation($id:ID!,$input:TimeAnchorInput!,$meta:CommandMeta!){updateTimeAnchor(id:$id,input:$input,meta:$meta){id epochDay rate}}`
	paused := map[string]any{"realUtc": today.Format(time.RFC3339), "epochDay": -1, "rate": 0, "note": note}
	updateVars := map[string]any{"id": anchor.ID, "input": paused, "meta": map[string]string{"idempotencyKey": uuid.NewString()}}
	success(token, updateQuery, updateVars)
	before = snapshot()
	success(token, updateQuery, updateVars)
	replayed := success(token, createQuery, createVars)
	if snapshot() != before || string(replayed["createTimeAnchor"]) != string(created["createTimeAnchor"]) {
		t.Fatal("original-key replay changed current trajectory or immutable receipt")
	}
	pageQuery := `query($offset:Int!){realDates(gameDay:-1,limit:1,offset:$offset){total items}}`
	for _, page := range []struct {
		offset int
		items  []string
	}{{0, []string{from}}, {29, []string{today.AddDate(0, 0, 29).Format("2006-01-02")}}, {30, []string{}}} {
		data := success("", pageQuery, map[string]any{"offset": page.offset})
		if err := json.Unmarshal(data["realDates"], &reverse); err != nil || reverse.Total != 30 || !reflect.DeepEqual(reverse.Items, page.items) {
			t.Fatalf("paused reverse offset%d=%s error=%v", page.offset, data["realDates"], err)
		}
	}
	negative := success("", `query($date:Date!){gameDate(realDate:$date){eraAbbrev year day}}`, map[string]any{"date": from})
	if err := json.Unmarshal(negative["gameDate"], &date); err != nil || date.Year != 0 || date.Day != 30 {
		t.Fatalf("negative date=%s error=%v", negative["gameDate"], err)
	}
	expectCode(f.token(t, player.publicID, auth.Admin), updateQuery, updateVars, "FORBIDDEN", "updateTimeAnchor")
	f.exec(t, `UPDATE members SET roles=ARRAY['player']::text[] WHERE id=$1`, admin.rowID)
	expectCode(token, updateQuery, updateVars, "FORBIDDEN", "updateTimeAnchor")
	if snapshot() != before {
		t.Fatal("denied player or revoked same-JWT replay changed Time effects")
	}
}
