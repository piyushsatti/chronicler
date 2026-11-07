//go:build integration

package quest

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// bumpQuest prepares the fixture quest as an empty, open quest with the given signup type and
// seat count. An empty signup type leaves the column unset.
func bumpQuest(t *testing.T, signupType string, slots int) questCloseFixture {
	t.Helper()
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, true)
	var signup any
	if signupType != "" {
		signup = signupType
	}
	if _, err := f.fixture.Pool.Exec(context.Background(), `UPDATE quests SET signup_type=$2,slots_max=$3 WHERE public_id=$1::uuid`, f.questID, signup, slots); err != nil {
		t.Fatal(err)
	}
	return f
}

// bumpPlayer adds an active player with one active character and returns the character id.
func bumpPlayer(t *testing.T, f questCloseFixture) string {
	t.Helper()
	ctx := context.Background()
	owner, character := uuid.NewString(), uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1::uuid,$1::text,$1::text,'Bump Player',ARRAY['player'],'active')`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status) SELECT $1::uuid,$1::text,'Bump Character',id,'active' FROM members WHERE public_id=$2::uuid`, character, owner); err != nil {
		t.Fatal(err)
	}
	return character
}

// bumpPlayed records that the character's owner played a closed quest scheduled daysAgo days ago.
func bumpPlayed(t *testing.T, f questCloseFixture, character string, daysAgo int) {
	t.Helper()
	ctx := context.Background()
	prior := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,created_by,slots_max,filled_count,document_id)
		SELECT $1::uuid,$1::text,ARRAY['standard'],'closed',q.dm_id,date_trunc('day',now())-make_interval(days => $3::int),q.dm_id,2,1,q.document_id FROM quests q WHERE q.public_id=$2::uuid`, prior, f.questID, daysAgo); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		SELECT q.id,c.id,c.owner_id,'played' FROM quests q,characters c WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, prior, character); err != nil {
		t.Fatal(err)
	}
}

// bumpSignup signs the character up through the product command as its owner.
func bumpSignup(t *testing.T, f questCloseFixture, character string) QuestParticipantView {
	t.Helper()
	view, err := f.commands.SignupForQuest(context.Background(), questCharacterActor(t, f, character), SignupForQuestSpec{QuestId: f.questID, CharacterId: character}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatalf("signup %s: %v", character, err)
	}
	return view
}

func bumpStatus(t *testing.T, f questCloseFixture, character string) string {
	t.Helper()
	var status string
	if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT p.status FROM quest_participants p JOIN quests q ON q.id=p.quest_id JOIN characters c ON c.id=p.character_id WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, f.questID, character).Scan(&status); err != nil {
		t.Fatal(err)
	}
	return status
}

// bumpCapacity checks the stored filled count and quest status, that the filled count matches
// the seated rows, and that no Discord revision was requested.
func bumpCapacity(t *testing.T, f questCloseFixture, wantFilled int, wantStatus string) {
	t.Helper()
	var filled, seated, revision int
	var status string
	if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT q.filled_count,q.status,q.discord_desired_revision,(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND p.status='signed_up') FROM quests q WHERE q.public_id=$1::uuid`, f.questID).Scan(&filled, &status, &revision, &seated); err != nil {
		t.Fatal(err)
	}
	if filled != wantFilled || seated != wantFilled || status != wantStatus || revision != 0 {
		t.Fatalf("filled=%d seated=%d status=%s revision=%d, want filled=%d status=%s revision=0", filled, seated, status, revision, wantFilled, wantStatus)
	}
}

// TestSignupOnOpenQuestWaitlists checks that a signup on a quest with open seats lands on
// the waitlist for both signup types and does not fill a seat.
func TestSignupOnOpenQuestWaitlists(t *testing.T) {
	for _, signupType := range []string{"last_game_played", "dm_pick"} {
		t.Run(signupType, func(t *testing.T) {
			f := bumpQuest(t, signupType, 2)
			first, second := bumpPlayer(t, f), bumpPlayer(t, f)
			if got := bumpSignup(t, f, first).Status; got != "waitlisted" {
				t.Fatalf("first signup=%s want waitlisted", got)
			}
			if got := bumpSignup(t, f, second).Status; got != "waitlisted" {
				t.Fatalf("second signup=%s want waitlisted", got)
			}
			bumpCapacity(t, f, 0, "open")
		})
	}
}

