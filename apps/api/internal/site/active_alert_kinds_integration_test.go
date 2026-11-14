//go:build integration

package site

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestActiveAlertsExcludeQuestionFailuresAndKeepActionableJobs(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO bot_heartbeats(payload,received_at) VALUES('{"gateway_ready":true}',clock_timestamp())`); err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{}
	for _, kind := range []struct{ name, lane string }{
		{"agent_question", "agent"},
		{"quest_discord_delivery", "discord"},
		{"gametime_fill", "maintenance"},
	} {
		for _, state := range []string{"dead", "repair_required"} {
			var id string
			if err := f.Pool.QueryRow(ctx, `INSERT INTO background_jobs(job_key,kind,lane,state,question_deadline_at)
				VALUES($1,$2,$3,$4,CASE WHEN $2::text='agent_question' THEN clock_timestamp() END)
				RETURNING public_id::text`, kind.name+":"+state, kind.name, kind.lane, state).Scan(&id); err != nil {
				t.Fatal(err)
			}
			if kind.name != "agent_question" {
				want["job:"+id+":state:"+state] = true
			}
		}
	}
	queries := dbgen.New(f.Pool)
	count, err := queries.SiteActiveAlertCount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if count != 4 {
		t.Fatalf("active alert count=%d, want four delivery/maintenance failures", count)
	}
	rows, err := queries.SiteActiveAlerts(ctx, dbgen.SiteActiveAlertsParams{PageLimit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != int(count) {
		t.Fatalf("active alert rows=%+v, count=%d", rows, count)
	}
	for _, row := range rows {
		if row.Total != count || !row.Key.Valid || !want[row.Key.String] {
			t.Fatalf("unexpected active alert=%+v, want delivery/maintenance failures only", row)
		}
		delete(want, row.Key.String)
	}
	if len(want) != 0 {
		t.Fatalf("active alerts omitted actionable jobs=%v", want)
	}
}
