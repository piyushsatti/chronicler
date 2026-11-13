package delivery

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func TestPlayerListContentRejectsNonSnowflake(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls++ }))
	t.Cleanup(server.Close)
	sync := RESTSync{
		Token: "tok", APIBase: server.URL, HTTP: server.Client(),
		Players: stubPlayerList{PlayerListTarget{Found: true, ThreadID: "thread-1", Status: "open"}},
	}
	body := jobs.QuestPlayerListPayload{
		PublicID: "quest-1", Fingerprint: "discord-player", DiscordIDs: []string{"123456789012345678", "discord-player"},
	}
	id, err := sync.PublishPlayerList(context.Background(), jobs.QuestPlayerListKey(body.PublicID, body.Fingerprint), body)
	if id != "" || !errors.Is(err, ErrBadPayload) || calls != 0 {
		t.Fatalf("id=%s err=%v calls=%d", id, err, calls)
	}
}

type stubPlayerList struct{ target PlayerListTarget }

func (s stubPlayerList) LoadPlayerList(context.Context, string) (PlayerListTarget, error) {
	return s.target, nil
}

func TestPublishPlayerListAdoptsNewestBotContent(t *testing.T) {
	body := jobs.QuestPlayerListPayload{
		PublicID: "11111111-1111-4111-8111-111111111111", Fingerprint: "123456789012345678",
		DiscordIDs: []string{"123456789012345678"},
	}
	content := "Players: <@123456789012345678>"
	var posts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			posts++
			_, _ = io.WriteString(w, `{"id":"should-not-post"}`)
			return
		}
		raw, _ := json.Marshal([]map[string]any{
			{"id": "111", "content": content, "author": map[string]any{"bot": false}},
			{"id": "555", "content": content, "author": map[string]any{"bot": true}},
			{"id": "222", "content": "Players: <@999>", "author": map[string]any{"bot": true}},
			{"id": "999", "content": content, "author": map[string]any{"bot": true}},
		})
		_, _ = w.Write(raw)
	}))
	t.Cleanup(server.Close)
	sync := RESTSync{
		Token: "tok", APIBase: server.URL, HTTP: server.Client(),
		Players: stubPlayerList{PlayerListTarget{Found: true, ThreadID: "thread-1", Status: "open"}},
	}
	id, err := sync.PublishPlayerList(context.Background(), jobs.QuestPlayerListKey(body.PublicID, body.Fingerprint), body)
	if err != nil || id != "555" || posts != 0 {
		t.Fatalf("id=%s err=%v posts=%d", id, err, posts)
	}
}

func TestListMessagesForbiddenStillPostsPlayerList(t *testing.T) {
	body := jobs.QuestPlayerListPayload{
		PublicID: "quest-1", Fingerprint: "123456789012345678", DiscordIDs: []string{"123456789012345678"},
	}
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	var posts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.WriteHeader(http.StatusForbidden)
			_, _ = io.WriteString(w, `{"message":"Missing Permissions"}`)
			return
		}
		posts++
		_, _ = io.WriteString(w, `{"id":"msg-9"}`)
	}))
	t.Cleanup(server.Close)
	sync := RESTSync{
		Token: "tok", APIBase: server.URL, HTTP: server.Client(),
		Players: stubPlayerList{PlayerListTarget{Found: true, ThreadID: "thread-1", Status: "open"}},
	}
	store := &MemoryStore{Jobs: []jobs.Job{{
		ID: "1", Key: jobs.QuestPlayerListKey(body.PublicID, body.Fingerprint), Kind: KindQuestPlayerList,
		Lane: LaneDiscord, State: jobs.Queued, Payload: payload, NextRunAt: time.Now(),
	}}}
	ok, err := NewHandler(store, sync).ProcessOne(context.Background())
	if err != nil || !ok || posts != 1 || store.Jobs[0].State != jobs.Succeeded || string(store.Jobs[0].CompletionPayload) != `{"message_id":"msg-9"}` {
		t.Fatalf("ok=%v err=%v posts=%d state=%s payload=%s", ok, err, posts, store.Jobs[0].State, store.Jobs[0].CompletionPayload)
	}
}

func TestPublishPlayerListSkipsCancelledAndDeleted(t *testing.T) {
	body := jobs.QuestPlayerListPayload{
		PublicID: "quest-1", Fingerprint: "123456789012345678", DiscordIDs: []string{"123456789012345678"},
	}
	for _, target := range []PlayerListTarget{
		{Found: true, ThreadID: "thread-1", Status: "cancelled"},
		{Found: true, ThreadID: "thread-1", Status: "open", Deleted: true},
	} {
		calls := 0
		server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls++ }))
		sync := RESTSync{
			Token: "tok", APIBase: server.URL, HTTP: server.Client(),
			Players: stubPlayerList{target},
		}
		id, err := sync.PublishPlayerList(context.Background(), jobs.QuestPlayerListKey(body.PublicID, body.Fingerprint), body)
		server.Close()
		if err != nil || id != "" || calls != 0 {
			t.Fatalf("target=%+v id=%s err=%v calls=%d", target, id, err, calls)
		}
	}
}
