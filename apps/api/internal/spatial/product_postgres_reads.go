package spatial

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) ReadableDocumentIDs(_ context.Context, _ auth.Authority, ids []string) (map[string]bool, error) {
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = false
	}
	return out, nil
}

func (p *ProductPostgres) ReadArchonAssignments(ctx context.Context, _ auth.Authority, spec ArchonAssignmentsSpec) (ArchonPage, error) {
	regionID, err := optionalSpatialUUID(spec.RegionId)
	if err != nil {
		return ArchonPage{}, err
	}
	memberID, err := optionalSpatialUUID(spec.MemberId)
	if err != nil {
		return ArchonPage{}, err
	}
	q := p.queries()
	total, err := q.CountProductArchonAssignments(ctx, dbgen.CountProductArchonAssignmentsParams{
		RegionID: regionID,
		MemberID: memberID,
	})
	if err != nil {
		return ArchonPage{}, err
	}
	rows, err := q.ListProductArchonAssignments(ctx, dbgen.ListProductArchonAssignmentsParams{
		RegionID:  regionID,
		MemberID:  memberID,
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return ArchonPage{}, err
	}
	items := make([]ArchonAssignmentView, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapArchonRow(row.RegionID, row.MemberID, row.GrantedAt, row.GrantedBy))
	}
	return ArchonPage{Items: items, Total: total}, nil
}

func (p *ProductPostgres) ReadRegionCounts(ctx context.Context, actor auth.Authority, spec RegionCountsSpec) (*RegionCountsView, error) {
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return nil, err
	}
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return nil, err
	}
	row, err := p.queries().GetProductRegionCounts(ctx, dbgen.GetProductRegionCountsParams{
		RegionID: regionID, ViewerID: viewer.ID, ViewerRoles: viewer.Roles,
		ViewerHandle: viewer.Handle, ViewerAdmin: viewer.Admin,
		ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if isNotFound(err) {
		return nil, apierr.New(apierr.NotFound, "region not found")
	}
	if err != nil {
		return nil, err
	}
	document.AuditSQLOverride(ctx, document.ScopeFromAuthority(actor), row.AdminOverride, "region_counts", "count")
	return &RegionCountsView{
		RegionId:     db.UUIDString(row.RegionID),
		FeatureCount: row.PointcrawlNodeCount,
		HexCount:     0,
		QuestCount:   row.QuestCount,
	}, nil
}

func (p *ProductPostgres) ReadRegionActivity(ctx context.Context, _ auth.Authority, spec RegionActivitySpec) (*RegionActivityView, error) {
	rows, err := p.queries().ReadProductRegionActivity(ctx, dbgen.ReadProductRegionActivityParams{
		AtlasCode: spec.AtlasCode,
		AsOf:      pgTimestamptz(time.Now().UTC()),
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, apierr.New(apierr.NotFound, "region activity not found")
	}
	head := rows[0]
	view := &RegionActivityView{
		RegionId:       db.UUIDString(head.RegionID),
		RegionName:     head.RegionName,
		FillingCount:   head.FillingCount,
		ScheduledCount: head.ScheduledCount,
		LiveCount:      head.LiveCount,
	}
	for _, row := range rows {
		if !row.QuestID.Valid {
			continue
		}
		ref := RegionActivityQuestRefView{
			Id:          db.UUIDString(row.QuestID),
			ShortCode:   row.ShortCode.String,
			ScheduledAt: row.ScheduledAt.Time,
			SlotsMax:    row.SlotsMax.Int32,
			FilledCount: row.FilledCount.Int32,
		}
		switch row.DisplayStatus.String {
		case "live":
			view.LiveQuests = append(view.LiveQuests, ref)
		case "filling", "scheduled":
			view.OpenQuests = append(view.OpenQuests, ref)
		}
	}
	return view, nil
}

func (p *ProductPostgres) ReadRegions(ctx context.Context, actor auth.Authority, spec RegionsSpec) ([]RegionView, error) {
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return nil, err
	}
	kind := pgtype.Text{}
	if spec.Kind != nil {
		kind = pgtype.Text{String: *spec.Kind, Valid: true}
	}
	rows, err := p.queries().ListProductRegions(ctx, dbgen.ListProductRegionsParams{
		ViewerID:     viewer.ID,
		ViewerRoles:  viewer.Roles,
		ViewerHandle: viewer.Handle,
		ViewerAdmin:  viewer.Admin,
		ViewerLiveDm: viewer.LiveDM,
		ReaderIds:    viewer.Readers,
		Kind:         kind,
		RowOffset:    spec.Offset,
		RowLimit:     spec.Limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]RegionView, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProductRegionRow(row.ID, row.Name, row.Kind, row.CharterDeadline, row.DocumentID, row.CreatedAt))
	}
	return out, nil
}

