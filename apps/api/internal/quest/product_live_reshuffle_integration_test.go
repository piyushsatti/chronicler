//go:build integration

package quest

import (
	"context"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// liveReshuffleFixture is a two-seat Last Game Played quest with a Discord thread
// and two waitlisted players who last played 3 and 10 days ago.
type liveReshuffleFixture struct {
	questCloseFixture
	recent, older string
	snowflake     int
}

func newLiveReshuffleFixture(t *testing.T) *liveReshuffleFixture {
	t.Helper()
	f := &liveReshuffleFixture{questCloseFixture: newQuestCloseFixture(t), snowflake: 100000000000000000}
	setQuestPreplay(t, f.questCloseFixture, true)
	ctx := context.Background()
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET slots_max=2, signup_type='last_game_played', discord_thread_id='345678901234567890' WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	signup := time.Now().UTC().Add(-time.Hour)
	f.recent, f.older = uuid.NewString(), uuid.NewString()
	f.waiter(t, f.recent, signup, 3)
	f.waiter(t, f.older, signup.Add(time.Minute), 10)
	return f
}

// waiter adds a waitlisted character with a Discord id and a played game daysAgo.
func (f *liveReshuffleFixture) waiter(t *testing.T, id string, at time.Time, daysAgo int) {
	t.Helper()
	owner := addQuestWaiter(t, f.questCloseFixture, id, "active", at)
	f.discord(t, owner)
	f.played(t, id, daysAgo)
}

// newcomer adds a character with no participation in the quest yet.
func (f *liveReshuffleFixture) newcomer(t *testing.T, daysAgo int) string {
	t.Helper()
	ctx := context.Background()
	owner, id := uuid.NewString(), uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,status) VALUES($1::uuid,$1::text,$1::text,'Late Player','active')`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status) SELECT $1::uuid,$1::text,'Late Character',id,'active' FROM members WHERE public_id=$2`, id, owner); err != nil {
		t.Fatal(err)
	}
	f.discord(t, owner)
	if daysAgo > 0 {
		f.played(t, id, daysAgo)
	}
	return id
}

func (f *liveReshuffleFixture) discord(t *testing.T, member string) {
	t.Helper()
	f.snowflake++
	if _, err := f.fixture.Pool.Exec(context.Background(), `UPDATE members SET discord_id=$2 WHERE public_id=$1`, member, fmt.Sprint(f.snowflake)); err != nil {
		t.Fatal(err)
	}
}

func (f *liveReshuffleFixture) played(t *testing.T, character string, daysAgo int) {
	t.Helper()
	ctx := context.Background()
	prior := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,created_by,slots_max,filled_count,document_id)
		SELECT $1::uuid,$1::text,ARRAY['standard'],'closed',q.dm_id,now()-make_interval(days => $2::int),q.dm_id,2,1,q.document_id FROM quests q WHERE q.public_id=$3::uuid`, prior, daysAgo, f.questID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		SELECT q.id,c.id,c.owner_id,'played' FROM quests q,characters c WHERE q.public_id=$1::uuid AND c.public_id=$2::uuid`, prior, character); err != nil {
		t.Fatal(err)
	}
}

func (f *liveReshuffleFixture) signup(t *testing.T, character string) QuestParticipantView {
	t.Helper()
	joined, err := f.commands.SignupForQuest(context.Background(), questCharacterActor(t, f.questCloseFixture, character), SignupForQuestSpec{QuestId: f.questID, CharacterId: character}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatalf("signup %s: %v", character, err)
	}
	return joined
}

func (f *liveReshuffleFixture) fill(t *testing.T) []QuestParticipantView {
	t.Helper()
	seated, err := f.commands.SelectQuestParticipants(context.Background(), f.actor, SelectQuestParticipantsSpec{QuestId: f.questID, FillByLastGamePlayed: true}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatalf("fill: %v", err)
	}
	return seated
}

func (f *liveReshuffleFixture) publish(t *testing.T) {
	t.Helper()
	if _, err := f.commands.PublishQuestPlayerList(context.Background(), f.actor, PublishQuestPlayerListSpec{QuestId: f.questID}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatalf("publish: %v", err)
	}
}

