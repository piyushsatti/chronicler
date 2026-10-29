//go:build integration

package spatial

import (
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

const mapDM = "10000000-0000-4000-8000-000000000004"

func TestPointcrawlNodeStateIsAdminSetAndDefaultsLocked(t *testing.T) {
	f, ctx, commands, resolve := pointcrawlFixture(t)
	if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1,'dm','dm','dm',$2,'active')`, mapDM, []string{"player", "dm"}); err != nil {
		t.Fatal(err)
	}
	admin, _ := resolve(ctx, mapAdmin)
	archon, _ := resolve(ctx, mapArchon)
	player, _ := resolve(ctx, mapPlayer)
	dm, err := resolve(ctx, mapDM)
	if err != nil {
		t.Fatal(err)
	}
	north := mapNorth
	m := pointcrawlCreateMap(t, ctx, commands, archon, &north)
	node := pointcrawlCreateNode(t, ctx, commands, archon, m.Id)
	if node.State != PointcrawlNodeLocked {
		t.Fatalf("new node state=%q, want locked", node.State)
	}
	reader, _ := NewProductPostgres(f.Pool)
	readState := func(actor auth.Authority) string {
		t.Helper()
		lists, err := reader.ReadBatchMapNodes(ctx, actor, []MapNodesKey{{ParentID: m.Id, Limit: 50}})
		if err != nil || len(lists) != 1 || lists[0].Err != nil || lists[0].Value == nil || len(lists[0].Value.Items) != 1 {
			t.Fatalf("node read=%+v err=%v", lists, err)
		}
		return lists[0].Value.Items[0].State
	}
	if got := readState(player); got != PointcrawlNodeLocked {
		t.Fatalf("player read state=%q, want locked", got)
	}

	// Map stewards, DMs and players cannot set state; authority is decided before node lookup.
	for name, actor := range map[string]auth.Authority{"archon steward": archon, "dm": dm, "player": player} {
		_, err := commands.SetPointcrawlNodeState(ctx, actor, SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: node.Id, State: PointcrawlNodeMapped}, pointcrawlMeta())
		if err == nil {
			t.Fatalf("%s set node state", name)
		}
		pointcrawlCode(t, err, apierr.Forbidden)
		_, err = commands.SetPointcrawlNodeState(ctx, actor, SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: uuid.NewString(), State: PointcrawlNodeMapped}, pointcrawlMeta())
		pointcrawlCode(t, err, apierr.Forbidden)
	}
	if got := readState(admin); got != PointcrawlNodeLocked {
		t.Fatalf("state after rejected writes=%q, want locked", got)
	}

	for _, state := range []string{PointcrawlNodeUnlocked, PointcrawlNodeMapped, PointcrawlNodeLocked} {
		view, err := commands.SetPointcrawlNodeState(ctx, admin, SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: node.Id, State: state}, pointcrawlMeta())
		if err != nil || view.State != state || view.Id != node.Id || view.Name != node.Name {
			t.Fatalf("set %s view=%+v err=%v", state, view, err)
		}
		if got := readState(player); got != state {
			t.Fatalf("player read after set %s = %q", state, got)
		}
	}

	key := pointcrawlMeta()
	spec := SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: node.Id, State: PointcrawlNodeMapped}
	first, err := commands.SetPointcrawlNodeState(ctx, admin, spec, key)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := commands.SetPointcrawlNodeState(ctx, admin, spec, key)
	if err != nil || replay.Id != first.Id || replay.State != first.State || !replay.CreatedAt.Equal(first.CreatedAt) {
		t.Fatalf("replay=%+v err=%v, want %+v", replay, err, first)
	}
	_, err = commands.SetPointcrawlNodeState(ctx, admin, SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: node.Id, State: PointcrawlNodeUnlocked}, key)
	pointcrawlCode(t, err, apierr.Conflict)

	_, err = commands.SetPointcrawlNodeState(ctx, admin, SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: uuid.NewString(), State: PointcrawlNodeMapped}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.NotFound)
	_, err = commands.SetPointcrawlNodeState(ctx, admin, SetPointcrawlNodeStateSpec{MapId: uuid.NewString(), NodeId: node.Id, State: PointcrawlNodeMapped}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.NotFound)
	_, err = commands.SetPointcrawlNodeState(ctx, admin, SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: node.Id, State: "hidden"}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)

	// Moving or renaming a node keeps its state.
	moved, err := commands.UpsertPointcrawlNode(ctx, admin, UpsertPointcrawlNodeSpec{MapId: m.Id, Input: PointcrawlNodeFields{Id: &node.Id, Name: "Renamed", X: 1, Y: 2}}, pointcrawlMeta())
	if err != nil || moved.State != PointcrawlNodeMapped {
		t.Fatalf("upsert after state view=%+v err=%v", moved, err)
	}
}

func TestMappingPointcrawlNodeUnlocksOnlyLockedHexNeighbours(t *testing.T) {
	f, ctx, commands, resolve := pointcrawlFixture(t)
	admin, err := resolve(ctx, mapAdmin)
	if err != nil {
		t.Fatal(err)
	}
	north, south := mapNorth, mapSouth
	m := pointcrawlCreateMap(t, ctx, commands, admin, &north)
	other := pointcrawlCreateMap(t, ctx, commands, admin, &south)
	if _, err := f.Pool.Exec(ctx, `UPDATE maps SET grid='hex' WHERE public_id IN ($1,$2)`, m.Id, other.Id); err != nil {
		t.Fatal(err)
	}
	centre := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	forward := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	reverse := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	unlocked := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	mapped := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	path := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	nonNeighbour := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	otherCentre := pointcrawlCreateNode(t, ctx, commands, admin, other.Id)
	otherNeighbour := pointcrawlCreateNode(t, ctx, commands, admin, other.Id)
	for _, item := range []struct {
		node  PointcrawlNodeView
		state string
	}{{unlocked, PointcrawlNodeUnlocked}, {mapped, PointcrawlNodeMapped}} {
		if _, err := f.Pool.Exec(ctx, `UPDATE pointcrawl_nodes SET state=$2 WHERE public_id=$1`, item.node.Id, item.state); err != nil {
			t.Fatal(err)
		}
	}
	for _, edge := range []struct {
		mapID, a, b, kind string
	}{
		{m.Id, centre.Id, forward.Id, "hex"},
		{m.Id, reverse.Id, centre.Id, "hex"},
		{m.Id, centre.Id, unlocked.Id, "hex"},
		{m.Id, centre.Id, mapped.Id, "hex"},
		{m.Id, centre.Id, path.Id, "path"},
		{other.Id, otherCentre.Id, otherNeighbour.Id, "hex"},
	} {
		if _, err := f.Pool.Exec(ctx, `
			INSERT INTO pointcrawl_edges(map_id,node_a,node_b,directed,kind)
			SELECT m.id,a.id,b.id,true,$4
			FROM maps m JOIN pointcrawl_nodes a ON a.map_id=m.id
			JOIN pointcrawl_nodes b ON b.map_id=m.id
			WHERE m.public_id=$1 AND a.public_id=$2 AND b.public_id=$3`, edge.mapID, edge.a, edge.b, edge.kind); err != nil {
			t.Fatal(err)
		}
	}
	key := pointcrawlMeta()
	spec := SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: centre.Id, State: PointcrawlNodeMapped}
	first, err := commands.SetPointcrawlNodeState(ctx, admin, spec, key)
	if err != nil || first.State != PointcrawlNodeMapped {
		t.Fatalf("map centre=%+v err=%v", first, err)
	}
	assertStates := func(centreState string) {
		t.Helper()
		for _, item := range []struct {
			node  PointcrawlNodeView
			state string
		}{
			{centre, centreState},
			{forward, PointcrawlNodeUnlocked},
			{reverse, PointcrawlNodeUnlocked},
			{unlocked, PointcrawlNodeUnlocked},
			{mapped, PointcrawlNodeMapped},
			{path, PointcrawlNodeLocked},
			{nonNeighbour, PointcrawlNodeLocked},
			{otherCentre, PointcrawlNodeLocked},
			{otherNeighbour, PointcrawlNodeLocked},
		} {
			var state string
			if err := f.Pool.QueryRow(ctx, `SELECT state FROM pointcrawl_nodes WHERE public_id=$1`, item.node.Id).Scan(&state); err != nil {
				t.Fatal(err)
			}
			if state != item.state {
				t.Errorf("node %s state=%q, want %q", item.node.Id, state, item.state)
			}
		}
	}
	assertStates(PointcrawlNodeMapped)
	replay, err := commands.SetPointcrawlNodeState(ctx, admin, spec, key)
	if err != nil || replay.Id != first.Id || replay.State != first.State {
		t.Fatalf("replay=%+v err=%v, want %+v", replay, err, first)
	}
	assertStates(PointcrawlNodeMapped)
	for _, state := range []string{PointcrawlNodeUnlocked, PointcrawlNodeLocked} {
		if _, err := commands.SetPointcrawlNodeState(ctx, admin, SetPointcrawlNodeStateSpec{MapId: m.Id, NodeId: centre.Id, State: state}, pointcrawlMeta()); err != nil {
			t.Fatal(err)
		}
		assertStates(state)
	}
}
