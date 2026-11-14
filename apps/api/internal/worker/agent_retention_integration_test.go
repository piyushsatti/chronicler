//go:build integration

package worker_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

func TestHourlyMaintenancePrunesFinishedAgentQuestions(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	at := time.Now().UTC().Truncate(time.Second)
	old := at.Add(-31 * 24 * time.Hour)
	recent := at.Add(-29 * 24 * time.Hour)

	insertAgent := func(publicID, state string, updated time.Time) {
		t.Helper()
		var jobID int64
		if err := f.Pool.QueryRow(ctx, `
INSERT INTO background_jobs(public_id,job_key,kind,lane,state,payload,question_deadline_at,updated_at,completion_operation,completion_payload)
VALUES($1::uuid,'agent:'||$1::text,'agent_question','agent',$2,'{"version":1,"type":"question.requested"}'::jsonb,$3,$3,
 CASE WHEN $2 IN ('succeeded','dead','repair_required','cancelled') THEN 'succeed' ELSE NULL END,
 CASE WHEN $2 IN ('succeeded','dead','repair_required','cancelled') THEN '{}'::jsonb ELSE NULL END)
RETURNING id`, publicID, state, updated).Scan(&jobID); err != nil {
			t.Fatal(err)
		}
		if _, err := f.Pool.Exec(ctx, `INSERT INTO agent_questions(job_id,question,history) VALUES($1,'q','[]'::jsonb)`, jobID); err != nil {
			t.Fatal(err)
		}
	}
	insertJob := func(key, kind, lane, state string, updated time.Time, completion []byte) {
		t.Helper()
		op := interface{}(nil)
		payload := interface{}(nil)
		if completion != nil {
			op = "succeed"
			payload = completion
		}
		if _, err := f.Pool.Exec(ctx, `
INSERT INTO background_jobs(job_key,kind,lane,state,payload,updated_at,completion_operation,completion_payload)
VALUES($1,$2,$3,$4,'{}'::jsonb,$5,$6,$7)`, key, kind, lane, state, updated, op, payload); err != nil {
			t.Fatal(err)
		}
	}

	prunedIDs := map[string]string{}
	for _, state := range []string{"succeeded", "dead", "repair_required", "cancelled"} {
		id := uuid.NewString()
		prunedIDs[state] = id
		insertAgent(id, state, old)
	}
	keptRecent := uuid.NewString()
	insertAgent(keptRecent, "succeeded", recent)
	keptQueued := uuid.NewString()
	insertAgent(keptQueued, "queued", old)
	keptRunning := uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `
INSERT INTO background_jobs(public_id,job_key,kind,lane,state,payload,question_deadline_at,updated_at,lease_expires_at,claimed_at,attempt_deadline_at)
VALUES($1::uuid,'agent:'||$1::text,'agent_question','agent','running','{}'::jsonb,$2,$2,$2,$2,$2)`, keptRunning, old); err != nil {
		t.Fatal(err)
	}
	var runningJobID int64
	if err := f.Pool.QueryRow(ctx, `SELECT id FROM background_jobs WHERE public_id=$1`, keptRunning).Scan(&runningJobID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO agent_questions(job_id,question) VALUES($1,'q')`, runningJobID); err != nil {
		t.Fatal(err)
	}

	insertJob("roster:"+uuid.NewString(), "quest_player_list", "discord", "succeeded", old, []byte(`{"message_id":"m1"}`))
	insertJob("delivery:"+uuid.NewString(), "quest_discord_delivery", "discord", "succeeded", old, []byte(`{"message_id":"m2"}`))
	insertJob("maintenance:gametime_fill:"+old.UTC().Format("2006-01-02"), "gametime_fill", "maintenance", "succeeded", old, []byte(`{}`))
	insertJob("maintenance:reconcile_dry_run:"+old.UTC().Format("2006-01-02"), "reconcile_dry_run", "maintenance", "succeeded", old, []byte(`{}`))
	insertJob("delivery-dead:"+uuid.NewString(), "quest_discord_delivery", "discord", "dead", old, []byte(`{}`))
	insertJob("delivery-repair:"+uuid.NewString(), "quest_discord_delivery", "discord", "repair_required", old, []byte(`{}`))

	store := jobs.NewPostgresStore(f.Pool.Pool)
	worker.RunScheduled(ctx, f.Pool.Pool, store)

	for state, id := range prunedIDs {
		var n int
		if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM background_jobs WHERE public_id=$1`, id).Scan(&n); err != nil || n != 0 {
			t.Fatalf("finished %s job retained: count=%d err=%v", state, n, err)
		}
		if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM agent_questions aq JOIN background_jobs b ON b.id=aq.job_id WHERE b.public_id=$1`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("finished %s question retained", state)
		}
	}
	for _, id := range []string{keptRecent, keptQueued, keptRunning} {
		var n int
		if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM background_jobs b JOIN agent_questions aq ON aq.job_id=b.id WHERE b.public_id=$1`, id).Scan(&n); err != nil || n != 1 {
			t.Fatalf("kept agent job missing id=%s count=%d err=%v", id, n, err)
		}
	}
	var keptNonAgent int
	if err := f.Pool.QueryRow(ctx, `
SELECT count(*) FROM background_jobs
WHERE kind IN ('quest_player_list','quest_discord_delivery','gametime_fill','reconcile_dry_run')
  AND updated_at=$1`, old).Scan(&keptNonAgent); err != nil || keptNonAgent != 6 {
		t.Fatalf("non-agent jobs retained=%d err=%v", keptNonAgent, err)
	}

	agentStore := agent.NewPostgresStore(f.Pool.Pool)
	prunedID := prunedIDs["succeeded"]
	if _, _, ok, err := agentStore.Get(ctx, prunedID); err != nil || ok {
		t.Fatalf("Get after prune: ok=%v err=%v", ok, err)
	}
	if err := agentStore.Create(ctx, agent.QuestionRequested{
		Version: 1, Type: "question.requested", JobID: prunedID, Question: "again",
	}); err != nil {
		t.Fatal(err)
	}
	if _, _, ok, err := agentStore.Get(ctx, prunedID); err != nil || !ok {
		t.Fatalf("Get after recreate: ok=%v err=%v", ok, err)
	}
}
