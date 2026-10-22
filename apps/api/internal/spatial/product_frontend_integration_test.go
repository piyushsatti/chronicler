//go:build integration

package spatial

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	mapAdmin  = "10000000-0000-4000-8000-000000000001"
	mapArchon = "10000000-0000-4000-8000-000000000002"
	mapPlayer = "10000000-0000-4000-8000-000000000003"
	mapNorth  = "20000000-0000-4000-8000-000000000001"
	mapSouth  = "20000000-0000-4000-8000-000000000002"
)

func pointcrawlFixture(t *testing.T) (*dbtest.ProductFixture, context.Context, *ProductCommands, auth.AuthorityResolver) {
	t.Helper()
	f := dbtest.NewProductFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	t.Cleanup(cancel)
	for _, member := range []struct {
		id, handle string
		roles      []string
	}{
		{mapAdmin, "admin", []string{"admin", "archon"}}, {mapArchon, "archon", []string{"player", "archon"}}, {mapPlayer, "player", []string{"player"}},
	} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1,$2,$2,$2,$3,'active')`, member.id, member.handle, member.roles); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{mapNorth, mapSouth} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Region','archon')`, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO archon_assignments(member_id,region_id) SELECT m.id,r.id FROM members m,regions r WHERE m.public_id=$1 AND r.public_id=$2`, mapArchon, mapNorth); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO archon_assignments(member_id,region_id) SELECT m.id,r.id FROM members m,regions r WHERE m.public_id=$1`, mapAdmin); err != nil {
		t.Fatal(err)
	}
	resolve := func(ctx context.Context, id string) (auth.Authority, error) {
		parsed, err := db.ParseUUID(id)
		if err != nil {
			return auth.Authority{}, err
		}
		row, err := dbgen.New(f.Pool).GetMemberAuthority(ctx, parsed)
		if err != nil {
			return auth.Authority{}, err
		}
		roles := make([]auth.Role, len(row.Roles))
		for i, role := range row.Roles {
			roles[i] = auth.Role(role)
		}
		return auth.NewAuthorityWithHandle(id, roles, row.Status, row.DmStatus, row.Handle)
	}
	runner := db.NewRunner(f.Pool, func(tx pgx.Tx) ProductCommandRepos {
		spatialPG, _ := NewProductPostgres(tx)
		docPG, _ := document.NewProductPostgres(tx)
		policy, _ := auth.NewPoolPolicy(tx)
		replay, _ := idempotency.NewRepository(tx)
		audit, _ := auth.NewOverrideRecorder(replay)
		return ProductCommandRepos{Map: spatialPG, Region: spatialPG, Time: spatialPG, Containment: spatialPG, Locations: docPG, Documents: docPG, Policy: policy, Authority: resolve, Replay: replay, Audit: audit}
	})
	commands, err := NewProductCommands(runner, func() time.Time { return time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC) }, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	return f, ctx, commands, resolve
}

func pointcrawlCode(t *testing.T, err error, want apierr.Code) {
	t.Helper()
	expected, ok := errors.AsType[*apierr.Error](err)
	if !ok || expected.Code != want {
		t.Fatalf("error=%v, want %s", err, want)
	}
}

func pointcrawlMeta() product.CommandMeta {
	return product.CommandMeta{IdempotencyKey: uuid.NewString()}
}

func pointcrawlCreateMap(t *testing.T, ctx context.Context, commands *ProductCommands, actor auth.Authority, region *string) MapView {
	t.Helper()
	view, err := commands.CreateMap(ctx, actor, CreateMapSpec{Input: MapCreateFields{Name: "Atlas", AtlasCode: uuid.NewString(), MapKind: "pointcrawl", Family: "campaign", RegionId: region}}, pointcrawlMeta())
	if err != nil {
		t.Fatal(err)
	}
	return view
}

func pointcrawlCreateNode(t *testing.T, ctx context.Context, commands *ProductCommands, actor auth.Authority, mapID string) PointcrawlNodeView {
	t.Helper()
	view, err := commands.UpsertPointcrawlNode(ctx, actor, UpsertPointcrawlNodeSpec{MapId: mapID, Input: PointcrawlNodeFields{Name: "Node", X: math.MaxFloat64, Y: -math.MaxFloat64}}, pointcrawlMeta())
	if err != nil {
		t.Fatal(err)
	}
	return view
}

