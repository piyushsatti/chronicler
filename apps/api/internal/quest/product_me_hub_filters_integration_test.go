//go:build integration

package quest

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestProductMeHubSignupAndIdFilters(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	const dmID = "10000000-0000-4000-8000-000000000001"
	const playerID = "10000000-0000-4000-8000-000000000010"
	const otherID = "10000000-0000-4000-8000-000000000011"
	const pastQuest = "10000000-0000-4000-8000-000000000021"
	const futureQuest = "10000000-0000-4000-8000-000000000022"
	const otherQuest = "10000000-0000-4000-8000-000000000023"
	const charID = "10000000-0000-4000-8000-000000000031"
	const otherChar = "10000000-0000-4000-8000-000000000032"
	from := time.Date(2030, 6, 1, 0, 0, 0, 0, time.UTC)
	for _, statement := range []string{
		`INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES
		 ('` + dmID + `','me-hub-dm','me-hub-dm','Me Hub DM',ARRAY['dm']),
		 ('` + playerID + `','me-hub-player','me-hub-player','Me Hub Player',ARRAY['player']),
		 ('` + otherID + `','me-hub-other','me-hub-other','Me Hub Other',ARRAY['player'])`,
		`INSERT INTO documents(kind,slug,title,status,visibility,body,author_id)
		 SELECT 'quest_brief','me-hub-brief','Me hub brief','published','public','',id FROM members WHERE public_id='` + dmID + `'`,
		`INSERT INTO characters(public_id,short_code,name,owner_id,status)
		 SELECT '` + charID + `','C-ME','Hero',id,'active' FROM members WHERE public_id='` + playerID + `'`,
		`INSERT INTO characters(public_id,short_code,name,owner_id,status)
		 SELECT '` + otherChar + `','C-OT','Other',id,'active' FROM members WHERE public_id='` + otherID + `'`,
		`INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by)
		 SELECT '` + pastQuest + `','Q-PAST',ARRAY['standard'],'open',m.id,'2029-01-01T00:00:00Z',d.id,m.id
		 FROM members m CROSS JOIN documents d WHERE m.public_id='` + dmID + `'`,
		`INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by)
		 SELECT '` + futureQuest + `','Q-FUTURE',ARRAY['standard'],'open',m.id,'2030-07-01T00:00:00Z',d.id,m.id
		 FROM members m CROSS JOIN documents d WHERE m.public_id='` + dmID + `'`,
		`INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by)
		 SELECT '` + otherQuest + `','Q-OTHER',ARRAY['standard'],'open',m.id,'2030-08-01T00:00:00Z',d.id,m.id
		 FROM members m CROSS JOIN documents d WHERE m.public_id='` + dmID + `'`,
		`INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		 SELECT q.id,c.id,m.id,'signed_up' FROM quests q, characters c, members m
		 WHERE q.public_id='` + pastQuest + `' AND c.public_id='` + charID + `' AND m.public_id='` + playerID + `'`,
		`INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		 SELECT q.id,c.id,m.id,'signed_up' FROM quests q, characters c, members m
		 WHERE q.public_id='` + futureQuest + `' AND c.public_id='` + charID + `' AND m.public_id='` + playerID + `'`,
		`INSERT INTO quest_participants(quest_id,character_id,member_id,status)
		 SELECT q.id,c.id,m.id,'signed_up' FROM quests q, characters c, members m
		 WHERE q.public_id='` + otherQuest + `' AND c.public_id='` + otherChar + `' AND m.public_id='` + otherID + `'`,
	} {
		if _, err := fixture.Pool.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	actor, err := auth.NewAuthority(playerID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}

	signups, err := adapter.ReadMyQuestSignups(ctx, actor, MyQuestSignupsSpec{
		ScheduledFrom: &from, Limit: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if signups.Total != 1 || len(signups.Items) != 1 || signups.Items[0].QuestId != futureQuest {
		t.Fatalf("scheduledFrom signups = %+v, want only future quest %s", signups, futureQuest)
	}

	page, err := adapter.ReadQuests(ctx, auth.Authority{}, QuestsSpec{
		Filters: &QuestFiltersFields{Ids: []string{futureQuest}},
		Limit:   10,
	})
	if err != nil {
		t.Fatal(err)
	}
	codes := make([]string, 0, len(page.Items))
	for _, item := range page.Items {
		codes = append(codes, item.ShortCode)
	}
	if page.Total != 1 || !slices.Equal(codes, []string{"Q-FUTURE"}) {
		t.Fatalf("ids filter = total %d codes %v, want 1 [Q-FUTURE]", page.Total, codes)
	}
}
