//go:build integration

package quest

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestFrontendQuestWithdrawalKeepsExplicitScopeAndNoop(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, false)
	ctx := context.Background()
	otherQuest := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by,slots_max,filled_count)
		SELECT $1,'Q-WITHDRAW-OTHER',kinds,status,dm_id,scheduled_at,document_id,created_by,slots_max,filled_count FROM quests WHERE public_id=$2`, otherQuest, f.questID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,member_id,character_id,status)
		SELECT other.id,p.member_id,p.character_id,p.status FROM quests other,quest_participants p JOIN quests q ON q.id=p.quest_id WHERE other.public_id=$1 AND q.public_id=$2`, otherQuest, f.questID); err != nil {
		t.Fatal(err)
	}
	actor := questCharacterActor(t, f, f.characterID)
	input := WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: f.characterID}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	withdrawn, err := f.commands.WithdrawFromQuest(ctx, actor, input, meta)
	if err != nil || withdrawn.Status != "withdrawn" {
		t.Fatalf("withdrawal=%+v err=%v", withdrawn, err)
	}
	before := questStorageSnapshot(t, f)
	if _, err := f.commands.WithdrawFromQuest(ctx, actor, input, meta); err != nil {
		t.Fatal(err)
	}
	if questStorageSnapshot(t, f) != before {
		t.Fatal("completed withdrawal replay changed state")
	}
	if again, err := f.commands.WithdrawFromQuest(ctx, actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil || again.Status != "withdrawn" {
		t.Fatalf("new-key noop=%+v err=%v", again, err)
	}
	var otherStatus string
	var ownFilled, otherFilled, revision, jobs, notices, receipts int
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT q.filled_count,q.discord_desired_revision,other.filled_count,p.status,
		(SELECT count(*) FROM background_jobs),(SELECT count(*) FROM notifications),(SELECT count(*) FROM idempotency_keys)
		FROM quests q,quests other JOIN quest_participants p ON p.quest_id=other.id WHERE q.public_id=$1 AND other.public_id=$2`, f.questID, otherQuest).Scan(&ownFilled, &revision, &otherFilled, &otherStatus, &jobs, &notices, &receipts); err != nil {
		t.Fatal(err)
	}
	if ownFilled != 0 || revision != 1 || otherFilled != 1 || otherStatus != "signed_up" || jobs != 1 || notices != 0 || receipts != 2 {
		t.Fatalf("own=%d revision=%d other=%d/%s jobs=%d notices=%d receipts=%d", ownFilled, revision, otherFilled, otherStatus, jobs, notices, receipts)
	}
}

func TestFrontendQuestWithdrawalRevocationAfterQuestWaitRollsBack(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, false)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	addQuestWaiter(t, f, uuid.NewString(), "active", time.Now().UTC())
	actor := questCharacterActor(t, f, f.characterID)
	tx, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT id FROM quests WHERE public_id=$1 FOR UPDATE`, f.questID); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := f.commands.WithdrawFromQuest(ctx, actor, WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		result <- err
	}()
	waitForQuestQueryLock(t, ctx, f, "-- name: ProductQuestLockByID")
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE members SET status='banned' WHERE public_id=$1`, actor.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	before := questStorageSnapshot(t, f)
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	assertQuestCloseCode(t, <-result, apierr.Forbidden)
	if questStorageSnapshot(t, f) != before {
		t.Fatal("revocation committed withdrawal, promotion, job, notice or receipt")
	}
}

func TestFrontendQuestWithdrawalAndRetirementShareOrderedInterpreter(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, false)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	retiring, waiting := "00000000-0000-4000-8000-000000000071", "ffffffff-ffff-4fff-bfff-fffffffffff1"
	addQuestWaiter(t, f, retiring, "active", time.Now().UTC().Add(-time.Hour))
	addQuestWaiter(t, f, waiting, "active", time.Now().UTC())
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quest_participants SET status='signed_up' WHERE character_id=(SELECT id FROM characters WHERE public_id=$1)`, retiring); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET filled_count=2,slots_max=2 WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	var expected time.Time
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT updated_at FROM characters WHERE public_id=$1`, retiring).Scan(&expected); err != nil {
		t.Fatal(err)
	}
	policy, _ := auth.NewPoolPolicy(f.fixture.Pool)
	runner := db.NewRunner(f.fixture.Pool, func(tx pgx.Tx) character.ProductCommandRepos {
		characters, _ := character.NewProductPostgres(tx)
		quests, _ := NewProductPostgres(tx)
		members, _ := member.NewFromDBTX(tx, "")
		replay, _ := idempotency.NewRepository(tx)
		notices, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Character: characters})
		if err != nil {
			t.Fatal(err)
		}
		return character.ProductCommandRepos{Character: characters, Authority: members.ResolveAuthority, Policy: policy, Admissions: characters, Withdrawals: quests, Replay: replay, Notice: notices, Producer: notification.NewProducer()}
	})
	characters, err := character.NewProductCommands(runner, time.Now, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	owner, retiringOwner := questCharacterActor(t, f, f.characterID), questCharacterActor(t, f, retiring)
	start, results := make(chan struct{}), make(chan error, 2)
	go func() {
		<-start
		_, err := f.commands.WithdrawFromQuest(ctx, owner, WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: f.characterID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		results <- err
	}()
	go func() {
		<-start
		_, err := characters.RetireCharacter(ctx, retiringOwner, character.RetireCharacterSpec{CharacterId: retiring, ExpectedUpdatedAt: expected}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		results <- err
	}()
	close(start)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	var filled, signed, withdrawn, revision, notices, receipts int
	var retired, promoted string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT q.filled_count,q.discord_desired_revision,
		(SELECT count(*) FROM quest_participants WHERE status='signed_up'),(SELECT count(*) FROM quest_participants WHERE status='withdrawn'),
		(SELECT status FROM characters WHERE public_id=$2),(SELECT p.status FROM quest_participants p JOIN characters c ON c.id=p.character_id WHERE c.public_id=$3),
		(SELECT count(*) FROM notifications),(SELECT count(*) FROM idempotency_keys) FROM quests q WHERE q.public_id=$1`, f.questID, retiring, waiting).Scan(&filled, &revision, &signed, &withdrawn, &retired, &promoted, &notices, &receipts); err != nil {
		t.Fatal(err)
	}
	if filled != 1 || revision != 2 || signed != 1 || withdrawn != 2 || retired != "retired" || promoted != "signed_up" || notices != 1 || receipts != 2 {
		t.Fatalf("filled=%d revision=%d signed=%d withdrawn=%d retired=%s promoted=%s notices=%d receipts=%d", filled, revision, signed, withdrawn, retired, promoted, notices, receipts)
	}
}
