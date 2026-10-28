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

// TestLastGamePlayedSignupBumpsVeteranForNewPlayer checks that a player who has never played
// takes the seat of the seated player with the most recent game, who drops to the waitlist.
func TestLastGamePlayedSignupBumpsVeteranForNewPlayer(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 2)
	recent, longAgo, newcomer := bumpPlayer(t, f), bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, recent, 3)
	bumpPlayed(t, f, longAgo, 10)
	if got := bumpSignup(t, f, recent).Status; got != "signed_up" {
		t.Fatalf("recent=%s", got)
	}
	if got := bumpSignup(t, f, longAgo).Status; got != "signed_up" {
		t.Fatalf("longAgo=%s", got)
	}
	bumpCapacity(t, f, 2, "full")
	if got := bumpSignup(t, f, newcomer).Status; got != "signed_up" {
		t.Fatalf("newcomer signup returned %s, want signed_up", got)
	}
	for character, want := range map[string]string{newcomer: "signed_up", longAgo: "signed_up", recent: "waitlisted"} {
		if got := bumpStatus(t, f, character); got != want {
			t.Fatalf("status of %s=%s want %s", character, got, want)
		}
	}
	bumpCapacity(t, f, 2, "full")
}

// TestLastGamePlayedSignupBumpsByLongerWaitingVeteran checks that a veteran whose last game is
// older than the seated veteran's takes that seat.
func TestLastGamePlayedSignupBumpsByLongerWaitingVeteran(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 1)
	seated, waiting := bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, seated, 3)
	bumpPlayed(t, f, waiting, 30)
	bumpSignup(t, f, seated)
	if got := bumpSignup(t, f, waiting).Status; got != "signed_up" {
		t.Fatalf("longer-waiting signup returned %s, want signed_up", got)
	}
	if got := bumpStatus(t, f, seated); got != "waitlisted" {
		t.Fatalf("bumped veteran status=%s want waitlisted", got)
	}
	bumpCapacity(t, f, 1, "full")
}

// TestLastGamePlayedSignupEqualPriorityDoesNotBump checks that an equal-priority newcomer goes
// to the waitlist because the earlier signup keeps the seat.
func TestLastGamePlayedSignupEqualPriorityDoesNotBump(t *testing.T) {
	for name, days := range map[string]int{"never played": -1, "same last game day": 7} {
		t.Run(name, func(t *testing.T) {
			f := bumpQuest(t, "last_game_played", 1)
			seated, newcomer := bumpPlayer(t, f), bumpPlayer(t, f)
			if days >= 0 {
				bumpPlayed(t, f, seated, days)
				bumpPlayed(t, f, newcomer, days)
			}
			bumpSignup(t, f, seated)
			if got := bumpSignup(t, f, newcomer).Status; got != "waitlisted" {
				t.Fatalf("equal-priority signup returned %s, want waitlisted", got)
			}
			if got := bumpStatus(t, f, seated); got != "signed_up" {
				t.Fatalf("seated status=%s want signed_up", got)
			}
			bumpCapacity(t, f, 1, "full")
		})
	}
}

// TestLastGamePlayedSignupLowerPriorityWaitlists checks that a newcomer ranked below every
// seated player goes to the waitlist.
func TestLastGamePlayedSignupLowerPriorityWaitlists(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 2)
	never, longAgo, recent := bumpPlayer(t, f), bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, longAgo, 30)
	bumpPlayed(t, f, recent, 2)
	bumpSignup(t, f, never)
	bumpSignup(t, f, longAgo)
	if got := bumpSignup(t, f, recent).Status; got != "waitlisted" {
		t.Fatalf("lower-priority signup returned %s, want waitlisted", got)
	}
	for _, character := range []string{never, longAgo} {
		if got := bumpStatus(t, f, character); got != "signed_up" {
			t.Fatalf("seated status=%s want signed_up", got)
		}
	}
	bumpCapacity(t, f, 2, "full")
}

// TestDMPickSignupNeverBumps checks that dm_pick quests, and quests with no signup type, keep
// first-come seating: a full quest waitlists even a player who has never played.
func TestDMPickSignupNeverBumps(t *testing.T) {
	for _, signupType := range []string{"dm_pick", ""} {
		t.Run("type="+signupType, func(t *testing.T) {
			f := bumpQuest(t, signupType, 1)
			veteran, newcomer := bumpPlayer(t, f), bumpPlayer(t, f)
			bumpPlayed(t, f, veteran, 3)
			bumpSignup(t, f, veteran)
			if got := bumpSignup(t, f, newcomer).Status; got != "waitlisted" {
				t.Fatalf("signup returned %s, want waitlisted", got)
			}
			if got := bumpStatus(t, f, veteran); got != "signed_up" {
				t.Fatalf("veteran status=%s want signed_up", got)
			}
			bumpCapacity(t, f, 1, "full")
		})
	}
}

