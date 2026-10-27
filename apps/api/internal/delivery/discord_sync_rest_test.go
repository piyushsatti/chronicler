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
	"time"
	"unicode/utf16"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
)

const (
	testGuild   = "111111111111111111"
	testChannel = "222222222222222222"
	testRole    = "333333333333333333"
	testVoice   = "444444444444444444"
	testDM      = "555555555555555555"
	testOrigin  = "https://chronicler.example"
	testQuestID = "11111111-1111-4111-8111-111111111111"
)

// fakeQuests is an in-memory QuestStore.
type fakeQuests struct {
	mu     sync.Mutex
	quest  delivery.AnnounceQuest
	events int
	thread int
	msgs   int
	url    string
}

func (f *fakeQuests) LoadAnnounceQuest(context.Context, string) (delivery.AnnounceQuest, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.quest, nil
}

func (f *fakeQuests) SetDiscordMessageID(_ context.Context, _ string, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.quest.MessageID = id
	f.msgs++
	return nil
}

func (f *fakeQuests) SetDiscordEvent(_ context.Context, _, id, url string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.quest.EventID, f.url = id, url
	f.events++
	return nil
}

func (f *fakeQuests) SetDiscordThread(_ context.Context, _, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.quest.ThreadID = id
	f.thread++
	return nil
}

type fakeSettings struct{ settings delivery.DeliverySettings }

func (f fakeSettings) LoadDeliverySettings(context.Context) (delivery.DeliverySettings, error) {
	return f.settings, nil
}

type discordCall struct {
	Method string
	Path   string
	Body   map[string]any
}

// fakeDiscord records every call and answers like the REST API.
type fakeDiscord struct {
	mu    sync.Mutex
	calls []discordCall
	fail  func(discordCall) bool
	srv   *httptest.Server
}

func newFakeDiscord(t *testing.T) *fakeDiscord {
	t.Helper()
	f := &fakeDiscord{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		call := discordCall{Method: r.Method, Path: r.URL.Path}
		_ = json.Unmarshal(raw, &call.Body)
		f.mu.Lock()
		f.calls = append(f.calls, call)
		fail := f.fail
		f.mu.Unlock()
		if r.Header.Get("Authorization") != "Bot tok" {
			t.Errorf("authorization=%q", r.Header.Get("Authorization"))
		}
		if fail != nil && fail(call) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"message":"boom"}`))
			return
		}
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/threads"):
			_, _ = w.Write([]byte(`{"id":"thread-1"}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/scheduled-events"):
			_, _ = w.Write([]byte(`{"id":"666666666666666666"}`))
		case r.Method == http.MethodPost:
			_, _ = w.Write([]byte(`{"id":"777777777777777777"}`))
		default:
			_, _ = w.Write([]byte(`{"id":"ok"}`))
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeDiscord) summary() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.calls))
	for i, c := range f.calls {
		out[i] = c.Method + " " + c.Path
	}
	return out
}

func (f *fakeDiscord) find(method, suffix string) []discordCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []discordCall
	for _, c := range f.calls {
		if c.Method == method && strings.HasSuffix(c.Path, suffix) {
			out = append(out, c)
		}
	}
	return out
}

var testStart = time.Date(2030, 3, 1, 19, 30, 0, 0, time.UTC)

func publicBrief(body string) document.Document {
	return document.Document{
		ID: "doc-1", AuthorID: "99999999-9999-4999-8999-999999999999", Kind: "quest_brief",
		Status: document.StatusPublished, Visibility: document.VisibilityPublic, Body: body,
	}
}

func baseQuest(voice string) delivery.AnnounceQuest {
	return delivery.AnnounceQuest{
		PublicID: testQuestID, ShortCode: "Q1a2b3c4d", Title: "The Sunken Bell", Status: "open",
		ScheduledAt: testStart, DurationHours: 4, VoiceChannelID: voice, DMDiscordID: testDM,
		Brief: publicBrief("A bell rings under the harbour."),
	}
}

