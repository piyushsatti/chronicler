//go:build integration

package quest

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestQuestParticipantsOrderByLastGamePlayed checks that a Last Game Played quest lists new
// players first and then players by the longest time since their last played game, and that a
// DM pick quest keeps signup order.
func TestQuestParticipantsOrderByLastGamePlayed(t *testing.T) {
	f := newQuestCloseFixture(t)
	setQuestPreplay(t, f, true)
	ctx := context.Background()
	dm := seedQuestArcDM(t, ctx, f.fixture)
	signup := time.Now().Add(-time.Hour)
	// Signup order: recent, never, longAgo. Last Game Played order: never, longAgo, recent.
	recent, never, longAgo := uuid.NewString(), uuid.NewString(), uuid.NewString()
	addQuestWaiter(t, f, recent, "active", signup)
	addQuestWaiter(t, f, never, "active", signup.Add(time.Minute))
	addQuestWaiter(t, f, longAgo, "active", signup.Add(2*time.Minute))
	played := func(character string, daysAgo int) {
		prior := uuid.NewString()
		if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,created_by,slots_max,filled_count,document_id)
			SELECT $1::uuid,$1::text,ARRAY['standard'],'closed',m.id,now()-make_interval(days => $3::int),m.id,2,1,(SELECT document_id FROM quests WHERE public_id=$4::uuid) FROM members m WHERE m.public_id=$2::uuid`, prior, dm, daysAgo, f.questID); err != nil {
			t.Fatal(err)
		}
		if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
			SELECT q.id,c.id,c.owner_id,'played' FROM quests q,characters c WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, prior, character); err != nil {
			t.Fatal(err)
		}
	}
	played(recent, 3)
	played(longAgo, 90)
	reader, _ := NewProductPostgres(f.fixture.Pool)
	order := func(signupType string) ([]string, map[string]*time.Time) {
		if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET signup_type=$2 WHERE public_id=$1::uuid`, f.questID, signupType); err != nil {
			t.Fatal(err)
		}
		pages, err := reader.ReadBatchParticipants(ctx, f.actor, []ParticipantsKey{{ParentID: f.questID, HasStatus: true, Status: "waitlisted", Limit: 20}})
		if err != nil || len(pages) != 1 || pages[0].Err != nil || pages[0].Value == nil {
			t.Fatalf("pages=%+v err=%v", pages, err)
		}
		var ids []string
		lastPlayed := map[string]*time.Time{}
		for _, item := range pages[0].Value.Items {
			ids = append(ids, item.CharacterId)
			lastPlayed[item.CharacterId] = item.LastPlayedAt
		}
		return ids, lastPlayed
	}
	got, lastPlayed := order("last_game_played")
	if want := []string{never, longAgo, recent}; !slices.Equal(got, want) {
		t.Fatalf("last_game_played order=%v want %v", got, want)
	}
	if lastPlayed[never] != nil || lastPlayed[longAgo] == nil || lastPlayed[recent] == nil || !lastPlayed[longAgo].Before(*lastPlayed[recent]) {
		t.Fatalf("last played never=%v longAgo=%v recent=%v", lastPlayed[never], lastPlayed[longAgo], lastPlayed[recent])
	}
	got, lastPlayed = order("dm_pick")
	if want := []string{recent, never, longAgo}; !slices.Equal(got, want) {
		t.Fatalf("dm_pick order=%v want %v", got, want)
	}
	for id, at := range lastPlayed {
		if at != nil {
			t.Fatalf("dm_pick loaded last played for %s: %v", id, at)
		}
	}
}

// TestQuestSignupTypeRejectsRetiredValues checks the database refuses the old signup types.
func TestQuestSignupTypeRejectsRetiredValues(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	for _, retired := range []string{"open", "application", "invite"} {
		if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET signup_type=$2 WHERE public_id=$1::uuid`, f.questID, retired); err == nil {
			t.Fatalf("signup type %q was accepted", retired)
		}
	}
}
