//go:build integration

package quest

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

func questCharacterActor(t *testing.T, f questCloseFixture, characterID string) auth.Authority {
	t.Helper()
	ctx := context.Background()
	var owner string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT m.public_id::text FROM characters c JOIN members m ON m.id=c.owner_id WHERE c.public_id=$1`, characterID).Scan(&owner); err != nil {
		t.Fatal(err)
	}
	_, members := newQuestCommandHarness(t, f.fixture)
	actor, err := members.ResolveAuthority(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	return actor
}

func addQuestWaiter(t *testing.T, f questCloseFixture, id, status string, at time.Time) string {
	t.Helper()
	ctx := context.Background()
	owner := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,status) VALUES($1::uuid,$1::text,$1::text,'Waiting Player','active')`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status) SELECT $1::uuid,$1::text,'Waiting Character',id,$3 FROM members WHERE public_id=$2`, id, owner, status); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status,created_at,updated_at)
		SELECT q.id,c.id,c.owner_id,'waitlisted',$3,$3 FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, f.questID, id, at); err != nil {
		t.Fatal(err)
	}
	return owner
}

func setQuestPreplay(t *testing.T, f questCloseFixture, empty bool) {
	t.Helper()
	ctx := context.Background()
	if empty {
		if _, err := f.fixture.Pool.Exec(ctx, `DELETE FROM quest_participants`); err != nil {
			t.Fatal(err)
		}
	}
	status, filled := "full", 1
	if empty {
		status, filled = "open", 0
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET status=$2,slots_max=1,filled_count=$3,scheduled_at=now()+interval '1 day' WHERE public_id=$1`, f.questID, status, filled); err != nil {
		t.Fatal(err)
	}
}

func TestFrontendQuestSignupOwnershipEligibilityReplayAndCapacity(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, true)
	ctx := context.Background()
	owner := questCharacterActor(t, f, f.characterID)
	input := SignupForQuestSpec{QuestId: f.questID, CharacterId: f.characterID}
	for _, actor := range []auth.Authority{f.actor} {
		before := f.snapshot(t)
		_, err := f.commands.SignupForQuest(ctx, actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		assertQuestCloseCode(t, err, apierr.Forbidden)
		if f.snapshot(t) != before {
			t.Fatal("nonowner signup changed state")
		}
	}
	adminID := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1::uuid,$1::text,$1::text,'Admin',ARRAY['admin'])`, adminID); err != nil {
		t.Fatal(err)
	}
	_, members := newQuestCommandHarness(t, f.fixture)
	admin, err := members.ResolveAuthority(ctx, adminID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.commands.SignupForQuest(ctx, admin, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	joined, err := f.commands.SignupForQuest(ctx, owner, input, meta)
	if err != nil || joined.Status != "waitlisted" {
		t.Fatalf("signup=%+v err=%v", joined, err)
	}
	before := f.snapshot(t)
	replay, err := f.commands.SignupForQuest(ctx, owner, input, meta)
	a, _ := json.Marshal(joined)
	b, _ := json.Marshal(replay)
	if err != nil || string(a) != string(b) || f.snapshot(t) != before {
		t.Fatalf("signup replay=%+v err=%v", replay, err)
	}
	_, err = f.commands.SignupForQuest(ctx, owner, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Conflict)
	if f.snapshot(t) != before {
		t.Fatal("new-key duplicate changed state")
	}
	var count, filled, notices int
	var status string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT q.filled_count,q.status,(SELECT count(*) FROM quest_participants WHERE quest_id=q.id AND status='waitlisted'),(SELECT count(*) FROM notifications WHERE member_id=(SELECT id FROM members WHERE public_id=$2)) FROM quests q WHERE q.public_id=$1`, f.questID, owner.Claims().MemberID).Scan(&filled, &status, &count, &notices); err != nil {
		t.Fatal(err)
	}
	if filled != 0 || status != "open" || count != 1 || notices != 1 {
		t.Fatalf("filled=%d status=%s waitlisted=%d notices=%d", filled, status, count, notices)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE characters SET status='retired' WHERE public_id=$1`, f.characterID); err != nil {
		t.Fatal(err)
	}
	_, err = f.commands.SignupForQuest(ctx, owner, input, meta)
	if err != nil {
		t.Fatalf("completed signup replay incorrectly reran eligibility: %v", err)
	}
}

func TestFrontendQuestWaitlistedWithdrawalDoesNotReleaseCapacity(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, false)
	ctx := context.Background()
	waiting := uuid.NewString()
	addQuestWaiter(t, f, waiting, "active", time.Now().UTC())
	owner := questCharacterActor(t, f, waiting)
	input := WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: waiting}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	withdrawn, err := f.commands.WithdrawFromQuest(ctx, owner, input, meta)
	if err != nil || withdrawn.Status != "withdrawn" {
		t.Fatalf("withdraw=%+v err=%v", withdrawn, err)
	}
	before := f.snapshot(t)
	if _, err := f.commands.WithdrawFromQuest(ctx, owner, input, meta); err != nil {
		t.Fatal(err)
	}
	if f.snapshot(t) != before {
		t.Fatal("withdraw replay changed state")
	}
	if _, err := f.commands.WithdrawFromQuest(ctx, owner, input, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	var filled, revision, notices, receipts int
	var status string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT filled_count,status,discord_desired_revision,(SELECT count(*) FROM notifications),(SELECT count(*) FROM idempotency_keys) FROM quests WHERE public_id=$1`, f.questID).Scan(&filled, &status, &revision, &notices, &receipts); err != nil {
		t.Fatal(err)
	}
	if filled != 1 || status != "full" || revision != 0 || notices != 0 || receipts != 2 {
		t.Fatalf("filled=%d status=%s revision=%d notices=%d receipts=%d", filled, status, revision, notices, receipts)
	}
}