func newSync(f *fakeDiscord, quests *fakeQuests, settings delivery.DeliverySettings, applier delivery.RevisionApplier) delivery.RESTSync {
	return delivery.RESTSync{
		Token: "tok", GuildID: testGuild, Settings: fakeSettings{settings}, Quests: quests,
		HTTP: f.srv.Client(), APIBase: f.srv.URL, Apply: applier,
		Now: func() time.Time { return testStart.Add(-48 * time.Hour) },
	}
}

var fullSettings = delivery.DeliverySettings{AnnounceChannelID: testChannel, RoleID: testRole, PublicOrigin: testOrigin}

func TestFirstPostMessageThreadEventThenEventLine(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest(testVoice)}
	applier := &fakeApplier{}
	if err := newSync(f, quests, fullSettings, applier).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"POST /channels/" + testChannel + "/messages",
		"POST /channels/" + testChannel + "/messages/777777777777777777/threads",
		"POST /guilds/" + testGuild + "/scheduled-events",
		"PATCH /channels/" + testChannel + "/messages/777777777777777777",
	}
	if got := f.summary(); strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("calls=%v\nwant=%v", got, want)
	}
	post := f.find(http.MethodPost, "/messages")[0].Body["content"].(string)
	if strings.Contains(post, "Event:") {
		t.Fatalf("first post is sent before the event exists: %q", post)
	}
	edited := f.find(http.MethodPatch, "/messages/777777777777777777")[0].Body["content"].(string)
	wantEdited := "<@&" + testRole + ">\n# The Sunken Bell (Q1a2b3c4d)\nA bell rings under the harbour.\n\n" +
		"<t:" + itoa(testStart.Unix()) + ":F> · 4 hours · DM <@" + testDM + "> · Voice: <#" + testVoice + ">\n" +
		"Event: https://discord.com/events/" + testGuild + "/666666666666666666\n" +
		"Sign up: " + testOrigin + "/quests/Q1a2b3c4d"
	if edited != wantEdited {
		t.Fatalf("edited post:\n%s\nwant:\n%s", edited, wantEdited)
	}
	if quests.quest.ThreadID != "thread-1" || quests.thread != 1 || quests.events != 1 || quests.msgs != 1 {
		t.Fatalf("stored %+v threads=%d events=%d msgs=%d", quests.quest, quests.thread, quests.events, quests.msgs)
	}
	if quests.url != "https://discord.com/events/"+testGuild+"/666666666666666666" {
		t.Fatalf("event url=%q", quests.url)
	}
	if len(applier.revisions) != 1 || applier.revisions[0] != 1 {
		t.Fatalf("revisions=%v", applier.revisions)
	}
}

func itoa(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func TestThreadIsNamedAfterQuestCode(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest("")}
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	threads := f.find(http.MethodPost, "/threads")
	if len(threads) != 1 || threads[0].Body["name"] != "Q1a2b3c4d" {
		t.Fatalf("threads=%v", threads)
	}
}

func TestLaterSyncsEditOnlyAndNeverStartAThreadAgain(t *testing.T) {
	f := newFakeDiscord(t)
	quest := baseQuest(testVoice)
	quest.MessageID, quest.EventID, quest.ThreadID, quest.AppliedRevision = "msg-9", "evt-9", "thread-9", 2
	quests := &fakeQuests{quest: quest}
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 3); err != nil {
		t.Fatal(err)
	}
	want := "PATCH /channels/" + testChannel + "/messages/msg-9|PATCH /guilds/" + testGuild + "/scheduled-events/evt-9"
	if got := strings.Join(f.summary(), "|"); got != want {
		t.Fatalf("calls=%s\nwant=%s", got, want)
	}
	if quests.thread != 0 || quests.events != 0 {
		t.Fatalf("must not create thread or event again: %+v", quests)
	}
}

func TestNoThreadAfterFirstPostEvenWhenNoneWasRecorded(t *testing.T) {
	f := newFakeDiscord(t)
	quest := baseQuest("")
	quest.MessageID, quest.AppliedRevision = "msg-9", 4 // posted before threads existed
	quests := &fakeQuests{quest: quest}
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 5); err != nil {
		t.Fatal(err)
	}
	if got := f.find(http.MethodPost, "/threads"); len(got) != 0 {
		t.Fatalf("thread created after the first post: %v", got)
	}
}

