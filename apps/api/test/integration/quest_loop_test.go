//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/ingest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
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

	const (
		guild   = "111111111111111111"
		channel = "222222222222222222"
		role    = "333333333333333333"
		voice   = "444444444444444444"
	)
	for key, payload := range map[string]string{
		delivery.SettingAnnounceChannel: `{"channelId":"` + channel + `"}`,
		delivery.SettingQuestRole:       `{"enabled":true,"roleId":"` + role + `"}`,
		delivery.SettingVoiceChannels:   `{"channels":[{"name":"Table 1","channelId":"` + voice + `"}]}`,
		delivery.SettingPublicOrigin:    `{"origin":"https://chronicler.example/"}`,
	} {
		if _, err := pool.Exec(ctx, `INSERT INTO site_settings (key, payload) VALUES ($1, $2::jsonb)
			ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload`, key, payload); err != nil {
			t.Fatal(err)
		}
		k := key
		t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM site_settings WHERE key = $1`, k) })
	}
	if _, err := pool.Exec(ctx, `UPDATE quests SET discord_voice_channel_id = $2, scheduled_at = now() + interval '2 days',
		discord_thread_id = NULL, discord_event_id = NULL, event_url = NULL WHERE public_id = $1`, publicID, voice); err != nil {
		t.Fatal(err)
	}

	// The post carries the brief as an ordinary member sees it: DM-only blocks are cut.
	if _, err := pool.Exec(ctx, `UPDATE documents SET status='published', visibility='public', policy=NULL,
		body=E'Public intro.\n\n> [!dm] The abbot is the lich.\n\n> [!dm:@someone] For one player only.\n\nPublic outro.'
		WHERE public_id = $1`, seedDoc); err != nil {
		t.Fatal(err)
	}

	var calls []string
	var posted string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		calls = append(calls, r.Method+" "+r.URL.Path)
		if r.Method == http.MethodPost && r.URL.Path == "/channels/"+channel+"/messages" {
			posted = string(raw)
		}
		if r.Header.Get("Authorization") != "Bot tok" {
			t.Errorf("auth=%s", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/guilds/"+guild+"/scheduled-events":
			_, _ = w.Write([]byte(`{"id":"555555555555555555"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/channels/"+channel+"/messages":
			_, _ = w.Write([]byte(`{"id":"msg-loop-1"}`))
		case r.Method == http.MethodPost:
			_, _ = w.Write([]byte(`{"id":"thread-loop-1"}`))
		default:
			_, _ = w.Write([]byte(`{"id":"msg-loop-1"}`))
		}
	}))
	t.Cleanup(srv.Close)

	applier := delivery.NewPostgresRevisionApplier(pool.Pool)
	handler := delivery.NewHandler(jobs.NewPostgresStore(pool.Pool), delivery.RESTSync{
		Token:    "tok",
		GuildID:  guild,
		Settings: applier,
		Quests:   applier,
		HTTP:     &http.Client{Transport: rewriteTo{to: srv.URL}},
		APIBase:  srv.URL,
		Apply:    applier,
	}).WithReconciler(delivery.NewPostgresReconciler(pool.Pool, jobs.NewEnqueuer(jobs.NewPostgresStore(pool.Pool))))
	ok, err := handler.ProcessOne(ctx)
	if err != nil || !ok {
		t.Fatalf("process ok=%v err=%v", ok, err)
	}
	var applied int
	var discordEventID, threadID, messageID, eventURL string
	if err := pool.QueryRow(ctx, `SELECT discord_applied_revision, coalesce(discord_event_id,''), coalesce(discord_thread_id,''),
		coalesce(discord_message_id,''), coalesce(event_url,'') FROM quests WHERE public_id = $1`, publicID).
		Scan(&applied, &discordEventID, &threadID, &messageID, &eventURL); err != nil {
		t.Fatal(err)
	}
	if applied < desired {
		t.Fatalf("applied=%d desired=%d posted=%s", applied, desired, posted)
	}
	if posted == "" {
		t.Fatal("discord mock received no body")
	}
	var post struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal([]byte(posted), &post); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(post.Content, "<@&"+role+">\n# ") || !strings.Contains(post.Content, "Voice: <#"+voice+">") ||
		!strings.Contains(post.Content, "Sign up: https://chronicler.example/quests/loop-eeeeeeee") {
		t.Fatalf("post=%q", post.Content)
	}
	for _, leak := range []string{"abbot", "lich", "one player only", "[!dm"} {
		if strings.Contains(post.Content, leak) {
			t.Fatalf("DM-only text %q reached Discord: %q", leak, post.Content)
		}
	}
	if !strings.Contains(post.Content, "Public intro.") || !strings.Contains(post.Content, "Public outro.") {
		t.Fatalf("public brief text missing: %q", post.Content)
	}
	if messageID != "msg-loop-1" || threadID != "thread-loop-1" || discordEventID != "555555555555555555" ||
		eventURL != "https://discord.com/events/"+guild+"/555555555555555555" {
		t.Fatalf("stored message=%q thread=%q event=%q url=%q", messageID, threadID, discordEventID, eventURL)
	}
	wantCalls := "POST /channels/" + channel + "/messages|POST /channels/" + channel + "/messages/msg-loop-1/threads|" +
		"POST /guilds/" + guild + "/scheduled-events|PATCH /channels/" + channel + "/messages/msg-loop-1"
	if got := strings.Join(calls, "|"); got != wantCalls {
		t.Fatalf("calls=%s\nwant=%s", got, wantCalls)
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
	return dbtest.Pool(t)
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
