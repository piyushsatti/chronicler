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

func questSelectionFixture(t *testing.T) (questCloseFixture, []string) {
	t.Helper()
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, true)
	if _, err := f.fixture.Pool.Exec(context.Background(), `UPDATE quests SET slots_max=2 WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	ids := []string{"10000000-0000-4000-8000-000000000061", "20000000-0000-4000-8000-000000000061"}
	for _, id := range ids {
		addQuestWaiter(t, f, id, "active", time.Now().UTC())
	}
	return f, ids
}

func TestFrontendQuestSelectionCommitsCapacityOrderNoticesAndReplay(t *testing.T) {
	f, ids := questSelectionFixture(t)
	ctx := context.Background()
	input := SelectQuestParticipantsSpec{QuestId: f.questID, CharacterIds: []string{ids[1], ids[0]}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	selected, err := f.commands.SelectQuestParticipants(ctx, f.actor, input, meta)
	if err != nil || len(selected) != 2 || selected[0].CharacterId != ids[1] || selected[1].CharacterId != ids[0] || selected[0].Status != "signed_up" || selected[1].Status != "signed_up" {
		t.Fatalf("selection=%+v err=%v", selected, err)
	}
	var filled, signed, revision, notices int
	var status string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT filled_count,status,discord_desired_revision,(SELECT count(*) FROM quest_participants WHERE status='signed_up'),(SELECT count(*) FROM notifications) FROM quests WHERE public_id=$1`, f.questID).Scan(&filled, &status, &revision, &signed, &notices); err != nil {
		t.Fatal(err)
	}
	if filled != 2 || status != "full" || revision != 1 || signed != 2 || notices != 2 {
		t.Fatalf("filled=%d status=%s revision=%d signed=%d notices=%d", filled, status, revision, signed, notices)
	}
	before := questStorageSnapshot(t, f)
	if replayed, err := f.commands.SelectQuestParticipants(ctx, f.actor, input, meta); err != nil || len(replayed) != 2 || replayed[0].CharacterId != ids[1] {
		t.Fatalf("replay=%+v err=%v", replayed, err)
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("selection replay changed storage")
	}
	_, err = f.commands.SelectQuestParticipants(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Conflict)
	if questStorageSnapshot(t, f) != before {
		t.Fatal("duplicate selection committed effects")
	}
}

func TestFrontendQuestSelectionRejectsInvalidOrIneligibleSetAtomically(t *testing.T) {
	for _, failure := range []string{"duplicate", "limit", "retired", "pending", "deleted", "owner", "missing", "not_waitlisted", "capacity", "notice"} {
		t.Run(failure, func(t *testing.T) {
			f, ids := questSelectionFixture(t)
			ctx := context.Background()
			want := apierr.Conflict
			query := ""
			switch failure {
			case "duplicate":
				ids = []string{ids[0], ids[0]}
				want = apierr.Invalid
			case "limit":
				ids = make([]string, 101)
				for i := range ids {
					ids[i] = uuid.NewString()
				}
				want = apierr.Invalid
			case "retired":
				query = `UPDATE characters SET status='retired' WHERE public_id=$1`
			case "pending":
				query = `UPDATE characters SET status='pending_approval' WHERE public_id=$1`
			case "deleted":
				query = `UPDATE characters SET deleted_at=now() WHERE public_id=$1`
				want = apierr.NotFound
			case "owner":
				query = `UPDATE members SET status='banned' WHERE id=(SELECT owner_id FROM characters WHERE public_id=$1)`
			case "missing":
				ids[1] = uuid.NewString()
				want = apierr.NotFound
			case "not_waitlisted":
				query = `UPDATE quest_participants SET status='withdrawn' WHERE character_id=(SELECT id FROM characters WHERE public_id=$1)`
			case "capacity":
				query = `UPDATE quests SET slots_max=1 WHERE public_id=(SELECT q.public_id FROM quests q JOIN quest_participants p ON p.quest_id=q.id JOIN characters c ON c.id=p.character_id WHERE c.public_id=$1)`
			case "notice":
				if _, err := f.fixture.Pool.Exec(ctx, `CREATE FUNCTION reject_selection_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected inbox failure';END$$;CREATE TRIGGER reject_selection_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_selection_notice()`); err != nil {
					t.Fatal(err)
				}
			}
			if query != "" {
				if _, err := f.fixture.Pool.Exec(ctx, query, ids[1]); err != nil {
					t.Fatal(err)
				}
			}
			before := questStorageSnapshot(t, f)
			_, err := f.commands.SelectQuestParticipants(ctx, f.actor, SelectQuestParticipantsSpec{QuestId: f.questID, CharacterIds: ids}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			if failure == "notice" {
				if err == nil {
					t.Fatal("selection ignored inbox failure")
				}
			} else {
				assertQuestCloseCode(t, err, want)
			}
			if questStorageSnapshot(t, f) != before {
				t.Fatal("invalid selection committed capacity/roster/jobs/notices/receipt")
			}
		})
	}
}

func TestFrontendQuestSelectionLocksCharactersBeforeQuestAndUsesCurrentFacts(t *testing.T) {
	f, ids := questSelectionFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	tx, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck
	if _, err := tx.Exec(ctx, `UPDATE characters SET status='retired' WHERE public_id=$1`, ids[0]); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := f.commands.SelectQuestParticipants(ctx, f.actor, SelectQuestParticipantsSpec{QuestId: f.questID, CharacterIds: []string{ids[1], ids[0]}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		result <- err
	}()
	waitForQuestQueryLock(t, ctx, f, "-- name: CharacterProductLockAdmissions")
	probe, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := probe.Exec(ctx, `SELECT id FROM quests WHERE public_id=$1 FOR UPDATE NOWAIT`, f.questID); err != nil {
		t.Fatal("selection locked Quest before waiting for Characters", err)
	}
	if err := probe.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	before := questStorageSnapshot(t, f)
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	assertQuestCloseCode(t, <-result, apierr.Conflict)
	if questStorageSnapshot(t, f) != before {
		t.Fatal("selection ignored Character change committed during lock wait")
	}
}
