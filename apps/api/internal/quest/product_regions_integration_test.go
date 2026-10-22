//go:build integration

package quest

import (
	"context"
	"reflect"
	"slices"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestFrontendQuestRegionsProjectAcrossCommandsAndReads(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	regions := []string{uuid.NewString(), uuid.NewString()}
	for _, id := range regions {
		if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Quest regions regression','server')`, id); err != nil {
			t.Fatal(err)
		}
	}
	input := editorQuestInput()
	input.Input.RegionIds = regions
	created, err := f.commands.CreateQuest(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(regions)
	assertRegions := func(view *QuestView) {
		t.Helper()
		if view == nil || !reflect.DeepEqual(view.Regions, regions) {
			t.Fatalf("regions want=%v actual=%+v", regions, view)
		}
	}
	assertRegions(&created)
	repo, _ := NewProductPostgres(f.fixture.Pool)
	byCode, err := repo.ReadQuest(ctx, f.actor, QuestSpec{ShortCode: &created.ShortCode})
	if err != nil {
		t.Fatal(err)
	}
	assertRegions(byCode)
	missing := uuid.NewString()
	batch, err := repo.ReadBatchQuests(ctx, f.actor, []IDKey{{ID: created.Id}, {ID: missing}, {ID: created.Id}})
	if err != nil || len(batch) != 3 || batch[1].Value != nil {
		t.Fatalf("batch=%+v err=%v", batch, err)
	}
	assertRegions(batch[0].Value)
	assertRegions(batch[2].Value)
	arc, err := f.commands.UpsertQuestArc(ctx, f.actor, UpsertQuestArcSpec{Name: "Region projection arc"}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: created.UpdatedAt, ArcId: product.Optional[string]{Set: true, Value: &arc.Id}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	assertRegions(&updated)
	list, err := repo.ReadQuests(ctx, f.actor, QuestsSpec{Filters: &QuestFiltersFields{ShortCodes: []string{created.ShortCode}}, Limit: 20})
	if err != nil || len(list.Items) != 1 {
		t.Fatalf("list=%+v err=%v", list, err)
	}
	assertRegions(&list.Items[0])
	board, err := repo.ReadQuestBoard(ctx, f.actor, QuestBoardSpec{RegionId: &regions[0], Limit: 20})
	if err != nil || len(board.Items) != 1 {
		t.Fatalf("board=%+v err=%v", board, err)
	}
	assertRegions(&board.Items[0])
	arcs, err := repo.ReadBatchArcQuests(ctx, f.actor, []ArcQuestsKey{{ParentID: arc.Id, Limit: 20}, {ParentID: arc.Id, Limit: 20, Offset: 100}})
	if err != nil || len(arcs) != 2 || arcs[0].Value == nil || len(arcs[0].Value.Items) != 1 || arcs[1].Value == nil || len(arcs[1].Value.Items) != 0 {
		t.Fatalf("arc=%+v err=%v", arcs, err)
	}
	assertRegions(&arcs[0].Value.Items[0])
	played, err := f.commands.TransitionQuestStatus(ctx, f.actor, TransitionQuestStatusSpec{Id: created.Id, To: "played"}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	assertRegions(&played)
	history, err := repo.ReadDmSessionHistory(ctx, f.actor, DmSessionHistorySpec{MemberId: f.actor.Claims().MemberID, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range history.Items {
		if item.Quest.Id == created.Id {
			assertRegions(&item.Quest)
			found = true
		}
	}
	if !found {
		t.Fatal("played Quest absent from DM history")
	}
	closed, err := f.commands.CloseQuest(ctx, f.actor, CloseQuestSpec{Id: created.Id, Input: CloseQuestFields{}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	assertRegions(&closed)
	recent, err := repo.ReadRecentlyClosedQuests(ctx, f.actor, RecentlyClosedQuestsSpec{RegionId: &regions[0], Limit: 20})
	if err != nil || len(recent.Items) != 1 {
		t.Fatalf("recent=%+v err=%v", recent, err)
	}
	assertRegions(&recent.Items[0])
	empty := []string{}
	cleared, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: closed.UpdatedAt, RegionIds: product.Optional[[]string]{Set: true, Value: &empty}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || cleared.Regions == nil || len(cleared.Regions) != 0 {
		t.Fatalf("clear=%+v err=%v", cleared, err)
	}
	before := questStorageSnapshot(t, f)
	_, err = f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{ExpectedUpdatedAt: created.UpdatedAt, RegionIds: product.Optional[[]string]{Set: true, Value: &regions}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Conflict)
	current, err := repo.ReadQuest(ctx, f.actor, QuestSpec{Id: &created.Id})
	if err != nil || current == nil || len(current.Regions) != 0 || questStorageSnapshot(t, f) != before {
		t.Fatalf("stale region replacement changed state: %+v %v", current, err)
	}
}
