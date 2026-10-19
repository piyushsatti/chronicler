package graph

import (
	"context"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestQuestReadGraphMapper(t *testing.T) {
	at := time.Date(2035, 1, 1, 12, 0, 0, 0, time.UTC)
	display := "live"
	docID := "doc-id"
	q := toQuestView(quest.QuestView{
		Id:            "public-id",
		ShortCode:     "Q-oracle",
		Kinds:         []string{"standard"},
		Status:        "open",
		DisplayStatus: &display,
		DurationHours: 1.5,
		DmId:          "dm-id",
		DocumentId:    &docID,
		ScheduledAt:   at,
		FilledCount:   2,
		SlotsMax:      5,
		CreatedBy:     "dm-id",
		CreatedAt:     at,
		UpdatedAt:     at,
		Tags:          []string{},
		Genres:        []string{},
		Regions:       []string{},
	})
	if q.Status != "open" || q.DisplayStatus == nil || *q.DisplayStatus != "live" || q.DurationHours != 1.5 || q.ID != "public-id" || q.DmID != "dm-id" || q.DocumentID == nil || *q.DocumentID != "doc-id" || !q.ScheduledAt.Equal(at) {
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
