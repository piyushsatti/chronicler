//go:build integration

package quest

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestQuestRosterAndDeliveryPreserveEditorVersion(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, true)
	ctx := context.Background()
	original := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET updated_at=$2 WHERE public_id=$1`, f.questID, original); err != nil {
		t.Fatal(err)
	}
	owner := questCharacterActor(t, f, f.characterID)
	joined, err := f.commands.SignupForQuest(ctx, owner, SignupForQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || joined.Status != "waitlisted" {
		t.Fatalf("signup=%+v err=%v", joined, err)
	}
	queries := dbgen.New(f.fixture.Pool)
	questID := db.MustUUID(f.questID)
	for _, step := range []struct {
		name string
		work func() error
	}{
		{"signup", func() error { return nil }},
		{"message", func() error {
			return queries.SetQuestDiscordMessageID(ctx, dbgen.SetQuestDiscordMessageIDParams{PublicID: questID, DiscordMessageID: pgtype.Text{String: "123456789", Valid: true}})
		}},
		{"revision", func() error {
			return queries.ApplyQuestDiscordRevision(ctx, dbgen.ApplyQuestDiscordRevisionParams{PublicID: questID, Desired: 1})
		}},
	} {
		if err := step.work(); err != nil {
			t.Fatalf("%s bookkeeping: %v", step.name, err)
		}
		var version time.Time
		if err := f.fixture.Pool.QueryRow(ctx, `SELECT updated_at FROM quests WHERE public_id=$1`, f.questID).Scan(&version); err != nil {
			t.Fatal(err)
		}
		if !version.Equal(original) {
			t.Fatalf("%s moved editor version to %s, want %s", step.name, version, original)
		}
	}
	title := "Edited after signup and delivery"
	edited, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{
		ExpectedUpdatedAt: original, Title: product.Optional[string]{Set: true, Value: &title},
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatalf("edit with original version: %v", err)
	}
	if !edited.UpdatedAt.After(original) {
		t.Fatalf("real edit kept version %s", edited.UpdatedAt)
	}
}
