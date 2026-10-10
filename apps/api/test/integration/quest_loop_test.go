//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/ingest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestQuestCommandJobAndMockDiscord(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	publicID, key := insertOpenQuest(t, pool)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	repo := quest.NewPostgresRepository(dbgen.New(tx))
	if err := repo.RecordDesiredRevision(ctx, publicID); err != nil {
		_ = tx.Rollback(ctx)
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var desired int
	var jobsN int
	if err := pool.QueryRow(ctx, `SELECT discord_desired_revision FROM quests WHERE public_id = $1`, publicID).Scan(&desired); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM background_jobs WHERE job_key = $1`, key).Scan(&jobsN); err != nil {
		t.Fatal(err)
	}
	if desired != 0 || jobsN != 0 {
		t.Fatalf("rollback left desired=%d jobs=%d", desired, jobsN)
	}

	cmd := quest.NewCommands(db.NewRunner(pool, func(tx pgx.Tx) quest.Repository {
		return quest.NewPostgresRepository(dbgen.New(tx))
	}), time.Now)
	actor := auth.Claims{MemberID: seedDM}
	if _, err := cmd.TransitionStatus(ctx, actor, publicID, quest.Played); err != nil {
		t.Fatal(err)
	}
	if err := cmd.SyncDiscord(ctx, actor, publicID); err != nil {
		t.Fatal(err)
	}

	var payload []byte
	err = pool.QueryRow(ctx, `
		SELECT discord_desired_revision,
		       (SELECT count(*) FROM background_jobs WHERE job_key = $2),
		       (SELECT payload FROM background_jobs WHERE job_key = $2)
		FROM quests WHERE public_id = $1`, publicID, key).Scan(&desired, &jobsN, &payload)
	if err != nil {
		t.Fatal(err)
	}
	if desired != 2 || jobsN != 1 {
		t.Fatalf("desired=%d jobs=%d", desired, jobsN)
	}
	var body jobs.QuestDiscordPayload
	if err := json.Unmarshal(payload, &body); err != nil {
		t.Fatal(err)
	}
	if body.DesiredRevision != desired || body.PublicID != publicID || body.ID == 0 {
		t.Fatalf("payload=%+v", body)
	}

	var posted string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		posted = string(raw)
		if r.Header.Get("Authorization") != "Bot tok" {
			t.Errorf("auth=%s", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg-loop-1"}`))
	}))
	t.Cleanup(srv.Close)

	applier := delivery.NewPostgresRevisionApplier(pool.Pool)
	handler := delivery.NewHandler(jobs.NewPostgresStore(pool.Pool), delivery.RESTSync{
		Token:     "tok",
		ChannelID: "chan",
		HTTP:      &http.Client{Transport: rewriteTo{to: srv.URL}},
		APIBase:   srv.URL,
		Apply:     applier,
		Messages:  applier,
	}).WithReconciler(delivery.NewPostgresReconciler(pool.Pool, jobs.NewEnqueuer(jobs.NewPostgresStore(pool.Pool))))
	ok, err := handler.ProcessOne(ctx)
	if err != nil || !ok {
		t.Fatalf("process ok=%v err=%v", ok, err)
	}
	var applied int
	if err := pool.QueryRow(ctx, `SELECT discord_applied_revision FROM quests WHERE public_id = $1`, publicID).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied < desired {
		t.Fatalf("applied=%d desired=%d posted=%s", applied, desired, posted)
	}
	if posted == "" {
		t.Fatal("discord mock received no body")
	}

	before := 0
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM bot_heartbeats`).Scan(&before)
	store := ingest.NewPostgresStore(pool.Pool)
	eventID := "loop-" + publicID
	if err := store.SaveEvent(ctx, ingest.Event{
		EventID: eventID, Kind: "message", DiscordUserID: "user", ChannelID: "chan",
		OccurredAt: time.Now(), Amount: 1,
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveHeartbeat(ctx, json.RawMessage(`{"ok":true}`)); err != nil {
		t.Fatal(err)
	}
	var events, beats int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM discord_activity_events WHERE event_id = $1`, eventID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM bot_heartbeats`).Scan(&beats); err != nil {
		t.Fatal(err)
	}
	if events != 1 || beats < before+1 {
		t.Fatalf("events=%d heartbeats=%d before=%d", events, beats, before)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM discord_activity_events WHERE event_id = $1`, eventID)
	})
}

func insertOpenQuest(t *testing.T, pool *db.Pool) (string, string) {
	t.Helper()
	publicID := "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
	short := "loop-" + publicID[:8]
	var id string
	err := pool.QueryRow(context.Background(), `
		INSERT INTO quests (public_id, short_code, kinds, dm_id, scheduled_at, document_id, created_by)
		SELECT $1::uuid, $2, ARRAY['standard'], m.id, now() - interval '1 day', d.id, m.id
		FROM members m, documents d
		WHERE m.public_id = $3 AND d.public_id = $4
		ON CONFLICT (public_id) DO UPDATE SET status = 'open', scheduled_at = now() - interval '1 day',
			discord_desired_revision = 0, discord_applied_revision = 0, discord_message_id = NULL,
			filled_count = 0, slots_max = 5
		RETURNING public_id::text`,
		publicID, short, seedDM, seedDoc,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert quest (seed required): %v", err)
	}
	key := jobs.QuestDiscordKey(publicID)
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM background_jobs WHERE job_key = $1`, key)
		_, _ = pool.Exec(ctx, `DELETE FROM quests WHERE public_id = $1`, publicID)
	})
	_, _ = pool.Exec(context.Background(), `DELETE FROM background_jobs WHERE job_key = $1`, key)
	return publicID, key
}

func integrationPool(t *testing.T) *db.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

type rewriteTo struct{ to string }

func (t rewriteTo) RoundTrip(req *http.Request) (*http.Response, error) {
	dest, err := url.Parse(t.to)
	if err != nil {
		return nil, err
	}
	req.URL.Scheme = dest.Scheme
	req.URL.Host = dest.Host
	return http.DefaultTransport.RoundTrip(req)
}
