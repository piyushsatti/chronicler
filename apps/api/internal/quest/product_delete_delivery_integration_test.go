//go:build integration

package quest

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestDeleteQuestEnqueuesTerminalDiscordRevisionAtomically(t *testing.T) {
	t.Run("commit_and_replay", func(t *testing.T) {
		f := newQuestCloseFixture(t)
		ctx := context.Background()
		if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET discord_desired_revision=7,
			discord_message_id='123456789',discord_event_id='234567890',discord_thread_id='345678901' WHERE public_id=$1`, f.questID); err != nil {
			t.Fatal(err)
		}
		meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		input := DeleteQuestSpec{QuestId: f.questID}
		if _, err := f.commands.DeleteQuest(ctx, f.actor, input, meta); err != nil {
			t.Fatal(err)
		}
		var deleted bool
		var desired, queued, payloadRevision, receipts int
		var payloadPublicID string
		if err := f.fixture.Pool.QueryRow(ctx, `SELECT deleted_at IS NOT NULL,discord_desired_revision,
			(SELECT count(*) FROM background_jobs WHERE job_key=$2),
			(SELECT (payload->>'desired_revision')::int FROM background_jobs WHERE job_key=$2),
			(SELECT payload->>'public_id' FROM background_jobs WHERE job_key=$2),
			(SELECT count(*) FROM idempotency_keys) FROM quests WHERE public_id=$1`,
			f.questID, jobs.QuestDiscordKey(f.questID)).Scan(&deleted, &desired, &queued, &payloadRevision, &payloadPublicID, &receipts); err != nil {
			t.Fatal(err)
		}
		if !deleted || desired != 8 || queued != 1 || payloadRevision != 8 || payloadPublicID != f.questID || receipts != 1 {
			t.Fatalf("deleted=%v desired=%d jobs=%d payload=%s/%d receipts=%d", deleted, desired, queued, payloadPublicID, payloadRevision, receipts)
		}
		snapshot, err := delivery.NewPostgresRevisionApplier(f.fixture.Pool.Pool).LoadAnnounceQuest(ctx, f.questID)
		if err != nil || snapshot.MessageID != "123456789" || snapshot.EventID != "234567890" || snapshot.ThreadID != "345678901" {
			t.Fatalf("tombstoned delivery snapshot=%+v error=%v", snapshot, err)
		}
		before := f.snapshot(t)
		if _, err := f.commands.DeleteQuest(ctx, f.actor, input, meta); err != nil {
			t.Fatalf("delete replay: %v", err)
		}
		if f.snapshot(t) != before {
			t.Fatal("delete replay changed persisted state")
		}
		_, err = f.commands.DeleteQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		assertQuestCloseCode(t, err, apierr.NotFound)
		if f.snapshot(t) != before {
			t.Fatal("second delete changed persisted state")
		}
	})
	for _, table := range []string{"quests", "background_jobs", "idempotency_keys"} {
		t.Run("rollback_"+table, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			ctx := context.Background()
			before := f.snapshot(t)
			when := ""
			operation := "INSERT OR UPDATE"
			if table == "quests" {
				when = " WHEN (NEW.deleted_at IS NOT NULL)"
			} else if table == "idempotency_keys" {
				operation = "UPDATE"
			}
			if _, err := f.fixture.Pool.Exec(ctx, fmt.Sprintf(`CREATE FUNCTION fail_delete_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected delete failure'; END $$;
				CREATE TRIGGER fail_delete_effect BEFORE %s ON %s FOR EACH ROW%s EXECUTE FUNCTION fail_delete_effect()`, operation, pgx.Identifier{table}.Sanitize(), when)); err != nil {
				t.Fatal(err)
			}
			_, err := f.commands.DeleteQuest(ctx, f.actor, DeleteQuestSpec{QuestId: f.questID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			if err == nil {
				t.Fatal("injected delete failure succeeded")
			}
			if f.snapshot(t) != before {
				t.Fatal("failed delete committed partial state")
			}
		})
	}
}
