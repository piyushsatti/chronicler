package delivery_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
)

func TestQuestAnnouncementGameInformationLayout(t *testing.T) {
	in := delivery.AnnouncementInput{
		RoleID: testRole, Title: "The Sunken Bell", Status: "open", Body: "A bell rings under the harbour.",
		ScheduledAt: testStart, DurationHours: 2.5, DMDiscordID: testDM,
		SignupURL: testOrigin + "/quests/Q1a2b3c4d", EventURL: "https://discord.com/events/1/2",
	}
	if err := json.Unmarshal([]byte(`{"AvgPartyLevel":7}`), &in); err != nil {
		t.Fatal(err)
	}
	got, cut, err := delivery.BuildAnnouncement(in)
	want := fmt.Sprintf("# [The Sunken Bell](<%s/quests/Q1a2b3c4d>)\n\nA bell rings under the harbour.\n\n-# <@&%s>\n\n## Game Information\n- **Scheduling & Duration** - <t:%d:f> · 2.5h\n- **DM** - <@%s>\n- **Status** - Open\n- **APL** - 7\n- **Quest Link** - %s/quests/Q1a2b3c4d\n- **Event Link** - https://discord.com/events/1/2", testOrigin, testRole, testStart.Unix(), testDM, testOrigin)
	if err != nil || cut || got != want {
		t.Fatalf("announcement=%q cut=%v error=%v; want %q", got, cut, err, want)
	}
}

func TestQuestAnnouncementStatusesAndPendingEvent(t *testing.T) {
	for _, status := range []string{"open", "full", "played", "closed", "cancelled", "deleted"} {
		t.Run(status, func(t *testing.T) {
			got, _, err := delivery.BuildAnnouncement(delivery.AnnouncementInput{
				Title: "T", Status: status, ScheduledAt: testStart, DurationHours: 4, DMDiscordID: testDM, SignupURL: testOrigin + "/quests/Q1",
			})
			if err != nil {
				t.Fatal(err)
			}
			for _, line := range []string{"- **Status** - " + strings.ToUpper(status[:1]) + status[1:], "- **APL** - Any", "- **Event Link** - Pending"} {
				if !strings.Contains(got, line) {
					t.Errorf("announcement lacks %q: %q", line, got)
				}
			}
			if strings.Contains(got, "-# ") || strings.Contains(got, "Status:") {
				t.Fatalf("unexpected role or legacy status line: %q", got)
			}
		})
	}
}

