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

func TestFrontendQuestUpdateRechecksOwnerAfterLockWait(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	other := seedQuestArcDM(t, ctx, f.fixture)
	tx, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck
	at := time.Now().UTC().Truncate(time.Microsecond).Add(time.Second)
	if _, err := tx.Exec(ctx, `UPDATE quests SET dm_id=(SELECT id FROM members WHERE public_id=$1),updated_at=$2 WHERE public_id=$3`, other, at, f.questID); err != nil {
		t.Fatal(err)
	}
	title := "Unauthorized stale-owner replacement"
	input := UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{ExpectedUpdatedAt: at, Title: product.Optional[string]{Set: true, Value: &title}}}
	result := make(chan error, 1)
	go func() {
		_, err := f.commands.UpdateQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		result <- err
	}()
	waitForQuestQueryLock(t, ctx, f, "-- name: ProductQuestLockByID")
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	before := f.snapshot(t)
	assertQuestCloseCode(t, <-result, apierr.Forbidden)
	if f.snapshot(t) != before {
		t.Fatal("stale owner update committed effects")
	}
	var actualTitle string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT d.title FROM quests q JOIN documents d ON d.id=q.document_id WHERE q.public_id=$1`, f.questID).Scan(&actualTitle); err != nil {
		t.Fatal(err)
	}
	if actualTitle != "Close Quest" {
		t.Fatalf("brief changed to %q", actualTitle)
	}
}

func TestFrontendQuestRestoreUsesStoredOwner(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	other := seedQuestArcDM(t, ctx, f.fixture)
	commands, members := newQuestCommandHarness(t, f.fixture)
	actor, err := members.ResolveAuthority(ctx, other)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET deleted_at=now() WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	before := f.snapshot(t)
	_, err = commands.RestoreQuest(ctx, actor, RestoreQuestSpec{QuestId: f.questID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	if f.snapshot(t) != before {
		t.Fatal("unrelated DM restored Quest")
	}
	restored, err := commands.RestoreQuest(ctx, f.actor, RestoreQuestSpec{QuestId: f.questID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || restored.Id != f.questID {
		t.Fatalf("restore=%+v err=%v", restored, err)
	}
}

func TestFrontendQuestUpdateRefreshesAuthorityAfterLockWait(t *testing.T) {
	for _, change := range []string{"revoked", "changed"} {
		t.Run(change, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			tx, err := f.fixture.Pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(context.Background()) //nolint:errcheck
			if _, err := tx.Exec(ctx, `SELECT id FROM quests WHERE public_id=$1 FOR UPDATE`, f.questID); err != nil {
				t.Fatal(err)
			}
			title := "Stale authority title"
			result := make(chan error, 1)
			go func() {
				_, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: f.questID, Input: QuestEditFields{Title: product.Optional[string]{Set: true, Value: &title}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
				result <- err
			}()
			waitForQuestQueryLock(t, ctx, f, "-- name: ProductQuestLockByID")
			query := `UPDATE members SET status='banned' WHERE public_id=$1`
			want := apierr.Forbidden
			if change == "changed" {
				query = `UPDATE dm_profiles SET status='rejected' WHERE member_id=(SELECT id FROM members WHERE public_id=$1)`
				want = apierr.Conflict
			}
			if _, err := f.fixture.Pool.Exec(ctx, query, f.actor.Claims().MemberID); err != nil {
				t.Fatal(err)
			}
			before := questStorageSnapshot(t, f)
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			assertQuestCloseCode(t, <-result, want)
			if questStorageSnapshot(t, f) != before {
				t.Fatal("changed current authority committed effects or receipt")
			}
		})
	}
}

func TestFrontendQuestRestoreReplayKeepsReceiptAndCurrentOwnerAdmission(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET deleted_at=now() WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	input := RestoreQuestSpec{QuestId: f.questID}
	if _, err := f.commands.RestoreQuest(ctx, f.actor, input, meta); err != nil {
		t.Fatal(err)
	}
	before := questStorageSnapshot(t, f)
	if _, err := f.commands.RestoreQuest(ctx, f.actor, input, meta); err != nil {
		t.Fatal(err)
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("restore replay changed storage")
	}
	other := seedQuestArcDM(t, ctx, f.fixture)
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET dm_id=(SELECT id FROM members WHERE public_id=$1) WHERE public_id=$2`, other, f.questID); err != nil {
		t.Fatal(err)
	}
	before = questStorageSnapshot(t, f)
	_, err := f.commands.RestoreQuest(ctx, f.actor, input, meta)
	assertQuestCloseCode(t, err, apierr.Forbidden)
	if questStorageSnapshot(t, f) != before {
		t.Fatal("revoked-owner replay changed storage")
	}
}

func TestFrontendQuestCloseRejectsLedgerAndCacheOverflow(t *testing.T) {
	for _, target := range []string{"ledger", "cache"} {
		t.Run(target, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			ctx := context.Background()
			query := `UPDATE character_progression_ledger SET delta=2147483647`
			if target == "cache" {
				query = `UPDATE characters SET player_xp=2147483647`
			}
			if _, err := f.fixture.Pool.Exec(ctx, query); err != nil {
				t.Fatal(err)
			}
			before := f.snapshot(t)
			_, err := f.commands.CloseQuest(ctx, f.actor, f.input(), product.CommandMeta{IdempotencyKey: uuid.NewString()})
			assertQuestCloseCode(t, err, apierr.Conflict)
			if f.snapshot(t) != before {
				t.Fatal("overflow committed partial closure")
			}
		})
	}
}
