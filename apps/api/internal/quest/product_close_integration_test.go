//go:build integration

package quest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type questCloseFixture struct {
	fixture              *dbtest.ProductFixture
	commands             *ProductCommands
	actor                auth.Authority
	questID, characterID string
}

func newQuestCloseFixture(t *testing.T) questCloseFixture {
	t.Helper()
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	dmID := seedQuestArcDM(t, ctx, fixture)
	ownerID, characterID, questID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err := fixture.Pool.Exec(ctx, `
		INSERT INTO members(public_id,discord_id,handle,display_name,roles,status)
		VALUES($1,'close-owner','close-owner','Close Owner',ARRAY['player'],'active');
	`, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status,player_xp)
		SELECT $1,'C-CLOSE','Close Hero',id,'active',5 FROM members WHERE public_id=$2`, characterID, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.Pool.Exec(ctx, `INSERT INTO character_progression_ledger(character_id,delta,reason)
		SELECT id,5,'old unassigned xp' FROM characters WHERE public_id=$1`, characterID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.Pool.Exec(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,body,author_id)
		SELECT 'quest_brief','close-brief','Close Quest','published','public','Brief',id FROM members WHERE public_id=$1`, dmID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by,slots_max,filled_count)
		SELECT $1,'Q-CLOSE',ARRAY['standard'],'played',m.id,now()-interval '1 day',d.id,m.id,2,1
		FROM members m,documents d WHERE m.public_id=$2 AND d.slug='close-brief'`, questID, dmID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		SELECT q.id,c.id,c.owner_id,'signed_up' FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, questID, characterID)
	if err != nil {
		t.Fatal(err)
	}
	commands, members := newQuestCommandHarness(t, fixture)
	actor, err := members.ResolveAuthority(ctx, dmID)
	if err != nil {
		t.Fatal(err)
	}
	return questCloseFixture{fixture: fixture, commands: commands, actor: actor, questID: questID, characterID: characterID}
}

func (f questCloseFixture) input() CloseQuestSpec {
	return CloseQuestSpec{Id: f.questID, Input: CloseQuestFields{
		Attendance: []ParticipationAttestationFields{{CharacterId: f.characterID, Status: "played"}},
		Rewards:    []QuestPcxpAwardFields{{CharacterId: f.characterID, Pcxp: 4}},
	}}
}

func (f questCloseFixture) snapshot(t *testing.T) string {
	t.Helper()
	var snapshot string
	err := f.fixture.Pool.QueryRow(context.Background(), `SELECT jsonb_build_object(
		'quest',to_jsonb(q),'character',to_jsonb(c),
		'participants',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.character_id) FROM quest_participants p WHERE p.quest_id=q.id),
		'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM character_progression_ledger l WHERE l.character_id=c.id),
		'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM background_jobs j),
		'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.key) FROM idempotency_keys r)
	)::text FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, f.questID, f.characterID).Scan(&snapshot)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestFrontendQuestCloseRewardsAtomicReplayAndTotals(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	input := f.input()
	note := "Victory"
	input.Input.Rewards[0].Note = &note
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	view, err := f.commands.CloseQuest(ctx, f.actor, input, meta)
	if err != nil || view.Status != "closed" || view.FilledCount != 0 {
		t.Fatalf("close=%+v err=%v", view, err)
	}
	var amount, cache, ledger, revision, jobs, receipts, notices int
	var attendance, actualNote, recorder string
	err = f.fixture.Pool.QueryRow(ctx, `SELECT
		(SELECT sum(delta) FROM character_progression_ledger WHERE quest_id=q.id AND reason='quest_reward'),c.player_xp,
		(SELECT sum(delta) FROM character_progression_ledger WHERE character_id=c.id),q.discord_desired_revision,
		(SELECT count(*) FROM background_jobs),(SELECT count(*) FROM idempotency_keys),(SELECT count(*) FROM notifications),p.status,
		(SELECT note FROM character_progression_ledger WHERE quest_id=q.id),
		(SELECT m.public_id::text FROM character_progression_ledger l JOIN members m ON m.id=l.recorded_by WHERE l.quest_id=q.id)
		FROM quests q,characters c,quest_participants p WHERE q.public_id=$1 AND c.public_id=$2 AND p.quest_id=q.id AND p.character_id=c.id`, f.questID, f.characterID).Scan(&amount, &cache, &ledger, &revision, &jobs, &receipts, &notices, &attendance, &actualNote, &recorder)
	if err != nil {
		t.Fatal(err)
	}
	if amount != 4 || cache != 9 || ledger != 9 || revision != 1 || jobs != 1 || receipts != 1 || notices != 0 || attendance != "played" || actualNote != note || recorder != f.actor.Claims().MemberID {
		t.Fatalf("amount=%d cache=%d ledger=%d revision=%d jobs=%d receipts=%d notices=%d attendance=%s note=%s actor=%s", amount, cache, ledger, revision, jobs, receipts, notices, attendance, actualNote, recorder)
	}
	before := f.snapshot(t)
	replay, err := f.commands.CloseQuest(ctx, f.actor, input, meta)
	viewJSON, _ := json.Marshal(view)
	replayJSON, _ := json.Marshal(replay)
	if err != nil || string(viewJSON) != string(replayJSON) {
		t.Fatalf("replay=%+v err=%v", replay, err)
	}
	if after := f.snapshot(t); after != before {
		t.Fatal("replay changed persisted state")
	}
	_, err = f.commands.CloseQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Conflict)
	if f.snapshot(t) != before {
		t.Fatal("second closure changed persisted state")
	}
	reader, _ := NewProductPostgres(f.fixture.Pool)
	totals, err := reader.questSummaryTotals(ctx, mustUUID(f.questID))
	if err != nil || totals.Coverage != RewardCoverageComplete || totals.TotalPcxpAwarded == nil || *totals.TotalPcxpAwarded != 4 {
		t.Fatalf("totals=%+v err=%v", totals, err)
	}
	coverage, err := reader.ReadRewardDecisionCoverage(ctx, []string{f.questID, f.questID})
	if err != nil || len(coverage) != 2 || !coverage[0].Closed || !coverage[0].HasFullClosureDecision || coverage[0] != coverage[1] {
		t.Fatalf("coverage=%+v err=%v", coverage, err)
	}
}