// TestLastGamePlayedSignupDoesNotBumpSeatedPlayer checks that a higher-priority newcomer
// waits and leaves an existing seat alone.
func TestLastGamePlayedSignupDoesNotBumpSeatedPlayer(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 1)
	seated, waiting := bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, seated, 3)
	bumpPlayed(t, f, waiting, 30)
	if got := bumpSignup(t, f, seated).Status; got != "waitlisted" {
		t.Fatalf("seated signup=%s want waitlisted", got)
	}
	markSeated(t, f, seated)
	if got := bumpSignup(t, f, waiting).Status; got != "waitlisted" {
		t.Fatalf("higher-priority signup returned %s, want waitlisted", got)
	}
	if got := bumpStatus(t, f, seated); got != "signed_up" {
		t.Fatalf("existing seat status=%s want signed_up", got)
	}
	bumpCapacity(t, f, 1, "full")
}

// TestWithdrawnSignupReturnsToWaitlist checks that a seated player who withdraws and signs
// up again is waitlisted, and that the rejoin does not take the open seat.
func TestWithdrawnSignupReturnsToWaitlist(t *testing.T) {
	f := bumpQuest(t, "dm_pick", 1)
	character := bumpPlayer(t, f)
	if got := bumpSignup(t, f, character).Status; got != "waitlisted" {
		t.Fatalf("signup=%s want waitlisted", got)
	}
	markSeated(t, f, character)
	if _, err := f.commands.WithdrawFromQuest(context.Background(), questCharacterActor(t, f, character), WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: character}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	if got := bumpSignup(t, f, character).Status; got != "waitlisted" {
		t.Fatalf("rejoin=%s want waitlisted", got)
	}
	bumpCapacity(t, f, 0, "open")
}

// markSeated holds a seat for a player who already waitlisted. Signup itself never does this.
func markSeated(t *testing.T, f questCloseFixture, character string) {
	t.Helper()
	ctx := context.Background()
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quest_participants p SET status='signed_up' FROM characters c, quests q WHERE p.character_id=c.id AND p.quest_id=q.id AND q.public_id=$1::uuid AND c.public_id=$2::uuid AND p.status='waitlisted'`, f.questID, character); err != nil {
		t.Fatal(err)
	}
	if got := bumpStatus(t, f, character); got != "signed_up" {
		t.Fatalf("seat %s status=%s", character, got)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET filled_count = (SELECT count(*)::integer FROM quest_participants p WHERE p.quest_id=quests.id AND p.status='signed_up'), status = CASE WHEN (SELECT count(*) FROM quest_participants p WHERE p.quest_id=quests.id AND p.status='signed_up') >= slots_max THEN 'full' ELSE 'open' END WHERE public_id=$1::uuid AND status IN ('open','full')`, f.questID); err != nil {
		t.Fatal(err)
	}
}

// TestDMPickWithdrawalOverCapDoesNotPromote checks that withdrawing one seated player from a
// DM Pick quest that is still over slots_max leaves the waitlist where it is.
func TestDMPickWithdrawalOverCapDoesNotPromote(t *testing.T) {
	f := bumpQuest(t, "dm_pick", 1)
	seated := []string{bumpPlayer(t, f), bumpPlayer(t, f), bumpPlayer(t, f)}
	waiter := bumpPlayer(t, f)
	for _, character := range seated {
		if got := bumpSignup(t, f, character).Status; got != "waitlisted" {
			t.Fatalf("signup=%s want waitlisted", got)
		}
		markSeated(t, f, character)
	}
	if got := bumpSignup(t, f, waiter).Status; got != "waitlisted" {
		t.Fatalf("waiter signup=%s want waitlisted", got)
	}
	if _, err := f.commands.WithdrawFromQuest(context.Background(), questCharacterActor(t, f, seated[0]), WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: seated[0]}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	if got := bumpStatus(t, f, waiter); got != "waitlisted" {
		t.Fatalf("waiter status=%s want waitlisted", got)
	}
	if got := bumpStatus(t, f, seated[0]); got != "withdrawn" {
		t.Fatalf("withdrawn status=%s want withdrawn", got)
	}
	bumpCapacity(t, f, 2, "full")
}