// seated returns the seated characters, sorted.
func (f *liveReshuffleFixture) seated(t *testing.T) []string {
	t.Helper()
	rows, err := f.fixture.Pool.Query(context.Background(), `SELECT c.public_id::text FROM quest_participants qp JOIN quests q ON q.id=qp.quest_id JOIN characters c ON c.id=qp.character_id WHERE q.public_id=$1 AND qp.status='signed_up' ORDER BY 1`, f.questID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

// promotions counts waitlist-promotion notices for the character's owner.
func (f *liveReshuffleFixture) promotions(t *testing.T, character string) int {
	t.Helper()
	var n int
	if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications n JOIN characters c ON c.owner_id=n.member_id WHERE c.public_id=$1 AND n.kind='QUEST_WAITLIST_PROMOTED'`, character).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (f *liveReshuffleFixture) quest(t *testing.T) QuestView {
	t.Helper()
	reader, _ := NewProductPostgres(f.fixture.Pool)
	view, err := reader.ReadQuest(context.Background(), f.actor, QuestSpec{Id: &f.questID, AsOf: time.Now()})
	if err != nil || view == nil {
		t.Fatalf("quest=%v err=%v", view, err)
	}
	return *view
}

func (f *liveReshuffleFixture) filled(t *testing.T) int {
	t.Helper()
	var n int
	if err := f.fixture.Pool.QueryRow(context.Background(), `SELECT filled_count FROM quests WHERE public_id=$1`, f.questID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func sorted(ids ...string) []string {
	out := slices.Clone(ids)
	slices.Sort(out)
	return out
}

// TestLiveReshuffleSeatsLaterLongerAgoSignupsUntilPublish walks #213 end to end: the
// fill opens the live window, a later signup who played longer ago takes the
// lowest-priority fill seat, a more recent one waits, and publish closes the window
// and sends the held notices once.
func TestLiveReshuffleSeatsLaterLongerAgoSignupsUntilPublish(t *testing.T) {
	f := newLiveReshuffleFixture(t)
	if f.quest(t).LiveReshuffle() {
		t.Fatal("live before fill")
	}
	f.fill(t)
	if got := f.seated(t); !slices.Equal(got, sorted(f.recent, f.older)) {
		t.Fatalf("seated after fill=%v", got)
	}
	if view := f.quest(t); !view.LiveReshuffle() || view.LiveFillStartedAt == nil {
		t.Fatalf("not live after fill: %+v", view)
	}
	if f.promotions(t, f.recent)+f.promotions(t, f.older) != 0 {
		t.Fatal("fill sent seat notices while live")
	}

	longAgo := f.newcomer(t, 90)
	if joined := f.signup(t, longAgo); joined.Status != "signed_up" || !joined.SeatNoticeHeld {
		t.Fatalf("longer-ago signup=%+v", joined)
	}
	if got := f.seated(t); !slices.Equal(got, sorted(f.older, longAgo)) {
		t.Fatalf("seated after longer-ago signup=%v want older+longAgo", got)
	}
	if f.filled(t) != 2 {
		t.Fatalf("filled=%d after swap", f.filled(t))
	}

	recentest := f.newcomer(t, 1)
	if joined := f.signup(t, recentest); joined.Status != "waitlisted" {
		t.Fatalf("more recent signup=%+v", joined)
	}
	if got := f.seated(t); !slices.Equal(got, sorted(f.older, longAgo)) {
		t.Fatalf("seated after recent signup=%v", got)
	}

	f.publish(t)
	if view := f.quest(t); view.LiveReshuffle() || view.PlayerListPublishedAt == nil {
		t.Fatalf("still live after publish: %+v", view)
	}
	if f.promotions(t, f.older) != 1 || f.promotions(t, longAgo) != 1 || f.promotions(t, f.recent) != 0 {
		t.Fatalf("notices older=%d longAgo=%d recent=%d", f.promotions(t, f.older), f.promotions(t, longAgo), f.promotions(t, f.recent))
	}

	never := f.newcomer(t, 0)
	if joined := f.signup(t, never); joined.Status != "waitlisted" {
		t.Fatalf("signup after publish=%+v", joined)
	}
	f.publish(t)
	if f.promotions(t, f.older) != 1 || f.promotions(t, longAgo) != 1 {
		t.Fatal("republish resent notices")
	}
}

// TestLiveReshuffleTakesOpenSeatAndNeverMovesDMPick checks that a live signup takes
// a seat the fill left open, and that a DM pick is never bumped.
func TestLiveReshuffleTakesOpenSeatAndNeverMovesDMPick(t *testing.T) {
	f := newLiveReshuffleFixture(t)
	ctx := context.Background()
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET slots_max=3 WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.commands.SelectQuestParticipants(ctx, f.actor, SelectQuestParticipantsSpec{QuestId: f.questID, CharacterIds: []string{f.recent}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatalf("dm pick: %v", err)
	}
	if f.promotions(t, f.recent) != 1 {
		t.Fatal("dm pick notice missing")
	}
	f.fill(t)
	if got := f.seated(t); !slices.Equal(got, sorted(f.recent, f.older)) || f.filled(t) != 2 {
		t.Fatalf("seated after fill=%v filled=%d", got, f.filled(t))
	}

	open := f.newcomer(t, 200)
	if joined := f.signup(t, open); joined.Status != "signed_up" {
		t.Fatalf("open-seat signup=%+v", joined)
	}
	if f.filled(t) != 3 {
		t.Fatalf("filled=%d want 3", f.filled(t))
	}

	never := f.newcomer(t, 0)
	if joined := f.signup(t, never); joined.Status != "signed_up" {
		t.Fatalf("never-played signup=%+v", joined)
	}
	// The DM pick (3 days) stays; the held seat with the most recent game (older, 10 days) goes.
	if got := f.seated(t); !slices.Equal(got, sorted(f.recent, open, never)) {
		t.Fatalf("seated=%v want dm pick, open, never", got)
	}
	if f.promotions(t, f.recent) != 1 {
		t.Fatal("dm pick got a second notice")
	}
}

// TestLiveReshuffleWithdrawalPromotionIsHeld checks that a withdrawal promotion
// inside the live window is held for publish like a fill seat.
func TestLiveReshuffleWithdrawalPromotionIsHeld(t *testing.T) {
	f := newLiveReshuffleFixture(t)
	ctx := context.Background()
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quests SET slots_max=1 WHERE public_id=$1`, f.questID); err != nil {
		t.Fatal(err)
	}
	f.fill(t)
	if got := f.seated(t); !slices.Equal(got, []string{f.older}) {
		t.Fatalf("seated=%v want older", got)
	}
	if _, err := f.commands.WithdrawFromQuest(ctx, questCharacterActor(t, f.questCloseFixture, f.older), WithdrawFromQuestSpec{QuestId: f.questID, CharacterId: f.older}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	if got := f.seated(t); !slices.Equal(got, []string{f.recent}) {
		t.Fatalf("seated after withdrawal=%v", got)
	}
	if f.promotions(t, f.recent) != 0 {
		t.Fatal("withdrawal promotion notice sent while live")
	}
	f.publish(t)
	if f.promotions(t, f.recent) != 1 {
		t.Fatal("held withdrawal promotion not announced at publish")
	}
}