// TestLastGamePlayedWithdrawalPromotesHighestPriorityWaiter checks that a seat freed by a
// withdrawal goes to the highest-priority waitlisted player on a Last Game Played quest, and
// to the first waitlisted signup on a dm_pick quest.
func TestLastGamePlayedWithdrawalPromotesHighestPriorityWaiter(t *testing.T) {
	for signupType, longerWaitPromoted := range map[string]bool{"last_game_played": true, "dm_pick": false} {
		t.Run(signupType, func(t *testing.T) {
			f := bumpQuest(t, signupType, 1)
			seated, firstWaiter, longerWaiter := bumpPlayer(t, f), bumpPlayer(t, f), bumpPlayer(t, f)
			// The seated player has never played, so neither veteran bumps them on signup.
			bumpPlayed(t, f, firstWaiter, 3)
			bumpPlayed(t, f, longerWaiter, 30)
			bumpSignup(t, f, seated)
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

// TestLastGamePlayedBumpNotifiesBumpedPlayer checks that bumping a seated player off a Last
// Game Played quest writes a notification row for the bumped player, not just the newcomer.
func TestLastGamePlayedBumpNotifiesBumpedPlayer(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 1)
	seated, newcomer := bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, seated, 3)
	if got := bumpSignup(t, f, seated).Status; got != "signed_up" {
		t.Fatalf("seated=%s", got)
	}
	// The player's own signup already wrote a QuestSignupConfirmed notification; the bump
	// below must add a second, distinct notification row for the same player.
	if got := bumpNotificationCount(t, f, seated); got != 1 {
		t.Fatalf("seated notifications after own signup=%d, want 1", got)
	}
	if got := bumpSignup(t, f, newcomer).Status; got != "signed_up" {
		t.Fatalf("newcomer signup returned %s, want signed_up", got)
	}
	if got := bumpStatus(t, f, seated); got != "waitlisted" {
		t.Fatalf("bumped player status=%s want waitlisted", got)
	}
	if got := bumpNotificationCount(t, f, seated); got != 2 {
		t.Fatalf("bumped player notifications=%d, want 2 (signup confirmed + bumped)", got)
	}
	if got := bumpNotificationCount(t, f, newcomer); got != 1 {
		t.Fatalf("newcomer notifications=%d, want 1", got)
	}
	bumpCapacity(t, f, 1, "full")
}

// TestDMPickedSeatNeverBumped checks that a DM-picked seat is immune to the Last Game
// Played bump: a higher-priority newcomer bumps the next-lowest ordinary seat instead.
func TestDMPickedSeatNeverBumped(t *testing.T) {
	f := bumpQuest(t, "last_game_played", 2)
	recent, mid, newcomer := bumpPlayer(t, f), bumpPlayer(t, f), bumpPlayer(t, f)
	bumpPlayed(t, f, recent, 2)
	bumpPlayed(t, f, mid, 10)
	bumpSignup(t, f, mid)

	if _, err := f.fixture.Pool.Exec(context.Background(), `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		SELECT q.id,c.id,c.owner_id,'waitlisted' FROM quests q,characters c WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, f.questID, recent); err != nil {
		t.Fatal(err)
	}
	if _, err := f.commands.SelectQuestParticipants(context.Background(), f.actor, SelectQuestParticipantsSpec{QuestId: f.questID, CharacterIds: []string{recent}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	// A real DM pick syncs Discord (revision bumps to 1); the bump logic below never touches
	// Discord itself, so revision stays at 1 for the rest of this test.
	bumpCapacityAfterDMPick(t, f, 2, "full")

	if got := bumpSignup(t, f, newcomer).Status; got != "signed_up" {
		t.Fatalf("newcomer signup returned %s, want signed_up", got)
	}
	if got := bumpStatus(t, f, recent); got != "signed_up" {
		t.Fatalf("DM-picked seat status=%s, want signed_up (must not be bumped)", got)
	}
	if got := bumpStatus(t, f, mid); got != "waitlisted" {
		t.Fatalf("next-lowest seat status=%s, want waitlisted", got)
	}
	bumpCapacityAfterDMPick(t, f, 2, "full")
}
