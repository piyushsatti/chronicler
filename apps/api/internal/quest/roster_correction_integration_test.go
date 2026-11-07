//go:build integration

package quest

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// TestRosterCorrectionSyncsDiscord checks that seating or unseating a player bumps the
// Discord revision in the same transaction, and that a second remove of an already
// withdrawn player does not.
func TestRosterCorrectionSyncsDiscord(t *testing.T) {
	f := bumpQuest(t, lastGamePlayedSignup, 1)
	character := bumpPlayer(t, f)
	ctx := context.Background()
	added, err := f.commands.AddQuestParticipant(ctx, f.actor, CorrectQuestRosterSpec{QuestId: f.questID, CharacterId: character}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || added.Status != "signed_up" {
		t.Fatalf("add=%+v err=%v", added, err)
	}
	assertRosterCorrection(t, f, character, 1, "full", "signed_up", 1)

	removed, err := f.commands.RemoveQuestParticipant(ctx, f.actor, CorrectQuestRosterSpec{QuestId: f.questID, CharacterId: character}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || removed.Status != "withdrawn" {
		t.Fatalf("remove=%+v err=%v", removed, err)
	}
	assertRosterCorrection(t, f, character, 0, "open", "withdrawn", 2)

	again, err := f.commands.RemoveQuestParticipant(ctx, f.actor, CorrectQuestRosterSpec{QuestId: f.questID, CharacterId: character}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || again.Status != "withdrawn" {
		t.Fatalf("second remove=%+v err=%v", again, err)
	}
	assertRosterCorrection(t, f, character, 0, "open", "withdrawn", 2)
}

// TestRemoveDeletedCharacterFreesSeat checks that staff can withdraw a soft-deleted
// character who still holds the only seat, so a later add is accepted.
func TestRemoveDeletedCharacterFreesSeat(t *testing.T) {
	f := bumpQuest(t, lastGamePlayedSignup, 1)
	character := bumpPlayer(t, f)
	ctx := context.Background()
	if got := bumpSignup(t, f, character).Status; got != "waitlisted" {
		t.Fatalf("signup=%s want waitlisted", got)
	}
	markSeated(t, f, character)
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE characters SET deleted_at=now() WHERE public_id=$1::uuid`, character); err != nil {
		t.Fatal(err)
	}
	removed, err := f.commands.RemoveQuestParticipant(ctx, f.actor, CorrectQuestRosterSpec{QuestId: f.questID, CharacterId: character}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || removed.Status != "withdrawn" {
		t.Fatalf("remove deleted=%+v err=%v", removed, err)
	}
	assertRosterCorrection(t, f, character, 0, "open", "withdrawn", 1)

	other := bumpPlayer(t, f)
	added, err := f.commands.AddQuestParticipant(ctx, f.actor, CorrectQuestRosterSpec{QuestId: f.questID, CharacterId: other}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || added.Status != "signed_up" {
		t.Fatalf("add after free=%+v err=%v", added, err)
	}
	assertRosterCorrection(t, f, other, 1, "full", "signed_up", 2)
}

func assertRosterCorrection(t *testing.T, f questCloseFixture, character string, wantFilled int, wantQuest, wantParticipant string, wantRevision int) {
	t.Helper()
	var filled, revision int
	var questStatus, participant string
	err := f.fixture.Pool.QueryRow(context.Background(), `SELECT q.filled_count,q.status,q.discord_desired_revision,p.status
		FROM quests q
		JOIN quest_participants p ON p.quest_id=q.id
		JOIN characters c ON c.id=p.character_id
		WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, f.questID, character).Scan(&filled, &questStatus, &revision, &participant)
	if err != nil {
		t.Fatal(err)
	}
	if filled != wantFilled || questStatus != wantQuest || participant != wantParticipant || revision != wantRevision {
		t.Fatalf("filled=%d status=%s participant=%s revision=%d, want filled=%d status=%s participant=%s revision=%d", filled, questStatus, participant, revision, wantFilled, wantQuest, wantParticipant, wantRevision)
	}
}
