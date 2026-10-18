package graph

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestQuestViewMapsDiscordDelivery(t *testing.T) {
	got := toQuestV2(quest.LegacyQuestView{
		ID:                     "q",
		Status:                 quest.Open,
		DiscordDesiredRevision: 3,
		DiscordAppliedRevision: 1,
	})
	if got.DiscordDelivery == nil {
		t.Fatal("discordDelivery is nil")
	}
	if got.DiscordDelivery.DesiredRevision != 3 || got.DiscordDelivery.AppliedRevision != 1 {
		t.Fatalf("delivery=%+v", got.DiscordDelivery)
	}
}
