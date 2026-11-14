package delivery_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
)

type discordTransport func(*http.Request) (*http.Response, error)

func (f discordTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type cancelOnClose struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b cancelOnClose) Close() error {
	b.cancel()
	return b.ReadCloser.Close()
}

type persistenceQuests struct {
	*fakeQuests
	t *testing.T
}

func (q persistenceQuests) check(ctx context.Context) {
	q.t.Helper()
	deadline, bounded := ctx.Deadline()
	if ctx.Err() != nil || !bounded || time.Until(deadline) <= 0 || time.Until(deadline) > 5*time.Second {
		q.t.Fatalf("persistence context error=%v deadline=%v bounded=%v", ctx.Err(), deadline, bounded)
	}
}

func (q persistenceQuests) SetDiscordMessageID(ctx context.Context, questID, id string) error {
	q.check(ctx)
	return q.fakeQuests.SetDiscordMessageID(ctx, questID, id)
}

func (q persistenceQuests) SetDiscordEvent(ctx context.Context, questID, id, url string) error {
	q.check(ctx)
	return q.fakeQuests.SetDiscordEvent(ctx, questID, id, url)
}

func (q persistenceQuests) SetDiscordThread(ctx context.Context, questID, id string) error {
	q.check(ctx)
	return q.fakeQuests.SetDiscordThread(ctx, questID, id)
}

func TestRemoteIDsPersistAfterWorkContextCancellation(t *testing.T) {
	for _, kind := range []string{"message", "thread", "event"} {
		t.Run(kind, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			q := baseQuest("")
			if kind != "message" {
				q.MessageID = "existing-message"
			}
			if kind == "event" {
				q.ThreadID, q.VoiceChannelID = "existing-thread", testVoice
			}
			quests := &fakeQuests{quest: q}
			applier := &fakeApplier{}
			created, afterCancel := 0, 0
			sync := delivery.RESTSync{
				Token: "tok", GuildID: testGuild, FallbackChannelID: testChannel, FallbackOrigin: testOrigin,
				Quests: persistenceQuests{fakeQuests: quests, t: t}, Apply: applier,
				Now: func() time.Time { return testStart.Add(-time.Hour) },
				HTTP: &http.Client{Transport: discordTransport(func(r *http.Request) (*http.Response, error) {
					if ctx.Err() != nil {
						afterCancel++
					}
					payload := `{"id":"created-id"}`
					switch {
					case r.Method == http.MethodGet && r.URL.Path == "/users/@me":
						payload = `{"id":"bot-user-1"}`
					case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/scheduled-events"):
						payload = `[]`
					}
					body := io.ReadCloser(io.NopCloser(strings.NewReader(payload)))
					if r.Method == http.MethodPost {
						created++
						body = cancelOnClose{ReadCloser: body, cancel: cancel}
					}
					return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: body}, nil
				})},
			}
			err := sync.SyncQuest(ctx, testQuestID, 1)
			if !errors.Is(err, context.Canceled) || created != 1 || afterCancel != 0 || len(applier.revisions) != 0 {
				t.Fatalf("error=%v creations=%d requests after cancel=%d applied=%v", err, created, afterCancel, applier.revisions)
			}
			if quests.msgs+quests.events+quests.thread != 1 {
				t.Fatalf("persisted message=%d event=%d thread=%d", quests.msgs, quests.events, quests.thread)
			}
		})
	}
}

func TestCreateMessageSendsStableEnforcedNonceAcrossRetry(t *testing.T) {
	quests := &fakeQuests{quest: baseQuest("")}
	var bodies []map[string]any
	sync := delivery.RESTSync{
		Token: "tok", GuildID: testGuild, FallbackChannelID: testChannel, FallbackOrigin: testOrigin, Quests: quests,
		HTTP: &http.Client{Transport: discordTransport(func(r *http.Request) (*http.Response, error) {
			if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/messages") {
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				bodies = append(bodies, body)
				if len(bodies) == 1 {
					return nil, errors.New("response lost")
				}
			}
			payload := `{"id":"created-id"}`
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/users/@me":
				payload = `{"id":"bot-user-1"}`
			case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/scheduled-events"):
				payload = `[]`
			}
			return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(payload))}, nil
		})},
	}
	if err := sync.SyncQuest(context.Background(), testQuestID, 1); err == nil {
		t.Fatal("lost response succeeded")
	}
	if err := sync.SyncQuest(context.Background(), testQuestID, 2); err != nil {
		t.Fatal(err)
	}
	if len(bodies) != 2 {
		t.Fatalf("message attempts=%d", len(bodies))
	}
	nonce, _ := bodies[0]["nonce"].(string)
	if nonce == "" || len(nonce) > 25 || bodies[1]["nonce"] != nonce || bodies[0]["enforce_nonce"] != true || bodies[1]["enforce_nonce"] != true {
		t.Fatalf("message bodies lack stable bounded enforced nonce: %v", bodies)
	}
}