func TestRetryOfFirstPostStillOpensTheThreadOnce(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest(testVoice)}
	f.fail = func(c discordCall) bool { return strings.HasSuffix(c.Path, "/scheduled-events") }
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err == nil {
		t.Fatal("event failure must fail the job so it retries")
	}
	f.fail = nil
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	if n := len(f.find(http.MethodPost, "/threads")); n != 1 {
		t.Fatalf("threads=%d want exactly 1", n)
	}
	if n := len(f.find(http.MethodPost, "/channels/"+testChannel+"/messages")); n != 1 {
		t.Fatalf("messages posted=%d want 1", n)
	}
	if quests.quest.EventID == "" {
		t.Fatal("event should exist after the retry")
	}
}

func TestThreadFailureDoesNotBlockEventOrRevision(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest(testVoice)}
	applier := &fakeApplier{}
	f.fail = func(c discordCall) bool { return strings.HasSuffix(c.Path, "/threads") }
	if err := newSync(f, quests, fullSettings, applier).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatalf("a thread failure must not fail the delivery: %v", err)
	}
	if quests.quest.ThreadID != "" || quests.thread != 0 {
		t.Fatalf("no thread should be stored: %+v threads=%d", quests.quest, quests.thread)
	}
	if quests.quest.EventID == "" || quests.events != 1 {
		t.Fatalf("event should still be created: %+v events=%d", quests.quest, quests.events)
	}
	if n := len(f.find(http.MethodPatch, "/messages/777777777777777777")); n != 1 {
		t.Fatalf("event line edits=%d want 1", n)
	}
	if len(applier.revisions) != 1 || applier.revisions[0] != 1 {
		t.Fatalf("revisions=%v", applier.revisions)
	}
	// Later syncs do not retry the thread once the first post is applied.
	quests.quest.AppliedRevision = 1
	f.fail = nil
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 2); err != nil {
		t.Fatal(err)
	}
	if n := len(f.find(http.MethodPost, "/threads")); n != 1 {
		t.Fatalf("thread attempts=%d want only the first", n)
	}
}

func TestEventDetails(t *testing.T) {
	f := newFakeDiscord(t)
	quest := baseQuest(testVoice)
	quest.DurationHours = 2.5
	quests := &fakeQuests{quest: quest}
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	body := f.find(http.MethodPost, "/scheduled-events")[0].Body
	checks := map[string]any{
		"entity_type": float64(2), "channel_id": testVoice, "privacy_level": float64(2),
		"name": "The Sunken Bell", "scheduled_start_time": "2030-03-01T19:30:00Z",
		"scheduled_end_time": "2030-03-01T22:00:00Z",
	}
	for key, want := range checks {
		if body[key] != want {
			t.Errorf("%s=%v want %v", key, body[key], want)
		}
	}
	desc, _ := body["description"].(string)
	if !strings.Contains(desc, "https://discord.com/channels/"+testGuild+"/"+testChannel+"/777777777777777777") {
		t.Errorf("description lacks the announce message link: %q", desc)
	}
	if !strings.Contains(desc, testOrigin+"/quests/Q1a2b3c4d") {
		t.Errorf("description lacks the quest page link: %q", desc)
	}
	if _, has := body["entity_metadata"]; has {
		t.Errorf("voice events carry no entity_metadata: %v", body)
	}
}

func TestNoVoiceChannelMeansNoEventAndNoVoicePart(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest("")}
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	if got := f.find(http.MethodPost, "/scheduled-events"); len(got) != 0 {
		t.Fatalf("event created without a voice channel: %v", got)
	}
	content := f.find(http.MethodPost, "/messages")[0].Body["content"].(string)
	if strings.Contains(content, "Voice:") || strings.Contains(content, "Event:") {
		t.Fatalf("content=%q", content)
	}
}