func (p *ProductPostgres) ReadGameCalendar(ctx context.Context, _ auth.Authority, spec GameCalendarSpec) (TimeCalendarSnapshot, error) {
	realFrom, err := pgDateFromProduct(spec.RealFrom)
	if err != nil {
		return TimeCalendarSnapshot{}, err
	}
	realTo, err := pgDateFromProduct(spec.RealTo)
	if err != nil {
		return TimeCalendarSnapshot{}, err
	}
	asOf := spec.AsOf
	if asOf.IsZero() {
		asOf = time.Now().UTC()
	}
	today, _ := pgDateFromProduct(product.Date(asOf.UTC().Format("2006-01-02")))
	cal, err := p.queries().ReadProductCalendar(ctx, today)
	if err != nil {
		return TimeCalendarSnapshot{}, err
	}
	cells, err := p.queries().ListProductCalendarCells(ctx, dbgen.ListProductCalendarCellsParams{
		RealFrom: realFrom,
		RealTo:   realTo,
	})
	if err != nil {
		return TimeCalendarSnapshot{}, err
	}
	snapshot := TimeCalendarSnapshot{
		CurrentGameDay: int32Ptr(cal.CurrentGameDay),
		Definition:     rawJSON(cal.Definition),
	}
	for _, cell := range cells {
		realDate, err := productDateFromPGDate(cell.RealDate)
		if err != nil {
			return TimeCalendarSnapshot{}, err
		}
		snapshot.Cells = append(snapshot.Cells, GameDayCellView{
			RealDate: realDate,
			GameDay:  int32Ptr(cell.GameDay),
		})
	}
	return snapshot, nil
}

func (p *ProductPostgres) ReadGameDate(ctx context.Context, _ auth.Authority, spec GameDateSpec) (TimeDateSnapshot, error) {
	realDate, err := pgDateFromProduct(spec.RealDate)
	if err != nil {
		return TimeDateSnapshot{}, err
	}
	row, err := p.queries().ReadProductGameDate(ctx, realDate)
	if err != nil {
		return TimeDateSnapshot{}, err
	}
	return TimeDateSnapshot{
		GameDay:    int32Ptr(row.GameDay),
		Definition: rawJSON(row.Definition),
	}, nil
}

