package delivery_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

const (
	playerA = "123456789012345678"
	playerB = "223456789012345678"
	playerC = "323456789012345678"
)

type memPlayerLists struct {
	target delivery.PlayerListTarget
}

func (m *memPlayerLists) LoadPlayerList(context.Context, string) (delivery.PlayerListTarget, error) {
	return m.target, nil
}

func playerListHTTP(t *testing.T, posts *[]map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			out := make([]map[string]any, len(*posts))
			for i, body := range *posts {
				out[i] = map[string]any{
					"id":      fmt.Sprintf("msg-%d", i+1),
					"content": body["content"],
					"author":  map[string]any{"bot": true},
				}
			}
			raw, _ := json.Marshal(out)
			_, _ = w.Write(raw)
			return
		}
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		*posts = append(*posts, body)
		_, _ = fmt.Fprintf(w, `{"id":"msg-%d"}`, len(*posts))
	}))
}

func TestPublishPlayerListPostsOnceAndAgainWhenRosterChanges(t *testing.T) {
	lists := &memPlayerLists{target: delivery.PlayerListTarget{Found: true, ThreadID: "thread-1", Status: "open"}}
	var posts []map[string]any
	server := playerListHTTP(t, &posts)
	t.Cleanup(server.Close)
	sync := delivery.RESTSync{Token: "tok", Players: lists, APIBase: server.URL, HTTP: server.Client()}
	first := jobs.QuestPlayerListPayload{PublicID: "quest-1", Fingerprint: playerA + "," + playerB, DiscordIDs: []string{playerA, playerB}}
	key := jobs.QuestPlayerListKey(first.PublicID, first.Fingerprint)
	id, err := sync.PublishPlayerList(context.Background(), key, first)
	if err != nil || id != "msg-1" {
		t.Fatal(err, id)
	}
	id, err = sync.PublishPlayerList(context.Background(), key, first)
	if err != nil || id != "msg-1" || len(posts) != 1 {
		t.Fatalf("id=%s err=%v posts=%d", id, err, len(posts))
	}
	if posts[0]["content"] != "Players: <@"+playerA+"> <@"+playerB+">" || posts[0]["enforce_nonce"] != true {
		t.Fatalf("posts=%v", posts)
	}
	mentions, _ := posts[0]["allowed_mentions"].(map[string]any)
	users, _ := mentions["users"].([]any)
	if len(users) != 2 || users[0] != playerA || users[1] != playerB {
		t.Fatalf("mentions=%v", mentions)
	}
	second := jobs.QuestPlayerListPayload{PublicID: "quest-1", Fingerprint: playerA + "," + playerC, DiscordIDs: []string{playerA, playerC}}
	id, err = sync.PublishPlayerList(context.Background(), jobs.QuestPlayerListKey(second.PublicID, second.Fingerprint), second)
	if err != nil || id != "msg-2" || len(posts) != 2 || posts[1]["content"] != "Players: <@"+playerA+"> <@"+playerC+">" {
		t.Fatalf("id=%s err=%v posts=%v", id, err, posts)
	}
}

type listSync struct {
	captureSync
	calls int
}

func (s *listSync) PublishPlayerList(context.Context, string, jobs.QuestPlayerListPayload) (string, error) {
	s.calls++
	return "msg-1", nil
}

func TestProcessOnePublishesPlayerListWithoutAnnouncementSync(t *testing.T) {
	payload, err := json.Marshal(jobs.QuestPlayerListPayload{PublicID: "quest-1", Fingerprint: playerA, DiscordIDs: []string{playerA}})
	if err != nil {
		t.Fatal(err)
	}
	store := &delivery.MemoryStore{Jobs: []jobs.Job{{
		ID: "1", Key: "quest-player-list:quest-1", Kind: delivery.KindQuestPlayerList,
		Lane: delivery.LaneDiscord, State: jobs.Queued, Payload: payload, NextRunAt: time.Now(),
	}}}
	sync := &listSync{}
	reconcile := &captureReconcile{}
	ok, err := delivery.NewHandler(store, sync).WithReconciler(reconcile).ProcessOne(context.Background())
	if err != nil || !ok || sync.calls != 1 || sync.id != "" || len(reconcile.ids) != 0 {
		t.Fatalf("ok=%v err=%v calls=%d sync=%q reconcile=%v", ok, err, sync.calls, sync.id, reconcile.ids)
	}
	if store.Jobs[0].State != jobs.Succeeded || string(store.Jobs[0].CompletionPayload) != `{"message_id":"msg-1"}` {
		t.Fatalf("state=%s payload=%s", store.Jobs[0].State, store.Jobs[0].CompletionPayload)
	}
}
