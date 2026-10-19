package graph

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestQuestViewMapsDiscordDelivery(t *testing.T) {
	jobID := "job-1"
	got := toQuestDiscordDeliveryType(quest.QuestDiscordDeliveryView{
		JobId:           &jobID,
		DesiredRevision: 3,
		AppliedRevision: 1,
		OverallStatus:   "pending",
	})
	if got == nil {
		t.Fatal("discordDelivery is nil")
	}
	if got.DesiredRevision != 3 || got.AppliedRevision != 1 || got.OverallStatus != "pending" || got.JobID == nil || *got.JobID != jobID {
		t.Fatalf("delivery=%+v", got)
	}
}
