package spatial

import (
	"context"
	"slices"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

// ResolveQuestPointcrawlNodes holds Maps before Nodes, in UUID order, just as
// Spatial's pointcrawl commands do. The caller retains these locks in its UOW.
func (p *ProductPostgres) ResolveQuestPointcrawlNodes(ctx context.Context, actor auth.Authority, nodes []QuestPointcrawlCandidate) ([]PointcrawlAdmission, error) {
	if len(nodes) > 100 {
		return nil, apierr.New(apierr.Invalid, "too many pointcrawl links")
	}
	if len(nodes) == 0 {
		return []PointcrawlAdmission{}, nil
	}
	nodeIDs, uuids, err := validateQuestPointcrawlCandidates(nodes)
	if err != nil {
		return nil, err
	}
	planned, err := readQuestPointcrawlNodes(ctx, p, actor, uuids, len(nodeIDs))
	if err != nil {
		return nil, err
	}
	facts, err := p.lockQuestPointcrawlNodes(ctx, actor, planned, nodeIDs, uuids)
	if err != nil {
		return nil, err
	}
	result := make([]PointcrawlAdmission, 0, len(nodes))
	for _, node := range nodes {
		fact := facts[node.ID]
		fact.Role = node.Role
		result = append(result, fact)
	}
	return result, nil
}

func validateQuestPointcrawlCandidates(nodes []QuestPointcrawlCandidate) ([]string, []pgtype.UUID, error) {
	keys := make(map[string]bool, len(nodes))
	ids := make(map[string]pgtype.UUID, len(nodes))
	for _, node := range nodes {
		id, err := spatialPublicID(node.ID)
		if err != nil {
			return nil, nil, err
		}
		if node.ID != db.UUIDString(id) || node.Role != "expected" && node.Role != "visited" {
			return nil, nil, apierr.New(apierr.Invalid, "invalid pointcrawl link")
		}
		key := node.ID + "\x00" + node.Role
		if keys[key] {
			return nil, nil, apierr.New(apierr.Invalid, "duplicate pointcrawl link")
		}
		keys[key], ids[node.ID] = true, id
	}
	nodeIDs := make([]string, 0, len(ids))
	for id := range ids {
		nodeIDs = append(nodeIDs, id)
	}
	slices.Sort(nodeIDs)
	uuids := make([]pgtype.UUID, 0, len(nodeIDs))
	for _, id := range nodeIDs {
		uuids = append(uuids, ids[id])
	}
	return nodeIDs, uuids, nil
}

func readQuestPointcrawlNodes(ctx context.Context, p *ProductPostgres, actor auth.Authority, uuids []pgtype.UUID, expected int) ([]dbgen.ResolveProductQuestPointcrawlNodesRow, error) {
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ResolveProductQuestPointcrawlNodes(ctx, dbgen.ResolveProductQuestPointcrawlNodesParams{
		NodeIds: uuids, ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if err != nil {
		return nil, err
	}
	if len(rows) != expected {
		return nil, apierr.New(apierr.NotFound, "pointcrawl node not found")
	}
	return rows, nil
}

func (p *ProductPostgres) lockQuestPointcrawlNodes(ctx context.Context, actor auth.Authority, planned []dbgen.ResolveProductQuestPointcrawlNodesRow, nodeIDs []string, uuids []pgtype.UUID) (map[string]PointcrawlAdmission, error) {
	read := func() ([]dbgen.ResolveProductQuestPointcrawlNodesRow, error) {
		return readQuestPointcrawlNodes(ctx, p, actor, uuids, len(nodeIDs))
	}
	maps := make([]string, 0, len(planned))
	mapByNode := make(map[string]string, len(planned))
	for _, row := range planned {
		mapID := db.UUIDString(row.MapID)
		maps = append(maps, mapID)
		mapByNode[db.UUIDString(row.NodeID)] = mapID
	}
	slices.Sort(maps)
	maps = slices.Compact(maps)
	for _, mapID := range maps {
		if _, err := p.lockPointcrawlMap(ctx, mapID); err != nil {
			return nil, err
		}
	}
	for _, nodeID := range nodeIDs {
		if _, err := p.lockPointcrawlNode(ctx, nodeID, mapByNode[nodeID]); err != nil {
			return nil, err
		}
	}
	current, err := read()
	if err != nil {
		return nil, err
	}
	facts := make(map[string]PointcrawlAdmission, len(current))
	for _, row := range current {
		id, mapID := db.UUIDString(row.NodeID), db.UUIDString(row.MapID)
		if mapID != mapByNode[id] {
			return nil, apierr.New(apierr.Conflict, "pointcrawl node changed; retry")
		}
		facts[id] = PointcrawlAdmission{ID: id, MapID: mapID, RegionID: uuidPtr(row.RegionID), AdminOverride: row.AdminOverride}
	}
	return facts, nil
}
