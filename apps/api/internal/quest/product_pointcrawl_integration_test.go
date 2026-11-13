//go:build integration

package quest

import (
	"context"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func pointcrawlQuestSnapshot(t *testing.T, f questCloseFixture) string {
	t.Helper()
	var links string
	err := f.fixture.Pool.QueryRow(context.Background(), `SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.node_id,v.role),'[]'::jsonb)::text
		FROM quest_pointcrawl_nodes v`).Scan(&links)
	if err != nil {
		t.Fatal(err)
	}
	return questStorageSnapshot(t, f) + links
}

func TestFrontendQuestPointcrawlVisitedUsesCurrentSpatialFacts(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var regionID, mapID, unassignedMap int64
	if err := f.fixture.Pool.QueryRow(ctx, `INSERT INTO regions(name,kind) VALUES('Quest steward region','archon') RETURNING id`).Scan(&regionID); err != nil {
		t.Fatal(err)
	}
	if err := f.fixture.Pool.QueryRow(ctx, `INSERT INTO maps(name,atlas_code,map_kind,region_id) VALUES('Steward map','quest-steward','pointcrawl',$1) RETURNING id`, regionID).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	if err := f.fixture.Pool.QueryRow(ctx, `INSERT INTO maps(name,atlas_code,map_kind) VALUES('Unassigned map','quest-unassigned','pointcrawl') RETURNING id`).Scan(&unassignedMap); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['dm','archon'] WHERE public_id=$1`, f.actor.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO archon_assignments(member_id,region_id) SELECT id,$2 FROM members WHERE public_id=$1`, f.actor.Claims().MemberID, regionID); err != nil {
		t.Fatal(err)
	}
	nodes := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	for index, nodeID := range nodes {
		parent := mapID
		if index == 2 {
			parent = unassignedMap
		}
		if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at) VALUES($1,$2,'Steward node',0,0,now())`, nodeID, parent); err != nil {
			t.Fatal(err)
		}
	}
	// Reversed input and both roles for the same node must retain their pairing.
	spec := SetQuestHexesSpec{QuestId: f.questID, Hexes: []QuestHexFields{{HexId: nodes[1], Role: "expected"}, {HexId: nodes[0], Role: "visited"}, {HexId: nodes[0], Role: "expected"}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	links, err := f.commands.SetQuestPointcrawlLinks(ctx, f.actor, spec, meta)
	if err != nil || len(links) != 3 {
		t.Fatalf("assigned steward links=%+v err=%v", links, err)
	}
	for _, want := range spec.Hexes {
		if !slices.Contains(links, QuestHexView{QuestId: f.questID, HexId: want.HexId, Role: want.Role, Name: "Steward node"}) {
			t.Fatalf("lost node/role pairing %v in %v", want, links)
		}
	}
	before := pointcrawlQuestSnapshot(t, f)
	if _, err := f.commands.SetQuestPointcrawlLinks(ctx, f.actor, spec, meta); err != nil || pointcrawlQuestSnapshot(t, f) != before {
		t.Fatalf("assigned replay changed effects: %v", err)
	}
	_, err = f.commands.SetQuestPointcrawlLinks(ctx, f.actor, SetQuestHexesSpec{QuestId: f.questID, Hexes: []QuestHexFields{{HexId: nodes[2], Role: "visited"}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	if pointcrawlQuestSnapshot(t, f) != before {
		t.Fatal("unassigned visited wrote effects")
	}
	tx, err := f.fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT id FROM maps WHERE id=$1 FOR UPDATE`, mapID); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := f.commands.SetQuestPointcrawlLinks(ctx, f.actor, spec, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		result <- err
	}()
	waitForQuestQueryLock(t, ctx, f, "-- name: LockProductMap")
	if _, err := tx.Exec(ctx, `DELETE FROM archon_assignments WHERE region_id=$1`, regionID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	assertQuestCloseCode(t, <-result, apierr.Forbidden)
	_, err = f.commands.SetQuestPointcrawlLinks(ctx, f.actor, spec, meta)
	assertQuestCloseCode(t, err, apierr.Forbidden)
	if pointcrawlQuestSnapshot(t, f) != before {
		t.Fatal("revoked assignment changed effects or returned saved receipt")
	}
	var hiddenDoc int64
	if err := f.fixture.Pool.QueryRow(ctx, `INSERT INTO documents(kind,category,slug,title,status,visibility,body,author_id)
		SELECT 'codex_entry','location','quest-hidden-node','Hidden node','published','restricted','Secret',owner_id FROM characters WHERE public_id=$1 RETURNING id`, f.characterID).Scan(&hiddenDoc); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by)
		SELECT n.map_id,n.id,$2,'location',now(),d.author_id FROM pointcrawl_nodes n,documents d WHERE n.public_id=$1 AND d.id=$2`, nodes[0], hiddenDoc); err != nil {
		t.Fatal(err)
	}
	before = pointcrawlQuestSnapshot(t, f)
	_, err = f.commands.SetQuestPointcrawlLinks(ctx, f.actor, spec, meta)
	assertQuestCloseCode(t, err, apierr.NotFound)
	if pointcrawlQuestSnapshot(t, f) != before {
		t.Fatal("hidden node replay changed effects or disclosed saved receipt")
	}
}

func TestFrontendQuestPointcrawlReplacementReplayAndRollback(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	var mapID int64
	err := f.fixture.Pool.QueryRow(ctx, `INSERT INTO maps(name,atlas_code,map_kind)
		VALUES('Pointcrawl command regression','quest-regression','pointcrawl') RETURNING id`).Scan(&mapID)
	if err != nil {
		t.Fatal(err)
	}
	nodes := []string{uuid.NewString(), uuid.NewString()}
	for _, nodeID := range nodes {
		_, err := f.fixture.Pool.Exec(ctx, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at)
			VALUES($1,$2,'Visible node',0,0,now())`, nodeID, mapID)
		if err != nil {
			t.Fatal(err)
		}
	}
	spec := SetQuestHexesSpec{QuestId: f.questID, Hexes: []QuestHexFields{{HexId: nodes[1], Role: "expected"}, {HexId: nodes[0], Role: "expected"}}}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	links, err := f.commands.SetQuestPointcrawlLinks(ctx, f.actor, spec, meta)
	if err != nil || len(links) != 2 {
		t.Fatalf("replace=%+v err=%v", links, err)
	}
	for _, nodeID := range nodes {
		found := false
		for _, link := range links {
			if link.HexId == nodeID && link.QuestId == f.questID && link.Role == "expected" {
				found = true
			}
		}
		if !found {
			t.Fatalf("missing actual node %s in %+v", nodeID, links)
		}
	}
	before := pointcrawlQuestSnapshot(t, f)
	replayed, err := f.commands.SetQuestPointcrawlLinks(ctx, f.actor, spec, meta)
	if err != nil || !reflect.DeepEqual(replayed, links) || pointcrawlQuestSnapshot(t, f) != before {
		t.Fatalf("replay changed effects: links=%+v err=%v", replayed, err)
	}
	for _, invalid := range []struct {
		name string
		spec SetQuestHexesSpec
		code apierr.Code
	}{
		{"missing node", SetQuestHexesSpec{QuestId: f.questID, Hexes: []QuestHexFields{{HexId: uuid.NewString(), Role: "expected"}}}, apierr.NotFound},
		{"duplicate key", SetQuestHexesSpec{QuestId: f.questID, Hexes: []QuestHexFields{spec.Hexes[0], spec.Hexes[0]}}, apierr.Invalid},
		{"invalid role", SetQuestHexesSpec{QuestId: f.questID, Hexes: []QuestHexFields{{HexId: nodes[0], Role: "unsupported"}}}, apierr.Invalid},
	} {
		t.Run(invalid.name, func(t *testing.T) {
			_, err := f.commands.SetQuestPointcrawlLinks(ctx, f.actor, invalid.spec, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			assertQuestCloseCode(t, err, invalid.code)
			if pointcrawlQuestSnapshot(t, f) != before {
				t.Fatal("rejected replacement changed junction or command effects")
			}
		})
	}
	links, err = f.commands.SetQuestPointcrawlLinks(ctx, f.actor, SetQuestHexesSpec{QuestId: f.questID}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || len(links) != 0 {
		t.Fatalf("clear=%+v err=%v", links, err)
	}
	var count int
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM quest_pointcrawl_nodes`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("clear persisted count=%d err=%v", count, err)
	}
}
