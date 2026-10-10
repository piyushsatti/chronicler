package delivery_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
)

type memoryMessages struct {
	mu  sync.Mutex
	id  string
	set int
}

func (m *memoryMessages) GetDiscordMessageID(context.Context, string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.id, nil
}

func (m *memoryMessages) SetDiscordMessageID(_ context.Context, _ string, messageID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.id = messageID
	m.set++
	return nil
}

func TestRESTSyncPostsThenPatches(t *testing.T) {
	var methods []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		methods = append(methods, r.Method)
		body, _ := io.ReadAll(r.Body)
		if len(body) == 0 {
			t.Fatalf("empty body on %s", r.Method)
		}
		if r.Method == http.MethodPost {
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "msg-1"})
			return
		}
		if r.Method == http.MethodPatch {
			if !strings.Contains(r.URL.Path, "/messages/msg-1") {
				t.Fatalf("patch path=%s", r.URL.Path)
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"id":"msg-1"}`))
			return
		}
		t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
	}))
	defer srv.Close()

	applier := &fakeApplier{}
	msgs := &memoryMessages{}
	sync := delivery.RESTSync{
		Token:     "tok",
		ChannelID: "chan",
		HTTP:      srv.Client(),
		APIBase:   srv.URL,
		Apply:     applier,
		Messages:  msgs,
	}
	if err := sync.SyncQuest(context.Background(), "quest-1", 3); err != nil {
		t.Fatal(err)
	}
	if err := sync.SyncQuest(context.Background(), "quest-1", 4); err != nil {
		t.Fatal(err)
	}
	if len(methods) != 2 || methods[0] != http.MethodPost || methods[1] != http.MethodPatch {
		t.Fatalf("methods=%v", methods)
	}
	if msgs.id != "msg-1" || msgs.set != 1 {
		t.Fatalf("message store id=%s set=%d", msgs.id, msgs.set)
	}
	if len(applier.revisions) != 2 || applier.revisions[0] != 3 || applier.revisions[1] != 4 {
		t.Fatalf("revisions=%v", applier.revisions)
	}
}