func (p *ProductPostgres) ReadRealDates(ctx context.Context, _ auth.Authority, spec RealDatesSpec) (RealDatePage, error) {
	rows, err := p.queries().ListProductRealDates(ctx, dbgen.ListProductRealDatesParams{
		GameDay:   spec.GameDay,
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return RealDatePage{}, err
	}
	var total int32
	items := make([]product.Date, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.RealDate.Valid {
			continue
		}
		items = append(items, product.Date(row.RealDate.Time.Format("2006-01-02")))
	}
	return RealDatePage{Items: items, Total: total}, nil
}

func (p *ProductPostgres) ReadTimeAnchors(ctx context.Context, _ auth.Authority, spec TimeAnchorsSpec) (TimeAnchorPage, error) {
	rows, err := p.queries().ListProductTimeAnchors(ctx, dbgen.ListProductTimeAnchorsParams{
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return TimeAnchorPage{}, err
	}
	var total int32
	items := make([]TimeAnchorView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.ID.Valid {
			continue
		}
		items = append(items, mapTimeAnchorRow(row.ID, row.RealUtc, row.EpochDay.Int32, row.Rate.Float64, row.Note))
	}
	return TimeAnchorPage{Items: items, Total: total}, nil
}

func (p *ProductPostgres) ReadMap(ctx context.Context, _ auth.Authority, spec MapSpec) (*MapView, error) {
	row, err := p.queries().GetProductMap(ctx, spec.AtlasCode)
	if isNotFound(err) {
		return nil, apierr.New(apierr.NotFound, "map not found")
	}
	if err != nil {
		return nil, err
	}
	view := mapProductMapRow(row.ID, row.Name, row.AtlasCode, row.MapKind, row.Family, row.Grid, row.RegionID, row.AssetPath, row.CreatedAt, row.CreatedBy)
	return &view, nil
}

func (p *ProductPostgres) ReadMaps(ctx context.Context, _ auth.Authority, spec MapsSpec) ([]MapView, error) {
	family := optionalText(spec.Family)
	mapKind := optionalText(spec.MapKind)
	rows, err := p.queries().ListProductMaps(ctx, dbgen.ListProductMapsParams{
		Family:    family,
		MapKind:   mapKind,
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]MapView, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProductMapRow(row.ID, row.Name, row.AtlasCode, row.MapKind, row.Family, row.Grid, row.RegionID, row.AssetPath, row.CreatedAt, row.CreatedBy))
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchMapNodes(ctx context.Context, actor auth.Authority, keys []MapNodesKey) ([]product.BatchResult[NodeList], error) {
	return p.readBatchPointcrawlNodes(ctx, actor, keys)
}

func (p *ProductPostgres) ReadBatchMapNodeEdges(ctx context.Context, actor auth.Authority, keys []MapNodeEdgesKey) ([]product.BatchResult[NodeEdgeList], error) {
	out := make([]product.BatchResult[NodeEdgeList], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return nil, err
	}
	encoded, err := encodeBatchKeys(keys, func(k MapNodeEdgesKey) batchParentKey {
		return batchParentKey(k)
	})
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ListProductPointcrawlEdgesForMaps(ctx, dbgen.ListProductPointcrawlEdgesForMapsParams{
		Keys:         encoded,
		ViewerID:     viewer.ID,
		ViewerRoles:  viewer.Roles,
		ViewerHandle: viewer.Handle,
		ViewerAdmin:  viewer.Admin,
		ViewerLiveDm: viewer.LiveDM,
		ReaderIds:    viewer.Readers,
	})
	if err != nil {
		return nil, err
	}
	lists := make([][]PointcrawlEdgeView, len(keys))
	parentExists := make([]bool, len(keys))
	overridden := false
	for _, row := range rows {
		idx := int(row.KeyOrdinal) - 1
		if idx < 0 || idx >= len(keys) {
			continue
		}
		parentExists[idx] = row.ParentExists
		if !row.ID.Valid {
			continue
		}
		overridden = overridden || row.AdminOverride
		lists[idx] = append(lists[idx], mapPointcrawlEdgeRow(row.ID, row.MapID, row.NodeA, row.NodeB, row.Directed, row.Kind, row.Label, row.DocumentID))
	}
	for i := range out {
		if !parentExists[i] {
			out[i].Err = apierr.New(apierr.NotFound, "map not found")
			continue
		}
		out[i].Value = &NodeEdgeList{Items: lists[i]}
	}
	document.AuditSQLOverride(ctx, document.ScopeFromAuthority(actor), overridden, "pointcrawl_edges", "list")
	return out, nil
}

func (p *ProductPostgres) ReadBatchNodeLinks(ctx context.Context, actor auth.Authority, keys []NodeLinksKey) ([]product.BatchResult[NodeLinkList], error) {
	out := make([]product.BatchResult[NodeLinkList], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return nil, err
	}
	encoded, err := encodeBatchKeys(keys, func(k NodeLinksKey) batchParentKey {
		return batchParentKey(k)
	})
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ListProductPointcrawlLinksForNodes(ctx, dbgen.ListProductPointcrawlLinksForNodesParams{
		Keys:         encoded,
		ViewerID:     viewer.ID,
		ViewerRoles:  viewer.Roles,
		ViewerHandle: viewer.Handle,
		ViewerAdmin:  viewer.Admin,
		ViewerLiveDm: viewer.LiveDM,
		ReaderIds:    viewer.Readers,
	})
	if err != nil {
		return nil, err
	}
	lists := make([][]PointcrawlEntryLinkView, len(keys))
	parentExists := make([]bool, len(keys))
	overridden := false
	for _, row := range rows {
		idx := int(row.KeyOrdinal) - 1
		if idx < 0 || idx >= len(keys) {
			continue
		}
		parentExists[idx] = row.ParentExists
		if !row.DocumentID.Valid {
			continue
		}
		overridden = overridden || row.AdminOverride
		lists[idx] = append(lists[idx], PointcrawlEntryLinkView{
			MapId:      db.UUIDString(row.MapID),
			NodeId:     db.UUIDString(row.NodeID),
			DocumentId: db.UUIDString(row.DocumentID),
			Relation:   row.Relation,
			CreatedAt:  row.CreatedAt.Time,
			CreatedBy:  db.UUIDString(row.CreatedBy),
		})
	}
	for i := range out {
		if !parentExists[i] {
			out[i].Err = apierr.New(apierr.NotFound, "node not found")
			continue
		}
		out[i].Value = &NodeLinkList{Items: lists[i]}
	}
	document.AuditSQLOverride(ctx, document.ScopeFromAuthority(actor), overridden, "pointcrawl_links", "list")
	return out, nil
}

func (p *ProductPostgres) readBatchPointcrawlNodes(ctx context.Context, actor auth.Authority, keys []MapNodesKey) ([]product.BatchResult[NodeList], error) {
	out := make([]product.BatchResult[NodeList], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return nil, err
	}
	encoded, err := encodeBatchKeys(keys, func(k MapNodesKey) batchParentKey {
		return batchParentKey(k)
	})
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ListProductPointcrawlNodesForMaps(ctx, dbgen.ListProductPointcrawlNodesForMapsParams{
		Keys:         encoded,
		ViewerID:     viewer.ID,
		ViewerRoles:  viewer.Roles,
		ViewerHandle: viewer.Handle,
		ViewerAdmin:  viewer.Admin,
		ViewerLiveDm: viewer.LiveDM,
		ReaderIds:    viewer.Readers,
	})
	if err != nil {
		return nil, err
	}
	lists := make([][]PointcrawlNodeView, len(keys))
	parentExists := make([]bool, len(keys))
	overridden := false
	for _, row := range rows {
		idx := int(row.KeyOrdinal) - 1
		if idx < 0 || idx >= len(keys) {
			continue
		}
		parentExists[idx] = row.ParentExists
		if !row.ID.Valid {
			continue
		}
		overridden = overridden || row.AdminOverride
		lists[idx] = append(lists[idx], mapPointcrawlNodeRow(row.ID, row.MapID, row.Name, row.X, row.Y, row.SubmapID, row.CreatedAt, row.State))
	}
	for i := range out {
		if !parentExists[i] {
			out[i].Err = apierr.New(apierr.NotFound, "map not found")
			continue
		}
		out[i].Value = &NodeList{Items: lists[i]}
	}
	document.AuditSQLOverride(ctx, document.ScopeFromAuthority(actor), overridden, "pointcrawl_nodes", "list")
	return out, nil
}

func (p *ProductPostgres) LockContainment(ctx context.Context) error {
	return p.queries().LockProductContainmentGraph(ctx)
}

func (p *ProductPostgres) ReadContainmentEdges(ctx context.Context) ([]ContainmentEdge, error) {
	rows, err := p.queries().ReadProductContainmentEdges(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]ContainmentEdge, 0, len(rows))
	for _, row := range rows {
		out = append(out, ContainmentEdge{
			ParentMapID: db.UUIDString(row.ParentMapID),
			ChildMapID:  db.UUIDString(row.ChildMapID),
		})
	}
	return out, nil
}