func TestQuestAnnouncementUsesStoredAPLAndRestrictsMentions(t *testing.T) {
	f := newFakeDiscord(t)
	q := baseQuest("")
	if err := json.Unmarshal([]byte(`{"AvgPartyLevel":11}`), &q); err != nil {
		t.Fatal(err)
	}
	q.Brief = publicBrief("@everyone <@" + testDM + "> <@&999999999999999999>")
	if err := newSync(f, &fakeQuests{quest: q}, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	body := f.find(http.MethodPost, "/messages")[0].Body
	if !strings.Contains(body["content"].(string), "- **APL** - 11") {
		t.Fatalf("stored APL missing from announcement: %v", body)
	}
	mentions := body["allowed_mentions"].(map[string]any)
	roles, _ := mentions["roles"].([]any)
	if len(roles) != 1 || roles[0] != testRole || len(mentions) != 1 {
		t.Fatalf("only configured role may ping: %v", mentions)
	}
}

func TestQuestAnnouncementUnbrokenBriefKeepsEllipsisAndGameInformation(t *testing.T) {
	for _, body := range []string{strings.Repeat("x", 3000), strings.Repeat("🐉", 2000)} {
		in := delivery.AnnouncementInput{
			Title: "T", Status: "open", Body: body, ScheduledAt: testStart, DurationHours: 4,
			DMDiscordID: testDM, SignupURL: testOrigin + "/quests/Q1",
		}
		got, cut, err := delivery.BuildAnnouncement(in)
		parts := strings.SplitN(got, "\n\n", 3)
		if err != nil || !cut || discordLen(got) > delivery.DiscordMessageLimit || len(parts) != 3 || !strings.HasSuffix(parts[1], "…") || !strings.HasPrefix(parts[2], "## Game Information\n") || !strings.HasSuffix(got, "- **Event Link** - Pending") {
			t.Fatalf("truncated announcement=%q cut=%v error=%v", got, cut, err)
		}
	}
}

func TestQuestAnnouncementEllipsisFitsMinimalBriefBudget(t *testing.T) {
	in := delivery.AnnouncementInput{
		Title: "T", Status: "open", ScheduledAt: testStart, DurationHours: 4,
		DMDiscordID: testDM, SignupURL: testOrigin + "/quests/Q1",
	}
	fixed, _, err := delivery.BuildAnnouncement(in)
	if err != nil {
		t.Fatal(err)
	}
	in.Title += strings.Repeat("t", delivery.DiscordMessageLimit-discordLen(fixed)-3)
	in.Body = "Too long for this budget"
	got, cut, err := delivery.BuildAnnouncement(in)
	if err != nil || !cut || discordLen(got) != delivery.DiscordMessageLimit || !strings.Contains(got, "\n\n…\n\n## Game Information\n") {
		t.Fatalf("announcement=%q cut=%v error=%v", got, cut, err)
	}
	in.Title += "t"
	if _, _, err := delivery.BuildAnnouncement(in); err == nil {
		t.Fatal("a full information block with no room for an ellipsis must reject the announcement")
	}
}

func TestExternalQuestEventCreationAndVoiceTransitions(t *testing.T) {
	for _, tc := range []struct {
		name, voice, eventID string
	}{
		{"create_external", "", ""},
		{"voice_to_external", "", "existing-event"},
		{"external_to_voice", testVoice, "existing-event"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFakeDiscord(t)
			q := baseQuest(tc.voice)
			q.MessageID, q.ThreadID, q.EventID, q.DurationHours = "existing-message", "existing-thread", tc.eventID, 2.5
			quests := &fakeQuests{quest: q}
			if err := newSync(f, quests, fullSettings, nil).SyncQuest(context.Background(), testQuestID, 2); err != nil {
				t.Fatal(err)
			}
			method, suffix := http.MethodPost, "/scheduled-events"
			if tc.eventID != "" {
				method, suffix = http.MethodPatch, "/scheduled-events/"+tc.eventID
			}
			calls := f.find(method, suffix)
			if len(calls) != 1 {
				t.Fatalf("event changes=%v; all calls=%v", calls, f.summary())
			}
			body := calls[0].Body
			if body["privacy_level"] != float64(2) || body["scheduled_start_time"] != "2030-03-01T19:30:00Z" || body["scheduled_end_time"] != "2030-03-01T22:00:00Z" {
				t.Fatalf("event timing/privacy=%v", body)
			}
			channel, hasChannel := body["channel_id"]
			metadata, hasMetadata := body["entity_metadata"]
			if !hasChannel || !hasMetadata {
				t.Fatalf("type transitions must explicitly set channel and metadata: %v", body)
			}
			if tc.voice == "" {
				location, _ := metadata.(map[string]any)
				if body["entity_type"] != float64(3) || channel != nil || location["location"] != testOrigin+"/quests/Q1a2b3c4d" {
					t.Fatalf("external event=%v", body)
				}
			} else if body["entity_type"] != float64(2) || channel != testVoice || metadata != nil {
				t.Fatalf("voice event=%v", body)
			}
			if tc.eventID == "" {
				if quests.events != 1 || quests.quest.EventID == "" || quests.url != "https://discord.com/events/"+testGuild+"/"+quests.quest.EventID {
					t.Fatalf("created event not persisted: %+v", quests)
				}
				messages := f.find(http.MethodPatch, "/messages/existing-message")
				if !strings.Contains(messages[len(messages)-1].Body["content"].(string), "- **Event Link** - "+quests.url) {
					t.Fatalf("new event missing from announcement: %v", messages)
				}
			} else if quests.events != 0 || quests.quest.EventID != tc.eventID || len(f.find(http.MethodPost, "/scheduled-events")) != 0 {
				t.Fatalf("type conversion replaced event: %+v", quests)
			}
		})
	}
}

func TestExternalQuestEventLocationIsAtMost100Characters(t *testing.T) {
	f := newFakeDiscord(t)
	q := baseQuest("")
	settings := fullSettings
	settings.PublicOrigin += "/" + strings.Repeat("龍", 100)
	if err := newSync(f, &fakeQuests{quest: q}, settings, nil).SyncQuest(context.Background(), testQuestID, 1); err != nil {
		t.Fatal(err)
	}
	calls := f.find(http.MethodPost, "/scheduled-events")
	if len(calls) != 1 {
		t.Fatalf("event changes=%v", calls)
	}
	location := calls[0].Body["entity_metadata"].(map[string]any)["location"].(string)
	want := string([]rune(settings.PublicOrigin + "/quests/" + q.ShortCode)[:100])
	if !utf8.ValidString(location) || utf8.RuneCountInString(location) != 100 || location != want {
		t.Fatalf("location=%q", location)
	}
}