func assertQuestCloseCode(t *testing.T, err error, want apierr.Code) {
	t.Helper()
	var expected *apierr.Error
	if !errors.As(err, &expected) || expected.Code != want {
		t.Fatalf("error=%v want=%s", err, want)
	}
}

func TestFrontendQuestCloseZeroAndLegacyCoverage(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	reader, _ := NewProductPostgres(f.fixture.Pool)
	totals, err := reader.questSummaryTotals(ctx, mustUUID(f.questID))
	if err != nil || totals.Coverage != RewardCoverageComplete || totals.TotalPcxpAwarded == nil || *totals.TotalPcxpAwarded != 0 {
		t.Fatalf("played=%+v err=%v", totals, err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET status='closed' WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	totals, err = reader.questSummaryTotals(ctx, mustUUID(f.questID))
	if err != nil || totals.Coverage != RewardCoverageLegacyUnknown || totals.TotalPcxpAwarded != nil {
		t.Fatalf("legacy=%+v err=%v", totals, err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET status='played' WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	input := f.input()
	input.Input.Rewards = nil
	if _, err := f.commands.CloseQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	totals, err = reader.questSummaryTotals(ctx, mustUUID(f.questID))
	if err != nil || totals.Coverage != RewardCoverageComplete || totals.TotalPcxpAwarded == nil || *totals.TotalPcxpAwarded != 0 {
		t.Fatalf("zero=%+v err=%v", totals, err)
	}
}

func TestFrontendQuestCloseRollsBackEveryEffect(t *testing.T) {
	for _, table := range []string{"character_progression_ledger", "characters", "background_jobs", "idempotency_keys"} {
		t.Run(table, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			ctx := context.Background()
			before := f.snapshot(t)
			if _, err := f.fixture.Pool.Exec(ctx, fmt.Sprintf(`CREATE FUNCTION fail_close_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected close failure'; END $$;
				CREATE TRIGGER fail_close_effect BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION fail_close_effect()`, pgx.Identifier{table}.Sanitize())); err != nil {
				t.Fatal(err)
			}
			_, err := f.commands.CloseQuest(ctx, f.actor, f.input(), product.CommandMeta{IdempotencyKey: uuid.NewString()})
			if err == nil {
				t.Fatal("injected failure succeeded")
			}
			if after := f.snapshot(t); after != before {
				t.Fatalf("%s failure committed partial state", table)
			}
		})
	}
}

func TestFrontendQuestCloseRejectsInvalidRosterAtomically(t *testing.T) {
	for _, kind := range []string{"pending", "no_show_award", "unknown_attendance", "unknown_reward", "withdrawn", "duplicate_reward", "nonpositive"} {
		t.Run(kind, func(t *testing.T) {
			f := newQuestCloseFixture(t)
			input := f.input()
			switch kind {
			case "pending":
				input.Input.Attendance = nil
			case "no_show_award":
				input.Input.Attendance[0].Status = "no_show"
			case "unknown_attendance":
				input.Input.Attendance[0].CharacterId = uuid.NewString()
			case "unknown_reward":
				input.Input.Rewards[0].CharacterId = uuid.NewString()
			case "withdrawn":
				if _, err := f.fixture.Pool.Exec(context.Background(), `UPDATE quest_participants SET status='withdrawn'`); err != nil {
					t.Fatal(err)
				}
			case "duplicate_reward":
				input.Input.Rewards = append(input.Input.Rewards, input.Input.Rewards[0])
			case "nonpositive":
				input.Input.Rewards[0].Pcxp = 0
			}
			before := f.snapshot(t)
			_, err := f.commands.CloseQuest(context.Background(), f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			assertQuestCloseCode(t, err, apierr.Invalid)
			if f.snapshot(t) != before {
				t.Fatal("invalid close changed persisted state")
			}
		})
	}
}

func TestFrontendQuestCloseConcurrentReplay(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	results := make(chan error, 2)
	for range 2 {
		go func() { _, err := f.commands.CloseQuest(ctx, f.actor, f.input(), meta); results <- err }()
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	var count, total int
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT count(*),sum(delta) FROM character_progression_ledger WHERE reason='quest_reward'`).Scan(&count, &total); err != nil {
		t.Fatal(err)
	}
	if count != 1 || total != 4 {
		t.Fatalf("concurrent rewards count=%d total=%d", count, total)
	}
}

func waitForQuestQueryLock(t *testing.T, ctx context.Context, f questCloseFixture, queryPrefix string) {
	t.Helper()
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		var waiting bool
		if err := f.fixture.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity
			WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE $2)`, f.fixture.DatabaseName, queryPrefix+"%").Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal("command did not wait for expected lock", queryPrefix, ctx.Err())
		case <-ticker.C:
		}
	}
}

func TestFrontendQuestCloseLocksCharactersBeforeQuest(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	characterTx, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer characterTx.Rollback(context.Background()) //nolint:errcheck
	if _, err := characterTx.Exec(ctx, `SELECT id FROM characters WHERE public_id=$1 FOR UPDATE`, f.characterID); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := f.commands.CloseQuest(ctx, f.actor, f.input(), product.CommandMeta{IdempotencyKey: uuid.NewString()})
		result <- err
	}()
	waitForQuestQueryLock(t, ctx, f, "-- name: CharacterProductLockQuestRoster")
	questTx, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer questTx.Rollback(context.Background()) //nolint:errcheck
	if _, err := questTx.Exec(ctx, `SET LOCAL lock_timeout='1s'`); err != nil {
		t.Fatal(err)
	}
	if _, err := questTx.Exec(ctx, `SELECT id FROM quests WHERE public_id=$1 FOR UPDATE`, f.questID); err != nil {
		t.Fatalf("close held Quest while waiting for Character: %v", err)
	}
	if err := questTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := characterTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-result; err != nil {
		t.Fatal(err)
	}
}

func TestFrontendQuestCloseRejectsRosterAddedDuringCharacterLocks(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	characterTx, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer characterTx.Rollback(context.Background()) //nolint:errcheck
	if _, err := characterTx.Exec(ctx, `SELECT id FROM characters WHERE public_id=$1 FOR UPDATE`, f.characterID); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := f.commands.CloseQuest(ctx, f.actor, f.input(), product.CommandMeta{IdempotencyKey: uuid.NewString()})
		result <- err
	}()
	waitForQuestQueryLock(t, ctx, f, "-- name: CharacterProductLockQuestRoster")
	other := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status)
		SELECT $1,'C-CLOSE-LATE','Late Character',owner_id,'active' FROM characters WHERE public_id=$2`, other, f.characterID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		SELECT q.id,c.id,c.owner_id,'played' FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, f.questID, other); err != nil {
		t.Fatal(err)
	}
	before := f.snapshot(t)
	if err := characterTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	assertQuestCloseCode(t, <-result, apierr.Conflict)
	if f.snapshot(t) != before {
		t.Fatal("changed roster committed partial closure")
	}
}
