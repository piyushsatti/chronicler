//go:build integration

package quest

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPublishQuestPlayerListPostsSeatedPlayersOnce(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	const ownerID = "123456789012345678"
	const otherID = "777777777777777777"
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE members SET discord_id=$1 WHERE discord_id='close-owner'`, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET status='open', signup_type='last_game_played' WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	_, err := f.commands.PublishQuestPlayerList(ctx, f.actor, PublishQuestPlayerListSpec{QuestId: f.questID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Conflict)

	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET discord_thread_id='345678901234567890' WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	var posts []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			out := make([]map[string]any, len(posts))
			for i, body := range posts {
				out[i] = map[string]any{"id": body["id"], "content": body["content"], "author": map[string]any{"bot": true}}
			}
			raw, _ := json.Marshal(out)
			_, _ = w.Write(raw)
			return
		}
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		body["id"] = "888"
		if len(posts) > 0 {
			body["id"] = "889"
		}
		posts = append(posts, body)
		_, _ = w.Write([]byte(`{"id":"` + body["id"].(string) + `"}`))
	}))
	t.Cleanup(server.Close)
	worker := delivery.RESTSync{
		Token: "tok", APIBase: server.URL, HTTP: server.Client(),
		Players: delivery.NewPostgresRevisionApplier(f.fixture.Pool.Pool),
	}
	handler := delivery.NewHandler(jobs.NewPostgresStore(f.fixture.Pool.Pool), worker)

	publish := func(signupType, fingerprint, wantStatus string) {
		t.Helper()
		if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET signup_type=$2 WHERE public_id=$1`, f.questID, signupType); err != nil {
			t.Fatal(err)
		}
		receipt, err := f.commands.PublishQuestPlayerList(ctx, f.actor, PublishQuestPlayerListSpec{QuestId: f.questID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		if err != nil || receipt.DeliveryStatus != wantStatus || receipt.JobId == "" {
			t.Fatalf("publish %s receipt=%+v err=%v", signupType, receipt, err)
		}
		key := jobs.QuestPlayerListKey(f.questID, fingerprint)
		var kind, got, state string
		var payload []byte
		if err := f.fixture.Pool.QueryRow(ctx, `SELECT kind, payload->>'fingerprint', state, completion_payload FROM background_jobs WHERE job_key=$1`, key).Scan(&kind, &got, &state, &payload); err != nil || kind != delivery.KindQuestPlayerList || got != fingerprint {
			t.Fatalf("job kind=%s fingerprint=%s state=%s err=%v", kind, got, state, err)
		}
		if wantStatus == "queued" {
			if worked, err := handler.ProcessOne(ctx); err != nil || !worked {
				t.Fatal(worked, err)
			}
			before := len(posts)
			id, err := worker.PublishPlayerList(ctx, key, jobs.QuestPlayerListPayload{PublicID: f.questID, Fingerprint: fingerprint, DiscordIDs: strings.Split(fingerprint, ",")})
			if err != nil || id == "" || len(posts) != before {
				t.Fatalf("retry id=%s err=%v posts=%d before=%d", id, err, len(posts), before)
			}
		}
		if err := f.fixture.Pool.QueryRow(ctx, `SELECT state, completion_payload FROM background_jobs WHERE job_key=$1`, key).Scan(&state, &payload); err != nil || state != string(jobs.Succeeded) || len(payload) == 0 {
			t.Fatalf("state=%s payload=%s err=%v", state, payload, err)
		}
	}
	publish("last_game_played", ownerID, "queued")
	publish("dm_pick", ownerID, "applied")
	if len(posts) != 1 || posts[0]["content"] != "Players: <@"+ownerID+">" {
		t.Fatalf("posts=%v", posts)
	}

	other := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1,$2,'other-player','Other',ARRAY['player'],'active')`, other, otherID); err != nil {
		t.Fatal(err)
	}
	character := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status) SELECT $1,'C-OTHER','Other Hero',id,'active' FROM members WHERE public_id=$2`, character, other); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status) SELECT q.id,c.id,c.owner_id,'signed_up' FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, f.questID, character); err != nil {
		t.Fatal(err)
	}
	publish("dm_pick", ownerID+","+otherID, "queued")
	if len(posts) != 2 || posts[1]["content"] != "Players: <@"+ownerID+"> <@"+otherID+">" {
		t.Fatalf("posts=%v", posts)
	}
}
