//go:build integration

package quest

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestUpdateQuestCapacityReopensAndFillsQuest(t *testing.T) {
	for _, tc := range []struct {
		status, want     string
		filled, capacity int32
	}{
		{"full", "open", 5, 8},
		{"open", "full", 3, 3},
		{"played", "played", 1, 8},
		{"closed", "closed", 1, 8},
		{"cancelled", "cancelled", 1, 8},
	} {
		t.Run(tc.status, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			setQuestPreplay(t, f, true)
			ctx := context.Background()
			for range tc.filled {
				addQuestWaiter(t, f, uuid.NewString(), "active", time.Now().UTC())
			}
			if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quest_participants SET status='signed_up' WHERE quest_id=(SELECT id FROM quests WHERE public_id=$1)`, f.questID); err != nil {
				t.Fatal(err)
			}
			var original time.Time
			if err := f.fixture.Pool.QueryRow(ctx, `UPDATE quests SET status=$2,slots_max=5,filled_count=$3 WHERE public_id=$1 RETURNING updated_at`, f.questID, tc.status, tc.filled).Scan(&original); err != nil {
				t.Fatal(err)
			}
			edited, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{
				ExpectedUpdatedAt: original, SlotsMax: product.Optional[int32]{Set: true, Value: &tc.capacity},
			}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			if err != nil {
				t.Fatal(err)
			}
			if edited.Status != tc.want || edited.SlotsMax != tc.capacity || edited.FilledCount != tc.filled {
				t.Fatalf("capacity edit=%s %d/%d, want %s %d/%d", edited.Status, edited.FilledCount, edited.SlotsMax, tc.want, tc.filled, tc.capacity)
			}
			if tc.want == "open" {
				owner := questCharacterActor(t, f, f.characterID)
				joined, err := f.commands.SignupForQuest(ctx, owner, SignupForQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
				if err != nil || joined.Status != "waitlisted" {
					t.Fatalf("signup after reopening=%+v err=%v", joined, err)
				}
			}
		})
	}
}

func TestUpdateQuestRejectsCapacityBelowSignupCountAtomically(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, false)
	ctx := context.Background()
	addQuestWaiter(t, f, uuid.NewString(), "active", time.Now().UTC())
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quest_participants SET status='signed_up' WHERE quest_id=(SELECT id FROM quests WHERE public_id=$1)`, f.questID); err != nil {
		t.Fatal(err)
	}
	var original time.Time
	if err := f.fixture.Pool.QueryRow(ctx, `UPDATE quests SET slots_max=2,filled_count=2 WHERE public_id=$1 RETURNING updated_at`, f.questID).Scan(&original); err != nil {
		t.Fatal(err)
	}
	before := questStorageSnapshot(t, f)
	slots, title, body := int32(1), "Must not save title", "Must not save brief"
	_, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{
		ExpectedUpdatedAt: original, SlotsMax: product.Optional[int32]{Set: true, Value: &slots},
		Title: product.Optional[string]{Set: true, Value: &title}, BriefBody: product.Optional[string]{Set: true, Value: &body},
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Invalid)
	if after := questStorageSnapshot(t, f); after != before {
		t.Fatal("invalid capacity committed quest, brief, revisions, jobs, notices, or receipt changes")
	}
}

func TestUpdateQuestDMPickOverCap(t *testing.T) {
	t.Run("rejects leaving dm pick", func(t *testing.T) {
		f := newQuestCloseFixture(t)
		setQuestPreplay(t, f, false)
		ctx := context.Background()
		var original time.Time
		if err := f.fixture.Pool.QueryRow(ctx, `UPDATE quests SET signup_type='dm_pick', slots_max=1, filled_count=3 WHERE public_id=$1 RETURNING updated_at`, f.questID).Scan(&original); err != nil {
			t.Fatal(err)
		}
		lastGame := "last_game_played"
		_, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{
			ExpectedUpdatedAt: original, SignupType: product.Optional[string]{Set: true, Value: &lastGame},
		}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		assertQuestCloseCode(t, err, apierr.Invalid)
		if err.Error() != "INVALID: quest capacity exceeded" {
			t.Fatalf("error=%v", err)
		}
		var signup string
		var slots, filled int
		if err := f.fixture.Pool.QueryRow(ctx, `SELECT signup_type, slots_max, filled_count FROM quests WHERE public_id=$1`, f.questID).Scan(&signup, &slots, &filled); err != nil {
			t.Fatal(err)
		}
		if signup != "dm_pick" || slots != 1 || filled != 3 {
			t.Fatalf("quest=%s %d/%d, want dm_pick 3/1", signup, filled, slots)
		}
	})
	t.Run("allows a higher cap still under filled", func(t *testing.T) {
		f := newQuestCloseFixture(t)
		setQuestPreplay(t, f, false)
		ctx := context.Background()
		var original time.Time
		if err := f.fixture.Pool.QueryRow(ctx, `UPDATE quests SET signup_type='dm_pick', slots_max=1, filled_count=4 WHERE public_id=$1 RETURNING updated_at`, f.questID).Scan(&original); err != nil {
			t.Fatal(err)
		}
		slots := int32(3)
		edited, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{
			ExpectedUpdatedAt: original, SlotsMax: product.Optional[int32]{Set: true, Value: &slots},
		}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		if err != nil || edited.SlotsMax != 3 || edited.FilledCount != 4 || edited.SignupType == nil || *edited.SignupType != "dm_pick" {
			t.Fatalf("edited=%+v err=%v", edited, err)
		}
	})
}

func TestUpdateQuestPreservesOmittedAndNullCapacity(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, false)
	ctx := context.Background()
	var original time.Time
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT updated_at FROM quests WHERE public_id=$1`, f.questID).Scan(&original); err != nil {
		t.Fatal(err)
	}
	for _, slots := range []product.Optional[int32]{{}, {Set: true}} {
		edited, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{
			ExpectedUpdatedAt: original, SlotsMax: slots,
		}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		if err != nil {
			t.Fatal(err)
		}
		if edited.Status != "full" || edited.SlotsMax != 1 || edited.FilledCount != 1 {
			t.Fatalf("omitted/null capacity edit=%s %d/%d, want full 1/1", edited.Status, edited.FilledCount, edited.SlotsMax)
		}
		original = edited.UpdatedAt
	}
}