func TestPastQuestGetsNoEvent(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest(testVoice)}
	sync := newSync(f, quests, fullSettings, nil)
	sync.Now = func() time.Time { return testStart.Add(time.Hour) }
	if err := sync.SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	if got := f.find(http.MethodPost, "/scheduled-events"); len(got) != 0 {
		t.Fatalf("discord rejects past start times; got %v", got)
	}
}

func TestRolePingAndAllowedMentions(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest("")}
	quests.quest.Brief = publicBrief("Ping @everyone and <@&999999999999999999> now.")
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	body := f.find(http.MethodPost, "/messages")[0].Body
	if !strings.HasPrefix(body["content"].(string), "<@&"+testRole+">\n# ") {
		t.Fatalf("role line must lead the post: %q", body["content"])
	}
	mentions := body["allowed_mentions"].(map[string]any)
	roles := mentions["roles"].([]any)
	if len(roles) != 1 || roles[0] != testRole || mentions["parse"] != nil {
		t.Fatalf("only the quest role may ping: %v", mentions)
	}
}

func TestNoRoleMeansNoRoleLineAndNoPings(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest("")}
	settings := fullSettings
	settings.RoleID = ""
	if err := newSync(f, quests, settings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	body := f.find(http.MethodPost, "/messages")[0].Body
	if !strings.HasPrefix(body["content"].(string), "# The Sunken Bell") {
		t.Fatalf("content=%q", body["content"])
	}
	mentions := body["allowed_mentions"].(map[string]any)
	if parse, _ := mentions["parse"].([]any); len(parse) != 0 || mentions["roles"] != nil {
		t.Fatalf("mentions=%v", mentions)
	}
}

func TestAnnounceChannelSettingBeatsEnvFallback(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest("")}
	sync := newSync(f, quests, fullSettings, nil)
	sync.FallbackChannelID = "888888888888888888"
	if err := sync.SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	if got := f.summary()[0]; got != "POST /channels/"+testChannel+"/messages" {
		t.Fatalf("first call=%s", got)
	}
}

func TestEnvFallbackUsedOnlyWhenSettingEmpty(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest("")}
	settings := fullSettings
	settings.AnnounceChannelID = ""
	sync := newSync(f, quests, settings, nil)
	sync.FallbackChannelID = "888888888888888888"
	if err := sync.SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	if got := f.summary()[0]; got != "POST /channels/888888888888888888/messages" {
		t.Fatalf("first call=%s", got)
	}
}

func TestNotConfiguredWithoutChannelOrigin(t *testing.T) {
	for name, mutate := range map[string]func(*delivery.DeliverySettings, *delivery.RESTSync){
		"channel": func(s *delivery.DeliverySettings, _ *delivery.RESTSync) { s.AnnounceChannelID = "" },
		"origin":  func(s *delivery.DeliverySettings, _ *delivery.RESTSync) { s.PublicOrigin = "" },
		"guild":   func(_ *delivery.DeliverySettings, r *delivery.RESTSync) { r.GuildID = "" },
		"token":   func(_ *delivery.DeliverySettings, r *delivery.RESTSync) { r.Token = "" },
	} {
		t.Run(name, func(t *testing.T) {
			f := newFakeDiscord(t)
			settings := fullSettings
			sync := newSync(f, &fakeQuests{quest: baseQuest("")}, settings, &fakeApplier{})
			mutate(&settings, &sync)
			sync.Settings = fakeSettings{settings}
			err := sync.SyncQuest(context.Background(), testQuestID, 1)
			if err == nil || !strings.Contains(err.Error(), delivery.ErrDiscordNotConfigured.Error()) {
				t.Fatalf("err=%v", err)
			}
			if len(f.summary()) != 0 {
				t.Fatalf("no calls without config: %v", f.summary())
			}
		})
	}
}