func TestFrontendQuestWithdrawalPromotesEligibleFIFOAndNotifiesOwner(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, false)
	ctx := context.Background()
	at := time.Now().UTC().Truncate(time.Microsecond)
	const first = "10000000-0000-4000-8000-000000000050"
	const second = "20000000-0000-4000-8000-000000000050"
	addQuestWaiter(t, f, uuid.NewString(), "retired", at.Add(-time.Hour))
	addQuestWaiter(t, f, second, "active", at)
	promotedOwner := addQuestWaiter(t, f, first, "active", at)
	owner := questCharacterActor(t, f, f.characterID)
	input := WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: f.characterID}
	_, err := f.commands.WithdrawFromQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['admin'] WHERE public_id=$1`, f.actor.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	_, err = f.commands.WithdrawFromQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	withdrawn, err := f.commands.WithdrawFromQuest(ctx, owner, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || withdrawn.Status != "withdrawn" {
		t.Fatalf("withdraw=%+v err=%v", withdrawn, err)
	}
	var filled, count, notices int
	var promoted, remaining, recipient string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT q.filled_count,(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND p.status='signed_up'),
		(SELECT p.status FROM quest_participants p JOIN characters c ON c.id=p.character_id WHERE p.quest_id=q.id AND c.public_id=$2),
		(SELECT p.status FROM quest_participants p JOIN characters c ON c.id=p.character_id WHERE p.quest_id=q.id AND c.public_id=$3),
		(SELECT count(*) FROM notifications),(SELECT m.public_id::text FROM notifications n JOIN members m ON m.id=n.member_id LIMIT 1)
		FROM quests q WHERE q.public_id=$1`, f.questID, first, second).Scan(&filled, &count, &promoted, &remaining, &notices, &recipient); err != nil {
		t.Fatal(err)
	}
	if filled != 1 || count != 1 || promoted != "signed_up" || remaining != "waitlisted" || notices != 1 || recipient != promotedOwner {
		t.Fatalf("filled=%d signed_up=%d promoted=%s remaining=%s notices=%d recipient=%s", filled, count, promoted, remaining, notices, recipient)
	}
}

func TestFrontendQuestParticipationNotificationFailureRollsBack(t *testing.T) {
	for _, operation := range []string{"signup", "withdraw"} {
		t.Run(operation, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			ctx := context.Background()
			setQuestPreplay(t, f, operation == "signup")
			if operation == "withdraw" {
				addQuestWaiter(t, f, uuid.NewString(), "active", time.Now().UTC())
			}
			owner := questCharacterActor(t, f, f.characterID)
			if _, err := f.fixture.Pool.Exec(ctx, `CREATE FUNCTION reject_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'notice failure';END$$;CREATE TRIGGER reject_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_notice()`); err != nil {
				t.Fatal(err)
			}
			before := f.snapshot(t)
			meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
			var err error
			if operation == "signup" {
				_, err = f.commands.SignupForQuest(ctx, owner, SignupForQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, meta)
			} else {
				_, err = f.commands.WithdrawFromQuest(ctx, owner, WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, meta)
			}
			if err == nil {
				t.Fatal("notification failure committed")
			}
			if f.snapshot(t) != before {
				t.Fatal("notification failure left partial participation/capacity/job/receipt effects")
			}
		})
	}
}