// TestLastGamePlayedWithdrawalPromotesHighestPriorityWaiter checks that a seat freed by a
// withdrawal goes to the highest-priority waitlisted player on a Last Game Played quest, and
// to the first waitlisted signup on a dm_pick quest.
func TestLastGamePlayedWithdrawalPromotesHighestPriorityWaiter(t *testing.T) {
	for signupType, longerWaitPromoted := range map[string]bool{"last_game_played": true, "dm_pick": false} {
		t.Run(signupType, func(t *testing.T) {
			f := bumpQuest(t, signupType, 1)
			seated, firstWaiter, longerWaiter := bumpPlayer(t, f), bumpPlayer(t, f), bumpPlayer(t, f)
			// The seated player has never played. Signup waitlists them; the seat is held separately.
			bumpPlayed(t, f, firstWaiter, 3)
			bumpPlayed(t, f, longerWaiter, 30)
			if got := bumpSignup(t, f, seated).Status; got != "waitlisted" {
				t.Fatalf("seated signup=%s want waitlisted", got)
			}
			markSeated(t, f, seated)
			for _, character := range []string{firstWaiter, longerWaiter} {
				if got := bumpSignup(t, f, character).Status; got != "waitlisted" {
					t.Fatalf("veteran signup=%s want waitlisted", got)
				}
			}
			if _, err := f.commands.WithdrawFromQuest(context.Background(), questCharacterActor(t, f, seated), WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: seated}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
				t.Fatal(err)
			}
			promoted, waiting := firstWaiter, longerWaiter
			if longerWaitPromoted {
				promoted, waiting = longerWaiter, firstWaiter
			}
			if got := bumpStatus(t, f, promoted); got != "signed_up" {
				t.Fatalf("promoted status=%s want signed_up", got)
			}
			if got := bumpStatus(t, f, waiting); got != "waitlisted" {
				t.Fatalf("remaining status=%s want waitlisted", got)
			}
			bumpCapacity(t, f, 1, "full")
		})
	}
}

// bumpCapacityAfterDMPick is bumpCapacity's check without the revision==0 assertion: a real
// DM pick (unlike a signup or an auto-promotion) runs StoreSyncQuestDiscord and legitimately
// bumps discord_desired_revision to 1.
func bumpCapacityAfterDMPick(t *testing.T, f questCloseFixture, wantFilled int, wantStatus string) {
	t.Helper()
	var filled, seated, revision int
	var status string
	if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT q.filled_count,q.status,q.discord_desired_revision,(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND p.status='signed_up') FROM quests q WHERE q.public_id=$1::uuid`, f.questID).Scan(&filled, &status, &revision, &seated); err != nil {
		t.Fatal(err)
	}
	if filled != wantFilled || seated != wantFilled || status != wantStatus || revision != 1 {
		t.Fatalf("filled=%d seated=%d status=%s revision=%d, want filled=%d status=%s revision=1", filled, seated, status, revision, wantFilled, wantStatus)
	}
}

// bumpNotificationCount returns how many notification rows exist for the member who owns the
// given character, joining through characters.owner_id (the internal member id) since
// notifications.member_id is an internal id, not a public one.
func bumpNotificationCount(t *testing.T, f questCloseFixture, character string) int {
	t.Helper()
	var count int
	if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications n JOIN characters c ON c.owner_id=n.member_id WHERE c.public_id=$1::uuid`, character).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