func TestAPIErrorDoesNotApplyRevision(t *testing.T) {
	f := newFakeDiscord(t)
	f.fail = func(discordCall) bool { return true }
	applier := &fakeApplier{}
	err := newSync(f, &fakeQuests{quest: baseQuest("")}, fullSettings, applier).SyncQuest(context.Background(), testQuestID, 1)
	if err == nil || !strings.Contains(err.Error(), "status 400") || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("want status+body in error, got %v", err)
	}
	if len(applier.applied) != 0 {
		t.Fatalf("must not apply on api error: %v", applier.applied)
	}
}

func TestMissingMessageIDDoesNotApply(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{}`)) }))
	defer srv.Close()
	applier := &fakeApplier{}
	err := delivery.RESTSync{
		Token: "tok", GuildID: testGuild, Settings: fakeSettings{fullSettings}, Quests: &fakeQuests{quest: baseQuest("")},
		HTTP: srv.Client(), APIBase: srv.URL, Apply: applier,
	}.SyncQuest(context.Background(), testQuestID, 2)
	if err == nil || !strings.Contains(err.Error(), "missing message id") {
		t.Fatalf("want missing message id, got %v", err)
	}
	if len(applier.applied) != 0 {
		t.Fatalf("must not apply: %v", applier.applied)
	}
}

func discordLen(s string) int { return len(utf16.Encode([]rune(s))) }

func TestSyncPostsOnlyMemberVisibleBrief(t *testing.T) {
	f := newFakeDiscord(t)
	quests := &fakeQuests{quest: baseQuest("")}
	quests.quest.Brief = publicBrief("Open intro.\n\n> [!dm] The baron is the villain.\n\nMore intro.\n\n> [!dm:@alice] Alice's secret.\n\nThe end.")
	if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	content := f.find(http.MethodPost, "/messages")[0].Body["content"].(string)
	for _, leak := range []string{"baron", "villain", "Alice", "secret", "[!dm"} {
		if strings.Contains(content, leak) {
			t.Fatalf("%q leaked into the post: %q", leak, content)
		}
	}
	for _, kept := range []string{"Open intro.", "More intro.", "The end."} {
		if !strings.Contains(content, kept) {
			t.Fatalf("%q missing from the post: %q", kept, content)
		}
	}
}

func TestMemberBriefBodyHidesDMBlocksAndNeverUsesRawBody(t *testing.T) {
	brief := publicBrief("Visible.\n> [!dm] hidden dm text\n> [!dm:@bob] for bob only\nAlso visible.")
	got := delivery.MemberBriefBody(brief)
	if strings.Contains(got, "hidden dm text") || strings.Contains(got, "bob only") {
		t.Fatalf("dm text leaked: %q", got)
	}
	effective, err := brief.EffectiveBody(document.ViewerScope{MemberID: "announcement-ordinary-member", ReaderOf: map[string]struct{}{}})
	if err != nil || got != strings.TrimSpace(effective) {
		t.Fatalf("body must be the EffectiveBody projection: got %q want %q err=%v", got, effective, err)
	}
	if got == strings.TrimSpace(brief.Body) {
		t.Fatal("the raw body was used")
	}
}

func TestMemberBriefBodyEmptyWhenMembersCannotReadTheBrief(t *testing.T) {
	brief := publicBrief("Draft text")
	brief.Status = document.StatusDraft
	if got := delivery.MemberBriefBody(brief); got != "" {
		t.Fatalf("unreadable brief must give no body, got %q", got)
	}
}

func TestBuildAnnouncementLayoutWithEverything(t *testing.T) {
	got, cut, err := delivery.BuildAnnouncement(delivery.AnnouncementInput{
		RoleID: testRole, Title: "T", ShortCode: "Q1", Body: "Body line.", ScheduledAt: testStart, DurationHours: 3,
		DMDiscordID: testDM, VoiceChannelID: testVoice, EventURL: "https://discord.com/events/1/2", SignupURL: "https://s/quests/Q1",
	})
	if err != nil || cut {
		t.Fatalf("err=%v cut=%v", err, cut)
	}
	want := "<@&" + testRole + ">\n# T (Q1)\nBody line.\n\n<t:" + itoa(testStart.Unix()) + ":F> · 3 hours · DM <@" + testDM +
		"> · Voice: <#" + testVoice + ">\nEvent: https://discord.com/events/1/2\nSign up: https://s/quests/Q1"
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestBuildAnnouncementOmitsRoleVoiceAndEvent(t *testing.T) {
	got, _, err := delivery.BuildAnnouncement(delivery.AnnouncementInput{
		Title: "T", ShortCode: "Q1", Body: "B", ScheduledAt: testStart, DurationHours: 2.5, DMDiscordID: testDM, SignupURL: "https://s/quests/Q1",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := "# T (Q1)\nB\n\n<t:" + itoa(testStart.Unix()) + ":F> · 2.5 hours · DM <@" + testDM + ">\nSign up: https://s/quests/Q1"
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestBuildAnnouncementCutsOnlyTheBodyAtTheLimit(t *testing.T) {
	long := strings.Repeat("alpha beta gamma ", 300)
	in := delivery.AnnouncementInput{
		RoleID: testRole, Title: "Long", ShortCode: "Q1", Body: long, ScheduledAt: testStart, DurationHours: 4,
		DMDiscordID: testDM, VoiceChannelID: testVoice, EventURL: "https://discord.com/events/1/2", SignupURL: "https://s/quests/Q1",
	}
	got, cut, err := delivery.BuildAnnouncement(in)
	if err != nil || !cut {
		t.Fatalf("err=%v cut=%v", err, cut)
	}
	if discordLen(got) > delivery.DiscordMessageLimit {
		t.Fatalf("post is %d long", discordLen(got))
	}
	lines := strings.Split(got, "\n")
	if lines[0] != "<@&"+testRole+">" || lines[1] != "# Long (Q1)" {
		t.Fatalf("head changed: %q", lines[:2])
	}
	tail := lines[len(lines)-4:]
	if tail[0] != "" || !strings.Contains(tail[1], "· 4 hours · DM") || !strings.HasPrefix(tail[2], "Event: ") || tail[3] != "Sign up: https://s/quests/Q1" {
		t.Fatalf("tail changed: %q", tail)
	}
	body := lines[2]
	if !strings.HasSuffix(body, "…") || !strings.HasPrefix(long, strings.TrimSuffix(body, "…")) {
		t.Fatalf("body not a clean prefix: %q", body[max(0, len(body)-30):])
	}
	trimmed := strings.TrimSuffix(body, "…")
	if !strings.HasSuffix(trimmed, "alpha") && !strings.HasSuffix(trimmed, "beta") && !strings.HasSuffix(trimmed, "gamma") {
		t.Fatalf("cut inside a word: %q", trimmed[max(0, len(trimmed)-20):])
	}
	// The post is as long as the limit allows: one more word would not fit.
	if discordLen(got) < delivery.DiscordMessageLimit-len("gamma ")-2 {
		t.Fatalf("cut far too early: %d", discordLen(got))
	}
}

func TestBuildAnnouncementCountsUTF16(t *testing.T) {
	in := delivery.AnnouncementInput{Title: "T", ShortCode: "Q1", Body: strings.Repeat("🐉 dragon ", 400), ScheduledAt: testStart, DurationHours: 4, DMDiscordID: testDM, SignupURL: "https://s/quests/Q1"}
	got, cut, err := delivery.BuildAnnouncement(in)
	if err != nil || !cut {
		t.Fatalf("err=%v cut=%v", err, cut)
	}
	if discordLen(got) > delivery.DiscordMessageLimit {
		t.Fatalf("utf16 length %d", discordLen(got))
	}
}

func TestBuildAnnouncementShortPostIsNotCut(t *testing.T) {
	in := delivery.AnnouncementInput{Title: "T", ShortCode: "Q1", Body: strings.Repeat("x", 1500), ScheduledAt: testStart, DurationHours: 4, DMDiscordID: testDM, SignupURL: "https://s/q"}
	got, cut, err := delivery.BuildAnnouncement(in)
	if err != nil || cut || !strings.Contains(got, in.Body) {
		t.Fatalf("err=%v cut=%v", err, cut)
	}
}
