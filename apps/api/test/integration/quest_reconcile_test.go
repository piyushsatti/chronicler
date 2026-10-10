//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestReconcileAfterRunningBurst(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	publicID, key := insertOpenQuest(t, pool)

	cmd := quest.NewCommands(db.NewRunner(pool, func(tx pgx.Tx) quest.Repository {
		return quest.NewPostgresRepository(dbgen.New(tx))
	}), time.Now)
	actor := auth.Claims{MemberID: seedDM}
	if err := cmd.SyncDiscord(ctx, actor, publicID); err != nil {
		t.Fatal(err)
	}

	store := jobs.NewPostgresStore(pool.Pool)
	claimed, err := store.ClaimOne(ctx, delivery.LaneDiscord)
	if err != nil || claimed.ID == "" {
		t.Fatalf("claim: %+v err=%v", claimed, err)
	}
	if claimed.State != jobs.Running {
		t.Fatalf("state=%s", claimed.State)
	}

	// Burst while the first job is running — coalesce must not overwrite.
	if err := cmd.SyncDiscord(ctx, actor, publicID); err != nil {
		t.Fatal(err)
	}
	var state string
	var desired int
	if err := pool.QueryRow(ctx, `
		SELECT state, (SELECT discord_desired_revision FROM quests WHERE public_id = $2)
		FROM background_jobs WHERE job_key = $1`, key, publicID).Scan(&state, &desired); err != nil {
		t.Fatal(err)
	}
	if state != "running" || desired != 2 {
		t.Fatalf("during burst state=%s desired=%d", state, desired)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"msg-reconcile"}`))
	}))
	t.Cleanup(srv.Close)

	applier := delivery.NewPostgresRevisionApplier(pool.Pool)
	// Finish the claimed job via Succeed after sync, then reconcile — mirrors ProcessOne.
	sync := delivery.RESTSync{
		Token: "tok", ChannelID: "chan",
		HTTP: srv.Client(), APIBase: srv.URL,
		Apply: applier, Messages: applier,
	}
	var payload jobs.QuestDiscordPayload
	if err := json.Unmarshal(claimed.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if err := sync.SyncQuest(ctx, payload.PublicID, payload.DesiredRevision); err != nil {
		t.Fatal(err)
	}
	if err := store.Succeed(ctx, claimed.ID); err != nil {
		t.Fatal(err)
	}
	reconciler := delivery.NewPostgresReconciler(pool.Pool, jobs.NewEnqueuer(store))
	if err := reconciler.Reconcile(ctx, publicID); err != nil {
		t.Fatal(err)
	}

	var jobsN int
	var nextPayload []byte
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM background_jobs WHERE job_key = $1 AND state = 'queued'`, key).Scan(&jobsN); err != nil {
		t.Fatal(err)
	}
	if jobsN != 1 {
		t.Fatalf("want one queued follow-up, got %d", jobsN)
	}
	if err := pool.QueryRow(ctx, `
		SELECT payload FROM background_jobs WHERE job_key = $1 AND state = 'queued'`, key).Scan(&nextPayload); err != nil {
		t.Fatal(err)
	}
	var body jobs.QuestDiscordPayload
	if err := json.Unmarshal(nextPayload, &body); err != nil {
		t.Fatal(err)
	}
	if body.DesiredRevision != 2 {
		t.Fatalf("follow-up payload revision=%d want 2", body.DesiredRevision)
	}
}
