package graph

import (
	"context"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestQuestReadGraphMapper(t *testing.T) {
	at := time.Date(2035, 1, 1, 12, 0, 0, 0, time.UTC)
	q := toQuest(quest.LegacyQuestView{ID: "public-id", ShortCode: "Q-oracle", Status: quest.Open, DisplayStatus: "live", DurationHours: 1.5, DMID: "dm-id", DocumentID: "doc-id", ScheduledAt: at, FilledCount: 2, SlotsMax: 5, DiscordDesiredRevision: 8, DiscordAppliedRevision: 3})
	if q.Status != "open" || q.DisplayStatus == nil || *q.DisplayStatus != "live" || q.DurationHours != 1.5 || q.ID != "public-id" || q.DmID != "dm-id" || q.DocumentID == nil || *q.DocumentID != "doc-id" || !q.ScheduledAt.Equal(at) || q.DiscordDelivery.DesiredRevision != 8 || q.DiscordDelivery.AppliedRevision != 3 {
		t.Fatalf("bad projection: %+v", q)
	}
}

func TestQuestReadsUnconfiguredResolver(t *testing.T) {
	r := &Resolver{}
	page, err := r.Query().Quests(context.Background(), nil, 20, 0)
	if err == nil || page != nil {
		t.Fatalf("unconfigured producer returned empty-success: page=%+v error=%v", page, err)
	}
}