func pointcrawlCreateDocument(t *testing.T, f *dbtest.ProductFixture, ctx context.Context, category, visibility string) string {
	t.Helper()
	id := uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry',$5,$2,$2,'published',$3,'canonical body',m.id,1 FROM members m WHERE m.public_id=$4`, id, category, visibility, mapAdmin, "document-"+id); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestFrontendPointcrawlCommandsAndCurrentAuthority(t *testing.T) {
	f, ctx, commands, resolve := pointcrawlFixture(t)
	archon, _ := resolve(ctx, mapArchon)
	admin, _ := resolve(ctx, mapAdmin)
	player, _ := resolve(ctx, mapPlayer)
	north, south := mapNorth, mapSouth
	m := pointcrawlCreateMap(t, ctx, commands, archon, &north)
	if !m.CanEdit {
		t.Fatal("creator capability omitted")
	}
	other := pointcrawlCreateMap(t, ctx, commands, admin, &south)
	if _, err := commands.CreateMap(ctx, archon, CreateMapSpec{Input: MapCreateFields{Name: "No region", AtlasCode: "no-region", MapKind: "pointcrawl", Family: "campaign"}}, pointcrawlMeta()); err == nil {
		t.Fatal("archon created regionless map")
	}
	regionless := pointcrawlCreateMap(t, ctx, commands, admin, nil)
	reader, _ := NewProductPostgres(f.Pool)
	policy, _ := auth.NewPoolPolicy(f.Pool)
	queries := ProductQueries{Reads: ProductReadRepos{Map: reader}, Policy: policy}
	for _, item := range []struct {
		actor auth.Authority
		atlas string
		edit  bool
	}{{archon, m.AtlasCode, true}, {player, m.AtlasCode, false}, {archon, regionless.AtlasCode, false}, {admin, regionless.AtlasCode, true}} {
		view, err := queries.Map(ctx, item.actor, MapSpec{AtlasCode: item.atlas})
		if err != nil || view.CanEdit != item.edit {
			t.Fatalf("capability=%+v err=%v want=%v", view, err, item.edit)
		}
	}
	a := pointcrawlCreateNode(t, ctx, commands, archon, m.Id)
	b := pointcrawlCreateNode(t, ctx, commands, archon, m.Id)
	alien := pointcrawlCreateNode(t, ctx, commands, admin, other.Id)
	_, err := commands.UpsertPointcrawlNode(ctx, archon, UpsertPointcrawlNodeSpec{MapId: m.Id, Input: PointcrawlNodeFields{Id: &alien.Id, Name: "Wrong map"}}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	_, err = commands.SetPointcrawlEdge(ctx, archon, SetPointcrawlEdgeSpec{MapId: m.Id, Input: PointcrawlEdgeFields{NodeA: a.Id, NodeB: alien.Id, Kind: "path"}}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	submap := UpsertPointcrawlNodeSpec{MapId: m.Id, Input: PointcrawlNodeFields{Id: &a.Id, Name: a.Name, SubmapId: &other.Id}}
	_, err = commands.UpsertPointcrawlNode(ctx, archon, submap, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Forbidden)
	if _, err = commands.UpsertPointcrawlNode(ctx, admin, submap, pointcrawlMeta()); err != nil {
		t.Fatal(err)
	}
	_, err = commands.UpsertPointcrawlNode(ctx, admin, UpsertPointcrawlNodeSpec{MapId: other.Id, Input: PointcrawlNodeFields{Id: &alien.Id, Name: alien.Name, SubmapId: &m.Id}}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	location := pointcrawlCreateDocument(t, f, ctx, "Locations", "public")
	linkSpec := LinkPointcrawlEntrySpec{MapId: m.Id, NodeId: b.Id, DocumentId: location, Relation: "location"}
	key := pointcrawlMeta()
	link, err := commands.LinkPointcrawlEntry(ctx, archon, linkSpec, key)
	if err != nil || link.DocumentId != location {
		t.Fatalf("link=%+v err=%v", link, err)
	}
	if _, err = commands.LinkPointcrawlEntry(ctx, archon, linkSpec, key); err != nil {
		t.Fatal(err)
	}
	_, err = commands.LinkPointcrawlEntry(ctx, archon, linkSpec, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Conflict)
	lore := pointcrawlCreateDocument(t, f, ctx, "Lore", "public")
	_, err = commands.LinkPointcrawlEntry(ctx, archon, LinkPointcrawlEntrySpec{MapId: m.Id, NodeId: a.Id, DocumentId: lore, Relation: "location"}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	if _, err = commands.LinkPointcrawlEntry(ctx, archon, LinkPointcrawlEntrySpec{MapId: m.Id, NodeId: a.Id, DocumentId: lore, Relation: "subject"}, pointcrawlMeta()); err != nil {
		t.Fatal(err)
	}
	if _, err = f.Pool.Exec(ctx, `DELETE FROM archon_assignments WHERE member_id=(SELECT id FROM members WHERE public_id=$1)`, mapArchon); err != nil {
		t.Fatal(err)
	}
	_, err = commands.LinkPointcrawlEntry(ctx, archon, linkSpec, key)
	pointcrawlCode(t, err, apierr.Forbidden)
	view, err := queries.Map(ctx, archon, MapSpec{AtlasCode: m.AtlasCode})
	if err != nil || view.CanEdit {
		t.Fatalf("revoked capability=%+v err=%v", view, err)
	}
	if _, err = f.Pool.Exec(ctx, `INSERT INTO archon_assignments(member_id,region_id) SELECT m.id,r.id FROM members m,regions r WHERE m.public_id=$1 AND r.public_id=$2`, mapArchon, mapNorth); err != nil {
		t.Fatal(err)
	}
	if _, err = f.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player']::text[] WHERE public_id=$1`, mapArchon); err != nil {
		t.Fatal(err)
	}
	_, err = commands.LinkPointcrawlEntry(ctx, archon, linkSpec, key)
	pointcrawlCode(t, err, apierr.Forbidden)
	if _, err = f.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player','archon']::text[] WHERE public_id=$1`, mapArchon); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err = commands.UnlinkPointcrawlEntry(ctx, archon, UnlinkPointcrawlEntrySpec(linkSpec), pointcrawlMeta()); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = commands.UnlinkPointcrawlEntry(ctx, archon, UnlinkPointcrawlEntrySpec{MapId: m.Id, NodeId: b.Id, DocumentId: uuid.NewString(), Relation: "location"}, pointcrawlMeta()); err != nil {
		t.Fatalf("absent Document identity must be a no-op: %v", err)
	}
	var body string
	var version int32
	if err = f.Pool.QueryRow(ctx, `SELECT body,version FROM documents WHERE public_id=$1`, location).Scan(&body, &version); err != nil || body != "canonical body" || version != 1 {
		t.Fatalf("unlink changed Document body=%q version=%d err=%v", body, version, err)
	}
}

func TestFrontendPointcrawlUnassignedAdminOverride(t *testing.T) {
	f, ctx, commands, resolve := pointcrawlFixture(t)
	if _, err := f.Pool.Exec(ctx, `DELETE FROM archon_assignments WHERE member_id=(SELECT id FROM members WHERE public_id=$1)`, mapAdmin); err != nil {
		t.Fatal(err)
	}
	admin, _ := resolve(ctx, mapAdmin)
	north := mapNorth
	view := pointcrawlCreateMap(t, ctx, commands, admin, &north)
	if !view.CanEdit {
		t.Fatal("admin override capability omitted")
	}
	var raw json.RawMessage
	if err := f.Pool.QueryRow(ctx, `SELECT receipt->'_authorizationOverrides' FROM idempotency_keys WHERE endpoint='graphql:createMap' AND receipt->>'Id'=$1`, view.Id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var facts []idempotency.CommandOverrideFact
	if err := idempotency.StrictJSON(raw, &facts); err != nil || len(facts) != 1 || facts[0].ActorID != mapAdmin || facts[0].SubjectType != "spatial" || facts[0].SubjectID != view.Id || facts[0].Operation != "Mutation.createMap" || facts[0].RuleCode != "ASSIGNMENT" {
		t.Fatalf("actual created Map fact=%s err=%v", raw, err)
	}
}

func TestFrontendPointcrawlRegionLifecycleAndAssignments(t *testing.T) {
	_, ctx, commands, resolve := pointcrawlFixture(t)
	admin, _ := resolve(ctx, mapAdmin)
	_, err := commands.AssignArchon(ctx, admin, AssignArchonSpec{MemberId: mapPlayer, RegionId: mapNorth}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	first, err := commands.AssignArchon(ctx, admin, AssignArchonSpec{MemberId: mapArchon, RegionId: mapNorth}, pointcrawlMeta())
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := commands.AssignArchon(ctx, admin, AssignArchonSpec{MemberId: mapArchon, RegionId: mapNorth}, pointcrawlMeta())
	if err != nil || !first.GrantedAt.Equal(duplicate.GrantedAt) {
		t.Fatalf("duplicate assignment=%+v first=%+v err=%v", duplicate, first, err)
	}
	for range 2 {
		if _, err = commands.RevokeArchon(ctx, admin, RevokeArchonSpec{MemberId: mapArchon, RegionId: mapSouth}, pointcrawlMeta()); err != nil {
			t.Fatal(err)
		}
	}
	_, err = commands.CreateRegion(ctx, admin, CreateRegionSpec{Input: RegionFields{Name: strings.Repeat("界", 201), Kind: "uncharted"}}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	region, err := commands.CreateRegion(ctx, admin, CreateRegionSpec{Input: RegionFields{Name: strings.Repeat("界", 200), Kind: "uncharted"}}, pointcrawlMeta())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = commands.AssignArchon(ctx, admin, AssignArchonSpec{MemberId: mapAdmin, RegionId: region.Id}, pointcrawlMeta()); err != nil {
		t.Fatal(err)
	}
	_, err = commands.UpdateRegion(ctx, admin, UpdateRegionSpec{Id: region.Id, Input: RegionFields{Name: strings.Repeat("界", 201), Kind: region.Kind}}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	_, err = commands.UpdateRegion(ctx, admin, UpdateRegionSpec{Id: region.Id, Input: RegionFields{Name: region.Name, Kind: "server"}}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	_, err = commands.TransitionRegion(ctx, admin, TransitionRegionSpec{Id: region.Id, To: "server"}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Conflict)
	for _, kind := range []string{"archon", "server"} {
		region, err = commands.TransitionRegion(ctx, admin, TransitionRegionSpec{Id: region.Id, To: kind}, pointcrawlMeta())
		if err != nil || region.Kind != kind {
			t.Fatalf("transition=%+v err=%v", region, err)
		}
	}
	_, err = commands.TransitionRegion(ctx, admin, TransitionRegionSpec{Id: region.Id, To: "archon"}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Conflict)
	for range 2 {
		if _, err = commands.DeleteRegion(ctx, admin, DeleteRegionSpec{RegionId: region.Id}, pointcrawlMeta()); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		region, err = commands.RestoreRegion(ctx, admin, RestoreRegionSpec{RegionId: region.Id}, pointcrawlMeta())
		if err != nil || region.Kind != "server" {
			t.Fatalf("restored=%+v err=%v", region, err)
		}
	}
}

func TestFrontendPointcrawlPrivacyRegionPreservationAndRollback(t *testing.T) {
	f, ctx, commands, resolve := pointcrawlFixture(t)
	admin, _ := resolve(ctx, mapAdmin)
	archon, _ := resolve(ctx, mapArchon)
	player, _ := resolve(ctx, mapPlayer)
	north := mapNorth
	m := pointcrawlCreateMap(t, ctx, commands, admin, &north)
	a := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	b := pointcrawlCreateNode(t, ctx, commands, admin, m.Id)
	hidden := pointcrawlCreateDocument(t, f, ctx, "Locations", "restricted")
	if _, err := commands.LinkPointcrawlEntry(ctx, admin, LinkPointcrawlEntrySpec{MapId: m.Id, NodeId: a.Id, DocumentId: hidden, Relation: "location"}, pointcrawlMeta()); err != nil {
		t.Fatal(err)
	}
	if _, err := commands.SetPointcrawlEdge(ctx, admin, SetPointcrawlEdgeSpec{MapId: m.Id, Input: PointcrawlEdgeFields{NodeA: a.Id, NodeB: b.Id, Kind: " path "}}, pointcrawlMeta()); err != nil {
		t.Fatal(err)
	}
	reader, _ := NewProductPostgres(f.Pool)
	for _, item := range []struct {
		actor        auth.Authority
		nodes, edges int
		count        int32
	}{{player, 1, 0, 1}, {admin, 2, 1, 2}} {
		nodes, err := reader.ReadBatchMapNodes(ctx, item.actor, []MapNodesKey{{ParentID: m.Id, Limit: 20}})
		if err != nil || len(nodes[0].Value.Items) != item.nodes {
			t.Fatalf("nodes=%+v err=%v", nodes, err)
		}
		edges, err := reader.ReadBatchMapNodeEdges(ctx, item.actor, []MapNodeEdgesKey{{ParentID: m.Id, Limit: 20}})
		if err != nil || len(edges[0].Value.Items) != item.edges {
			t.Fatalf("edges=%+v err=%v", edges, err)
		}
		counts, err := reader.ReadRegionCounts(ctx, item.actor, RegionCountsSpec{RegionId: north})
		if err != nil || counts.FeatureCount != item.count {
			t.Fatalf("counts=%+v err=%v", counts, err)
		}
	}
	empty := pointcrawlCreateMap(t, ctx, commands, archon, &north)
	nodes, err := reader.ReadBatchMapNodes(ctx, player, []MapNodesKey{{ParentID: empty.Id, Limit: 20}, {ParentID: m.Id, Limit: 20, Offset: 50}})
	if err != nil {
		t.Fatal(err)
	}
	for _, result := range nodes {
		if result.Err != nil || result.Value == nil || len(result.Value.Items) != 0 {
			t.Fatalf("empty nodes=%+v", result)
		}
	}
	edges, err := reader.ReadBatchMapNodeEdges(ctx, player, []MapNodeEdgesKey{{ParentID: empty.Id, Limit: 20}, {ParentID: m.Id, Limit: 20, Offset: 50}})
	if err != nil {
		t.Fatal(err)
	}
	for _, result := range edges {
		if result.Err != nil || result.Value == nil || len(result.Value.Items) != 0 {
			t.Fatalf("empty edges=%+v", result)
		}
	}
	links, err := reader.ReadBatchNodeLinks(ctx, player, []NodeLinksKey{{ParentID: b.Id, Limit: 20}, {ParentID: a.Id, Limit: 20}})
	if err != nil || links[0].Err != nil || links[0].Value == nil || len(links[0].Value.Items) != 0 {
		t.Fatalf("empty links=%+v err=%v", links, err)
	}
	pointcrawlCode(t, links[1].Err, apierr.NotFound)
	if _, err = commands.UnlinkPointcrawlEntry(ctx, archon, UnlinkPointcrawlEntrySpec{MapId: m.Id, NodeId: b.Id, DocumentId: hidden, Relation: "location"}, pointcrawlMeta()); err != nil {
		t.Fatalf("absent hidden Document link must be a no-op: %v", err)
	}
	_, err = commands.UnlinkPointcrawlEntry(ctx, archon, UnlinkPointcrawlEntrySpec{MapId: m.Id, NodeId: a.Id, DocumentId: hidden, Relation: "location"}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Forbidden)
	_, err = commands.SetPointcrawlEdge(ctx, archon, SetPointcrawlEdgeSpec{MapId: m.Id, Input: PointcrawlEdgeFields{NodeA: a.Id, NodeB: b.Id, Kind: "trail", DocumentId: &hidden}}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Forbidden)
	deadline := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	if _, err = f.Pool.Exec(ctx, `UPDATE regions SET document_id=(SELECT id FROM documents WHERE public_id=$1),charter_deadline=$2 WHERE public_id=$3`, hidden, deadline, north); err != nil {
		t.Fatal(err)
	}
	region, err := commands.UpdateRegion(ctx, archon, UpdateRegionSpec{Id: north, Input: RegionFields{Name: "North renamed", Kind: "archon"}}, pointcrawlMeta())
	if err != nil || region.DocumentId != nil || region.CharterDeadline == nil || !region.CharterDeadline.Equal(deadline) {
		t.Fatalf("region=%+v err=%v", region, err)
	}
	var retained string
	if err = f.Pool.QueryRow(ctx, `SELECT d.public_id::text FROM regions r JOIN documents d ON d.id=r.document_id WHERE r.public_id=$1`, north).Scan(&retained); err != nil || retained != hidden {
		t.Fatalf("preserved document=%q err=%v", retained, err)
	}
	before := 0
	if err = f.Pool.QueryRow(ctx, `SELECT count(*) FROM idempotency_keys`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	_, err = commands.DeleteRegion(ctx, admin, DeleteRegionSpec{RegionId: north}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Conflict)
	after := 0
	if err = f.Pool.QueryRow(ctx, `SELECT count(*) FROM idempotency_keys`).Scan(&after); err != nil || before != after {
		t.Fatalf("failed delete committed receipt before=%d after=%d err=%v", before, after, err)
	}
	var deleted bool
	if err = f.Pool.QueryRow(ctx, `SELECT deleted_at IS NOT NULL FROM regions WHERE public_id=$1`, north).Scan(&deleted); err != nil || deleted {
		t.Fatalf("failed delete changed region=%v err=%v", deleted, err)
	}
}
