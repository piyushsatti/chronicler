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
