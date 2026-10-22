//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	gqlserver "github.com/piyushsatti/chronicler/apps/api/internal/platform/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func questProductQueries(t *testing.T, pool *db.Pool) *quest.ProductQueries {
	t.Helper()
	policy, err := auth.NewPoolPolicy(pool)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	questPG, err := quest.NewProductPostgres(pool)
	if err != nil {
		t.Fatal(err)
	}
	docPG, err := document.NewProductPostgres(pool)
	if err != nil {
		t.Fatal(err)
	}
	queries, err := quest.NewProductQueries(quest.ProductReadRepos{
		Quest: questPG, Arc: questPG, Batch: questPG, DocumentAudience: docPG, RewardCoverage: questPG,
	}, policy, time.Now, observer)
	if err != nil {
		t.Fatal(err)
	}
	return queries
}

type questReadCase struct {
	status, display string
	delta           time.Duration
	duration        float64
	filled          int
}
type questReadFixture struct {
	pool       *db.Pool
	ids, codes []string
	doc        string
	now        time.Time
}

func newQuestReadFixture(t *testing.T, pool *db.Pool, now time.Time, cases []questReadCase) *questReadFixture {
	t.Helper()
	ctx := context.Background()
	f := &questReadFixture{pool: pool, now: now, doc: uuid.NewString()}
	_, err := pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id) SELECT $1,'quest_brief',$2,'Quest read brief','published','public',$3,id FROM members WHERE public_id=$4`, f.doc, "quest-read-"+f.doc, "public brief\n\n> [!dm]\n> private brief marker\n", seedDM)
	if err != nil {
		t.Fatal(err)
	}
	f.ids = make([]string, len(cases))
	f.codes = make([]string, len(cases))
	// A shared random prefix avoids clashes; numeric UUID suffix gives known public order.
	prefix := uuid.NewString()[:24]
	for i := range cases {
		f.ids[i] = fmt.Sprintf("%s%012x", prefix, i+1)
		f.codes[i] = fmt.Sprintf("qr-%s-%d", f.doc[:8], i+1)
	}
	t.Cleanup(func() {
		for _, id := range f.ids {
			if _, err := pool.Exec(ctx, `DELETE FROM quests WHERE public_id=$1`, id); err != nil {
				t.Errorf("cleanup quest: %v", err)
			}
		}
		if _, err := pool.Exec(ctx, `DELETE FROM documents WHERE public_id=$1`, f.doc); err != nil {
			t.Errorf("cleanup document: %v", err)
		}
	})
	// Reverse insertion intentionally makes internal bigint order oppose public UUID order.
	for i := len(cases) - 1; i >= 0; i-- {
		c := cases[i]
		_, err := pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,duration_hours,filled_count,slots_max,document_id,created_by,discord_desired_revision,discord_applied_revision,closed_at) SELECT $1,$2,ARRAY['standard'],$3,m.id,$4,$5,$6,5,d.id,m.id,8,3,CASE WHEN $3='closed' THEN $9::timestamptz ELSE NULL END FROM members m,documents d WHERE m.public_id=$7 AND d.public_id=$8`, f.ids[i], f.codes[i], c.status, now.Add(c.delta), c.duration, c.filled, seedDM, f.doc, now)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("fixture clock=%s document=%s publicIDs=%v codes=%v cases=%+v (cleanup removes only these rows)", now.Format(time.RFC3339Nano), f.doc, f.ids, f.codes, cases)
	return f
}
func questReadString(s string) *string { return &s }
func questReadIDs(f *questReadFixture, indices ...int) []string {
	out := make([]string, 0, len(indices))
	for _, i := range indices {
		out = append(out, f.ids[i-1])
	}
	return out
}
func questReadSnapshot(t *testing.T, pool *db.Pool) string {
	t.Helper()
	var out string
	err := pool.QueryRow(context.Background(), `SELECT jsonb_build_object('quests',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM quests q),'documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM documents d),'participants',(SELECT jsonb_agg(to_jsonb(p) ORDER BY quest_id,member_id,character_id) FROM quest_participants p),'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM background_jobs j),'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM notifications n))::text`).Scan(&out)
	if err != nil {
		t.Fatal(err)
	}
	return out
}
func TestQuestReadsNativeProjection(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var now time.Time
	if err := tx.QueryRow(ctx, `SELECT now()`).Scan(&now); err != nil {
		t.Fatal(err)
	}
	// Cases translate the frozen independent oracle to this transaction's clock.
	cases := []questReadCase{
		{"open", "open", time.Hour, 2, 0}, {"open", "filling", time.Hour, 2, 1},
		{"open", "live", 0, 2, 0}, {"open", "filling", -2 * time.Hour, 2, 1},
		{"open", "open", -2 * time.Hour, 2, 0}, {"full", "scheduled", time.Microsecond, 2, 5},
		{"full", "live", 0, 2, 5}, {"full", "live", -90*time.Minute + time.Microsecond, 1.5, 5},
		{"full", "full", -2 * time.Hour, 2, 5}, {"played", "played", -time.Hour, 2, 5},
		{"closed", "closed", -time.Hour, 2, 5}, {"cancelled", "cancelled", -time.Hour, 2, 5},
		{"closed", "closed", 2 * time.Hour, 2, 0},
	}
	f := newQuestReadFixture(t, pool, now, cases)
	before := questReadSnapshot(t, pool)
	t.Logf("persistent state before reads sha256=%x", sha256.Sum256([]byte(before)))
	read := quest.NewReadModel(dbgen.New(tx))
	from, to := now.Add(-24*time.Hour), now.Add(24*time.Hour)
	base := quest.ListFilter{ScheduledFrom: &from, ScheduledTo: &to, Limit: 100}
	all := []int{4, 5, 9, 8, 10, 11, 12, 3, 7, 6, 1, 2, 13}
	tests := []struct {
		name   string
		change func(*quest.ListFilter)
		want   []int
		total  int64
	}{
		{"all stable UUID order", func(*quest.ListFilter) {}, all, 13},
		{"machine open includes live", func(f *quest.ListFilter) { f.Status = questReadString("OPEN") }, []int{4, 5, 3, 1, 2}, 5},
		{"machine full", func(f *quest.ListFilter) { f.Status = questReadString("full") }, []int{9, 8, 7, 6}, 4},
		{"machine played", func(f *quest.ListFilter) { f.Status = questReadString("played") }, []int{10}, 1},
		{"machine closed", func(f *quest.ListFilter) { f.Status = questReadString("closed") }, []int{11, 13}, 2},
		{"machine cancelled", func(f *quest.ListFilter) { f.Status = questReadString("cancelled") }, []int{12}, 1},
		{"live both machine states", func(f *quest.ListFilter) { f.DisplayStatus = questReadString("LIVE") }, []int{8, 3, 7}, 3},
		{"display overrides machine", func(f *quest.ListFilter) {
			f.Status = questReadString("closed")
			f.DisplayStatus = questReadString("live")
		}, []int{8, 3, 7}, 3},
		{"scheduled", func(f *quest.ListFilter) { f.DisplayStatus = questReadString("scheduled") }, []int{6}, 1},
		{"filling", func(f *quest.ListFilter) { f.DisplayStatus = questReadString("filling") }, []int{4, 2}, 2},
		{"display open", func(f *quest.ListFilter) { f.DisplayStatus = questReadString("open") }, []int{5, 1}, 2},
		{"invalid machine before live", func(f *quest.ListFilter) {
			f.Status = questReadString("unknown")
			f.DisplayStatus = questReadString("live")
		}, nil, 0},
		{"empty machine before live", func(f *quest.ListFilter) { f.Status = questReadString(""); f.DisplayStatus = questReadString("live") }, nil, 0},
		{"empty display", func(f *quest.ListFilter) { f.DisplayStatus = questReadString("") }, nil, 0},
		{"unknown display", func(f *quest.ListFilter) { f.DisplayStatus = questReadString("future-label") }, nil, 0},
		{"no whitespace trim", func(f *quest.ListFilter) { f.Status = questReadString(" open ") }, nil, 0},
		{"inclusive and timezone equivalent", func(f *quest.ListFilter) {
			low := now.In(time.FixedZone("offset", -4*3600))
			high := now.Add(time.Hour)
			f.ScheduledFrom = &low
			f.ScheduledTo = &high
		}, []int{3, 7, 6, 1, 2}, 5},
		{"lower only", func(f *quest.ListFilter) { f.ScheduledFrom = &now; f.ScheduledTo = nil }, []int{3, 7, 6, 1, 2, 13}, 6},
		{"upper only", func(f *quest.ListFilter) { f.ScheduledFrom = nil; f.ScheduledTo = &now }, []int{4, 5, 9, 8, 10, 11, 12, 3, 7}, 9},
		{"absent bounds", func(f *quest.ListFilter) { f.ScheduledFrom = nil; f.ScheduledTo = nil }, all, 13},
		{"reversed bounds", func(f *quest.ListFilter) { f.ScheduledFrom = &to; f.ScheduledTo = &from }, nil, 0},
		{"display composes window", func(f *quest.ListFilter) { f.DisplayStatus = questReadString("live"); f.ScheduledFrom = &now }, []int{3, 7}, 2},
		{"machine composes window", func(f *quest.ListFilter) { f.Status = questReadString("open"); f.ScheduledFrom = &now }, []int{3, 1, 2}, 3},
		{"page", func(f *quest.ListFilter) { f.Limit = 3; f.Offset = 2 }, []int{9, 8, 10}, 13},
		{"zero page keeps total", func(f *quest.ListFilter) { f.Limit = 0 }, nil, 13},
		{"past end keeps total", func(f *quest.ListFilter) { f.Offset = 99 }, nil, 13},
		{"newest internal mode", func(f *quest.ListFilter) { f.Order = quest.NewestFirst; f.Limit = 4 }, []int{13, 2, 1, 6}, 13},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			filter := base
			tc.change(&filter)
			rows, total, err := read.List(ctx, filter)
			if err != nil {
				t.Fatal(err)
			}
			ids := make([]string, 0, len(rows))
			for _, row := range rows {
				ids = append(ids, row.ID)
			}
			want := questReadIDs(f, tc.want...)
			if rows == nil || total != tc.total || !reflect.DeepEqual(ids, want) {
				t.Fatalf("ids=%v total=%d want=%v total=%d", ids, total, want, tc.total)
			}
		})
	}
	for i, c := range cases {
		t.Run(fmt.Sprintf("detail projection %d", i+1), func(t *testing.T) {
			a, err := read.ByID(ctx, f.ids[i])
			if err != nil {
				t.Fatal(err)
			}
			b, err := read.ByShortCode(ctx, f.codes[i])
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(a, b) || a.DisplayStatus != c.display || a.DurationHours != c.duration || string(a.Status) != c.status || a.DocumentID != f.doc || a.DiscordDesiredRevision != 8 || a.DiscordAppliedRevision != 3 {
				t.Fatalf("id=%+v code=%+v expected=%+v", a, b, c)
			}
		})
	}
	// Native reads executed under READ ONLY; compare all affected state, not only count.
	after := questReadSnapshot(t, pool)
	t.Logf("persistent state after reads sha256=%x", sha256.Sum256([]byte(after)))
	if after != before {
		t.Fatal("quest reads changed persistent state")
	}
	var plan string
	if err := tx.QueryRow(ctx, `EXPLAIN (FORMAT JSON) SELECT q.public_id,v.display_status FROM quests q JOIN quest_display_status v ON v.id=q.id WHERE v.display_status='live' ORDER BY q.scheduled_at,q.public_id LIMIT 10`).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	t.Logf("bounded projection EXPLAIN, no scale claim: %s", plan)
}