// TestLastGamePlayedSignupDoesNotNotifyABump checks that a higher-priority signup leaves the
// seated player in place and writes no bump notice for them.
func TestLastGamePlayedSignupDoesNotNotifyABump(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 1)
	seated, newcomer := bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, seated, 3)
	if got := bumpSignup(t, f, seated).Status; got != "waitlisted" {
		t.Fatalf("seated=%s", got)
	}
	if got := bumpNotificationCount(t, f, seated); got != 1 {
		t.Fatalf("seated notifications after own signup=%d, want 1", got)
	}
	markSeated(t, f, seated)
	if got := bumpSignup(t, f, newcomer).Status; got != "waitlisted" {
		t.Fatalf("newcomer signup returned %s, want waitlisted", got)
	}
	if got := bumpStatus(t, f, seated); got != "signed_up" {
		t.Fatalf("seated status=%s want signed_up", got)
	}
	if got := bumpNotificationCount(t, f, seated); got != 1 {
		t.Fatalf("seated notifications=%d, want 1 (signup only, no bump)", got)
	}
	if got := bumpNotificationCount(t, f, newcomer); got != 1 {
		t.Fatalf("newcomer notifications=%d, want 1", got)
	}
	bumpCapacity(t, f, 1, "full")
}

// TestDMPickedSeatStaysSeatedOnSignup checks that a later signup leaves a DM-picked seat
// and any other held seat where they are.
func TestDMPickedSeatStaysSeatedOnSignup(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 2)
	recent, mid, newcomer := bumpPlayer(t, f), bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, recent, 2)
	bumpPlayed(t, f, mid, 10)
	if got := bumpSignup(t, f, mid).Status; got != "waitlisted" {
		t.Fatalf("mid signup=%s want waitlisted", got)
	}
	markSeated(t, f, mid)

	if _, err := f.fixture.Pool.Exec(context.Background(), `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		SELECT q.id,c.id,c.owner_id,'waitlisted' FROM quests q,characters c WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, f.questID, recent); err != nil {
		t.Fatal(err)
	}
	if _, err := f.commands.SelectQuestParticipants(context.Background(), f.actor, SelectQuestParticipantsSpec{QuestId: f.questID, CharacterIds: []string{recent}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	// A real DM pick syncs Discord (revision bumps to 1). Signup does not.
	bumpCapacityAfterDMPick(t, f, 2, "full")

	if got := bumpSignup(t, f, newcomer).Status; got != "waitlisted" {
		t.Fatalf("newcomer signup returned %s, want waitlisted", got)
	}
	if got := bumpStatus(t, f, recent); got != "signed_up" {
		t.Fatalf("DM-picked seat status=%s, want signed_up", got)
	}
	if got := bumpStatus(t, f, mid); got != "signed_up" {
		t.Fatalf("existing seat status=%s, want signed_up", got)
	}
	bumpCapacityAfterDMPick(t, f, 2, "full")
}

// TestDMPickedWithdrawalRejoinWaitlists checks that a DM-picked player who withdraws and
// signs up again returns to the waitlist instead of reclaiming the seat.
func TestDMPickedWithdrawalRejoinWaitlists(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 1)
	picked := bumpPlayer(t, f)
	bumpPlayed(t, f, picked, 2)

	if _, err := f.fixture.Pool.Exec(context.Background(), `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		SELECT q.id,c.id,c.owner_id,'waitlisted' FROM quests q,characters c WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, f.questID, picked); err != nil {
		t.Fatal(err)
	}
	if _, err := f.commands.SelectQuestParticipants(context.Background(), f.actor, SelectQuestParticipantsSpec{QuestId: f.questID, CharacterIds: []string{picked}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	if got := bumpStatus(t, f, picked); got != "signed_up" {
		t.Fatalf("picked status=%s want signed_up", got)
	}

	if _, err := f.commands.WithdrawFromQuest(context.Background(), questCharacterActor(t, f, picked), WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: picked}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	if got := bumpSignup(t, f, picked).Status; got != "waitlisted" {
		t.Fatalf("rejoin returned %s, want waitlisted", got)
	}
	bumpCapacityAfterDMPick(t, f, 0, "open")
}