func TestFrontendQuestConcurrentSignupsBothWaitlist(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, true)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	other := uuid.NewString()
	addQuestWaiter(t, f, other, "active", time.Now().UTC())
	if _, err := f.fixture.Pool.Exec(ctx, `DELETE FROM quest_participants WHERE character_id=(SELECT id FROM characters WHERE public_id=$1)`, other); err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	for _, id := range []string{f.characterID, other} {
		actor := questCharacterActor(t, f, id)
		go func(actor auth.Authority, id string) {
			_, err := f.commands.SignupForQuest(ctx, actor, SignupForQuestSpec{QuestId: f.questID, CharacterId: id}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			results <- err
		}(actor, id)
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	var filled, signedUp, waiting, notices int
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT q.filled_count,
		(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND p.status='signed_up'),
		(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND p.status='waitlisted'),
		(SELECT count(*) FROM notifications) FROM quests q WHERE q.public_id=$1`, f.questID).Scan(&filled, &signedUp, &waiting, &notices); err != nil {
		t.Fatal(err)
	}
	if filled != 0 || signedUp != 0 || waiting != 2 || notices != 2 {
		t.Fatalf("filled=%d signed_up=%d waitlisted=%d notices=%d", filled, signedUp, waiting, notices)
	}
}

func TestFrontendQuestSignupRejectsIneligibleAndTerminal(t *testing.T) {
	for _, state := range []string{"pending_approval", "retired", "dead", "played", "closed", "cancelled"} {
		t.Run(state, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			setQuestPreplay(t, f, true)
			ctx := context.Background()
			actor := questCharacterActor(t, f, f.characterID)
			query := `UPDATE characters SET status=$1 WHERE public_id=$2`
			id := f.characterID
			if state == "played" || state == "closed" || state == "cancelled" {
				query = `UPDATE quests SET status=$1 WHERE public_id=$2`
				id = f.questID
			}
			if _, err := f.fixture.Pool.Exec(ctx, query, state, id); err != nil {
				t.Fatal(err)
			}
			before := f.snapshot(t)
			_, err := f.commands.SignupForQuest(ctx, actor, SignupForQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			assertQuestCloseCode(t, err, apierr.Conflict)
			if f.snapshot(t) != before {
				t.Fatal("invalid signup changed state")
			}
		})
	}
}

type questChurnWithdrawal struct {
	character.QuestWithdrawalWriter
	afterPlan func()
	planned   bool
}

func (w *questChurnWithdrawal) PlanOwnedCharacterWithdrawal(ctx context.Context, id string, questIDs []string) (character.WithdrawalPlan, error) {
	plan, err := w.QuestWithdrawalWriter.PlanOwnedCharacterWithdrawal(ctx, id, questIDs)
	if err == nil && !w.planned {
		w.planned = true
		w.afterPlan()
	}
	return plan, err
}

type questChurnRunner struct {
	uow.Runner[ProductCommandRepos]
	afterLock func()
}

func (r questChurnRunner) Do(ctx context.Context, fn func(ProductCommandRepos) error) error {
	return r.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		repos.Withdrawals = &questChurnWithdrawal{QuestWithdrawalWriter: repos.Withdrawals, afterPlan: r.afterLock}
		return fn(repos)
	})
}

func TestFrontendQuestWithdrawalReplansBoundedRosterDrift(t *testing.T) {
	for _, changes := range []int{1, 3} {
		t.Run(string(rune('0'+changes)), func(t *testing.T) {
			f := newQuestCloseFixture(t)
			setQuestPreplay(t, f, false)
			ctx := context.Background()
			actor := questCharacterActor(t, f, f.characterID)
			calls := 0
			lastExternal := ""
			f.commands.Runner = questChurnRunner{Runner: f.commands.Runner, afterLock: func() {
				calls++
				if calls <= changes {
					addQuestWaiter(t, f, uuid.NewString(), "active", time.Now().UTC())
					lastExternal = f.snapshot(t)
				}
			}}
			_, err := f.commands.WithdrawFromQuest(ctx, actor, WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			if changes == 3 {
				assertQuestCloseCode(t, err, apierr.Conflict)
				if calls != 3 || f.snapshot(t) != lastExternal {
					t.Fatalf("bounded retry calls=%d or partial effects persisted", calls)
				}
			} else {
				if err != nil || calls != 2 {
					t.Fatalf("retry calls=%d err=%v", calls, err)
				}
				var filled, roster, receipts, notices int
				if err := f.fixture.Pool.QueryRow(ctx, `SELECT q.filled_count,(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND p.status='signed_up'),(SELECT count(*) FROM idempotency_keys),(SELECT count(*) FROM notifications) FROM quests q WHERE q.public_id=$1`, f.questID).Scan(&filled, &roster, &receipts, &notices); err != nil {
					t.Fatal(err)
				}
				if filled != 1 || roster != 1 || receipts != 1 || notices != 1 {
					t.Fatalf("filled=%d roster=%d receipts=%d notices=%d", filled, roster, receipts, notices)
				}
			}
		})
	}
}
