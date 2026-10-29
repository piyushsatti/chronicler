//go:build integration

package delivery_test

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, "close product fixtures:", err)
		code = 1
	}
	os.Exit(code)
}

func TestAnnounceSnapshotProjectsStoredNullablePartyLevel(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	if _, err := fixture.Pool.Exec(ctx, `WITH dm AS (
		INSERT INTO members(discord_id,handle,display_name,roles,status)
		VALUES($1,'announce-dm','Announcement DM',ARRAY['dm'],'active') RETURNING id
	), brief AS (
		INSERT INTO documents(kind,slug,title,status,visibility,body,author_id)
		SELECT 'quest_brief','announce-brief','The Sunken Bell','published','public','Member brief',id FROM dm
		RETURNING id,author_id
	)
	INSERT INTO quests(public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by)
	SELECT $2,'Q1a2b3c4d',ARRAY['standard'],author_id,$3,id,author_id FROM brief`, testDM, testQuestID, testStart); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, want string
		level      any
	}{{"unset", "Any", nil}, {"set", "7", 7}} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := fixture.Pool.Exec(ctx, `UPDATE quests SET avg_party_level=$1 WHERE public_id=$2`, tc.level, testQuestID); err != nil {
				t.Fatal(err)
			}
			snapshot, err := delivery.NewPostgresRevisionApplier(fixture.Pool.Pool).LoadAnnounceQuest(ctx, testQuestID)
			if err != nil {
				t.Fatal(err)
			}
			f := newFakeDiscord(t)
			if err := newSync(f, &fakeQuests{quest: snapshot}, fullSettings, nil).SyncQuest(ctx, testQuestID, 1); err != nil {
				t.Fatal(err)
			}
			message := f.find(http.MethodPost, "/messages")[0].Body["content"].(string)
			if !strings.Contains(message, "\n- **APL** - "+tc.want+"\n") {
				t.Fatalf("stored party level missing from announcement: %q", message)
			}
		})
	}
}