type questReadWireItem struct {
	ID, ShortCode, Status, DisplayStatus string
	DurationHours                        float64
	BriefDocument                        *struct{ ID, EffectiveBody string }
}
type questReadWirePage struct {
	Items []questReadWireItem
	Total int
}
type questReadResponse struct {
	Data   map[string]json.RawMessage
	Errors []struct {
		Message    string
		Extensions struct{ Code string }
	}
}

func questReadRequest(t *testing.T, handler http.Handler, query string, expectedStatus ...int) questReadResponse {
	t.Helper()
	raw, _ := json.Marshal(map[string]string{"query": query})
	r := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewReader(raw))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	var out questReadResponse
	wantStatus := http.StatusOK
	if len(expectedStatus) > 0 {
		wantStatus = expectedStatus[0]
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || w.Code != wantStatus {
		t.Fatalf("status=%d body=%s error=%v", w.Code, w.Body, err)
	}
	return out
}
func questReadPage(t *testing.T, response questReadResponse, key string) questReadWirePage {
	t.Helper()
	var out questReadWirePage
	if len(response.Errors) > 0 {
		t.Fatalf("graphql errors=%+v", response.Errors)
	}
	if err := json.Unmarshal(response.Data[key], &out); err != nil {
		t.Fatal(err)
	}
	return out
}
func TestQuestReadsNativeHTTP(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	var now time.Time
	if err := pool.QueryRow(ctx, `SELECT now()`).Scan(&now); err != nil {
		t.Fatal(err)
	}
	cases := []questReadCase{{"open", "filling", time.Hour, 1.5, 1}, {"full", "scheduled", time.Hour, 2.5, 5}, {"open", "live", -time.Hour, 1.5, 0}, {"full", "live", -time.Hour, 1.5, 5}, {"closed", "closed", -2 * time.Hour, 2, 0}, {"closed", "closed", 2 * time.Hour, 2, 0}}
	f := newQuestReadFixture(t, pool, now, cases)
	before := questReadSnapshot(t, pool)
	t.Logf("persistent state before reads sha256=%x", sha256.Sum256([]byte(before)))
	runtime := app.Wire(ctx, config.Config{DatabaseURL: pool.Pool.Config().ConnString(), RequireDatabase: true, JWTSecret: "synthetic-quest-read-fixture-key"})
	t.Cleanup(runtime.Pool.Close)
	handler := gqlserver.NewHandler(runtime.Resolver, gqlserver.Limits{}, runtime.Authority)
	fields := "{items{id shortCode status displayStatus durationHours} total}"
	response := questReadRequest(t, handler, `{all:quests(filters:{},limit:100)`+fields+` open:quests(filters:{status:"open"},limit:100)`+fields+` scheduled:quests(filters:{displayStatus:"scheduled"},limit:100)`+fields+` live:quests(filters:{displayStatus:"live"},limit:100)`+fields+` past:quests(offset:100)`+fields+` board:questBoard(limit:100)`+fields+` recent:recentlyClosedQuests(limit:100)`+fields+`}`)
	for _, tc := range []struct {
		key   string
		want  []int
		total int
	}{{"all", []int{5, 3, 4, 1, 2, 6}, 6}, {"open", []int{3, 1}, 2}, {"scheduled", []int{2}, 1}, {"live", []int{3, 4}, 2}, {"past", nil, 6}, {"board", []int{1, 2}, 2}, {"recent", []int{6, 5}, 2}} {
		t.Run("HTTP "+tc.key, func(t *testing.T) {
			page := questReadPage(t, response, tc.key)
			ids := []string{}
			for _, row := range page.Items {
				ids = append(ids, row.ID)
				for i, id := range f.ids {
					if row.ID == id && (row.Status != cases[i].status || row.DisplayStatus != cases[i].display || row.DurationHours != cases[i].duration) {
						t.Fatalf("wrong wire row %+v", row)
					}
				}
			}
			if page.Items == nil || page.Total != tc.total || !reflect.DeepEqual(ids, questReadIDs(f, tc.want...)) {
				t.Fatalf("page=%+v want=%v total=%d", page, tc.want, tc.total)
			}
		})
	}
	invalid := questReadRequest(t, handler, `{quests(limit:0){total items{id}}}`)
	if len(invalid.Errors) != 1 || invalid.Errors[0].Extensions.Code != "INVALID" {
		t.Fatalf("nonpositive Product page should fail: %+v", invalid.Errors)
	}
	window := fmt.Sprintf(`{quests(filters:{scheduledFrom:%q,scheduledTo:%q},limit:100)%s}`, now.Add(time.Hour).In(time.FixedZone("offset", -4*3600)).Format(time.RFC3339Nano), now.Add(time.Hour+time.Microsecond).Format(time.RFC3339Nano), fields)
	page := questReadPage(t, questReadRequest(t, handler, window), "quests")
	if page.Total != 2 || len(page.Items) != 2 || page.Items[0].ID != f.ids[0] || page.Items[1].ID != f.ids[1] {
		t.Fatalf("half-open window=%+v", page)
	}
	for _, delta := range []time.Duration{0, -time.Hour} {
		t.Run(fmt.Sprintf("invalid scheduled range %s", delta), func(t *testing.T) {
			query := fmt.Sprintf(`{quests(filters:{scheduledFrom:%q,scheduledTo:%q},limit:100){total items{id}}}`, now.Format(time.RFC3339Nano), now.Add(delta).Format(time.RFC3339Nano))
			got := questReadRequest(t, handler, query)
			if len(got.Errors) != 1 || got.Errors[0].Extensions.Code != "INVALID" {
				t.Fatalf("accepted behavior31 rejects from>=to, got=%+v", got)
			}
		})
	}
	detail := questReadRequest(t, handler, fmt.Sprintf(`{byId:quest(id:%q){id status displayStatus durationHours briefDocument{id effectiveBody}} byCode:quest(shortCode:%q){id status displayStatus durationHours}}`, f.ids[0], f.codes[0]))
	if len(detail.Errors) > 0 {
		t.Fatalf("detail errors=%+v", detail.Errors)
	}
	var byID, byCode questReadWireItem
	if err := json.Unmarshal(detail.Data["byId"], &byID); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(detail.Data["byCode"], &byCode); err != nil {
		t.Fatal(err)
	}
	if byID.ID != byCode.ID || byID.DisplayStatus != "filling" || byCode.DisplayStatus != "filling" || byID.DurationHours != 1.5 || byCode.DurationHours != 1.5 || byID.BriefDocument == nil || !strings.Contains(byID.BriefDocument.EffectiveBody, "public brief") || strings.Contains(byID.BriefDocument.EffectiveBody, "private brief marker") {
		t.Fatalf("detail/body projection=%+v %+v", byID, byCode)
	}
	after := questReadSnapshot(t, pool)
	t.Logf("persistent state after HTTP reads sha256=%x", sha256.Sum256([]byte(after)))
	if after != before {
		t.Fatal("HTTP reads wrote state")
	}
	// A public quest grants no access to a brief denied by its explicit policy.
	if _, err := pool.Exec(ctx, `UPDATE documents SET policy='[]'::jsonb WHERE public_id=$1`, f.doc); err != nil {
		t.Fatal(err)
	}
	denied := questReadRequest(t, handler, fmt.Sprintf(`{quest(id:%q){id briefDocument{id effectiveBody}}}`, f.ids[0]))
	if len(denied.Errors) != 0 {
		t.Fatalf("denied=%+v", denied)
	}
	if err := json.Unmarshal(denied.Data["quest"], &byID); err != nil {
		t.Fatal(err)
	}
	if byID.ID != f.ids[0] || byID.BriefDocument != nil {
		t.Fatalf("public quest/denied brief=%+v", byID)
	}
	empty := questReadPage(t, questReadRequest(t, handler, `{quests(filters:{displayStatus:"unknown"})`+fields+`}`), "quests")
	if empty.Items == nil || len(empty.Items) != 0 || empty.Total != 0 {
		t.Fatalf("empty=%+v", empty)
	}
	for _, malformed := range []struct {
		query  string
		status int
	}{{`{quests(filters:{status:7}){total}}`, http.StatusUnprocessableEntity}, {`{quests(filters:{scheduledFrom:"tomorrow"}){total}}`, http.StatusOK}} {
		out := questReadRequest(t, handler, malformed.query, malformed.status)
		if len(out.Errors) == 0 {
			t.Fatalf("malformed scalar accepted: %s", malformed.query)
		}
	}
	// A failed real PostgreSQL repository must be opaque, not empty-success.
	runtime.Pool.Close()
	failure := questReadRequest(t, handler, `{quests(limit:1){total items{id}}}`)
	if len(failure.Errors) != 1 || failure.Errors[0].Message != "Internal error" || failure.Errors[0].Extensions.Code != "INTERNAL" {
		t.Fatalf("repository failure=%+v", failure)
	}
	missing := questReadRequest(t, gqlserver.NewHandler(&graph.Resolver{}, gqlserver.Limits{}, nil), `{quests{total items{id}}}`)
	if len(missing.Errors) != 1 || missing.Errors[0].Message != "Internal error" || missing.Errors[0].Extensions.Code != "INTERNAL" {
		t.Fatalf("unconfigured=%+v", missing)
	}
}
