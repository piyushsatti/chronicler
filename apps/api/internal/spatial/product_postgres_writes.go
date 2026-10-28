package spatial

import (
	"context"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) LockCreateMap(ctx context.Context, spec CreateMapSpec) (CreateMapState, error) {
	if spec.Input.RegionId != nil {
		regionID, err := spatialPublicID(*spec.Input.RegionId)
		if err != nil {
			return CreateMapState{}, err
		}
		region, err := p.queries().LockProductRegion(ctx, regionID)
		if isNotFound(err) || err == nil && region.DeletedAt.Valid {
			return CreateMapState{}, apierr.New(apierr.Invalid, "live region required")
		}
		if err != nil {
			return CreateMapState{}, err
		}
	}
	_, err := p.queries().LockProductMapByAtlasCode(ctx, spec.Input.AtlasCode)
	if err == nil {
		return CreateMapState{Exists: true, SubjectID: spec.Input.AtlasCode, MapKind: spec.Input.MapKind}, nil
	}
	if !isNotFound(err) {
		return CreateMapState{}, err
	}
	return CreateMapState{MapKind: spec.Input.MapKind, RegionID: spec.Input.RegionId}, nil
}

func (p *ProductPostgres) StoreCreateMap(ctx context.Context, write CreateMapWrite) (MapView, error) {
	if write.Locked.Exists {
		return MapView{}, apierr.New(apierr.Conflict, "map atlas code already exists")
	}
	spec := write.ValidatedInput.Input
	regionID, err := optionalSpatialUUID(spec.RegionId)
	if err != nil {
		return MapView{}, err
	}
	actorID, err := spatialPublicID(write.ActorID)
	if err != nil {
		return MapView{}, err
	}
	row, err := p.queries().CreateProductMap(ctx, dbgen.CreateProductMapParams{
		Name:      spec.Name,
		AtlasCode: spec.AtlasCode,
		MapKind:   spec.MapKind,
		Family:    spec.Family,
		Grid:      spec.Grid,
		RegionID:  regionID,
		AssetPath: optionalText(spec.AssetPath),
		ActorID:   actorID,
	})
	if err != nil {
		return MapView{}, err
	}
	return mapProductMapRow(row.ID, row.Name, row.AtlasCode, row.MapKind, row.Family, row.Grid, row.RegionID, row.AssetPath, row.CreatedAt, row.CreatedBy), nil
}

func (p *ProductPostgres) LockUpdateMap(ctx context.Context, spec UpdateMapSpec) (UpdateMapState, error) {
	view, err := p.lockPointcrawlMap(ctx, spec.MapId)
	if err != nil {
		return UpdateMapState{}, err
	}
	return UpdateMapState{Exists: true, SubjectID: spec.MapId, MapKind: view.MapKind, RegionID: view.RegionId, Before: view}, nil
}

func (p *ProductPostgres) StoreUpdateMap(ctx context.Context, write UpdateMapWrite) (MapView, error) {
	if !write.Locked.Exists {
		return MapView{}, apierr.New(apierr.NotFound, "map not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return MapView{}, err
	}
	row, err := p.queries().UpdateProductMap(ctx, dbgen.UpdateProductMapParams{
		Name:      spec.Input.Name,
		Family:    spec.Input.Family,
		Grid:      spec.Input.Grid,
		AssetPath: optionalText(spec.Input.AssetPath),
		MapID:     mapID,
	})
	if err != nil {
		return MapView{}, err
	}
	return mapProductMapRow(row.ID, row.Name, row.AtlasCode, row.MapKind, row.Family, row.Grid, row.RegionID, row.AssetPath, row.CreatedAt, row.CreatedBy), nil
}

func (p *ProductPostgres) LockCreateRegion(_ context.Context, _ CreateRegionSpec) (CreateRegionState, error) {
	return CreateRegionState{}, nil
}

func (p *ProductPostgres) StoreCreateRegion(ctx context.Context, write CreateRegionWrite) (RegionView, error) {
	input := write.ValidatedInput.Input
	docID, err := optionalSpatialUUID(input.DocumentId)
	if err != nil {
		return RegionView{}, err
	}
	row, err := p.queries().CreateProductRegion(ctx, dbgen.CreateProductRegionParams{
		Name:            input.Name,
		Kind:            input.Kind,
		CharterDeadline: optionalTimestamptz(input.CharterDeadline),
		DocumentID:      docID,
	})
	if err != nil {
		return RegionView{}, err
	}
	return mapProductRegionRow(row.ID, row.Name, row.Kind, row.CharterDeadline, row.DocumentID, row.CreatedAt), nil
}

func (p *ProductPostgres) LockUpdateRegion(ctx context.Context, spec UpdateRegionSpec) (UpdateRegionState, error) {
	regionID, err := spatialPublicID(spec.Id)
	if err != nil {
		return UpdateRegionState{}, err
	}
	before, err := readRegionByID(ctx, p.queries(), regionID)
	if err != nil {
		return UpdateRegionState{}, err
	}
	if before == nil {
		return UpdateRegionState{}, nil
	}
	return UpdateRegionState{Exists: true, SubjectID: spec.Id, Before: before}, nil
}

func (p *ProductPostgres) StoreUpdateRegion(ctx context.Context, write UpdateRegionWrite) (RegionView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return RegionView{}, apierr.New(apierr.NotFound, "region not found")
	}
	spec := write.ValidatedInput
	if spec.Input.Kind != write.Locked.Before.Kind {
		return RegionView{}, apierr.New(apierr.Invalid, "use transitionRegion to change region kind")
	}
	if spec.Input.DocumentId == nil {
		spec.Input.DocumentId = write.Locked.Before.DocumentId
	}
	if spec.Input.CharterDeadline == nil {
		spec.Input.CharterDeadline = write.Locked.Before.CharterDeadline
	}
	docID, err := optionalSpatialUUID(spec.Input.DocumentId)
	if err != nil {
		return RegionView{}, err
	}
	regionID, err := spatialPublicID(spec.Id)
	if err != nil {
		return RegionView{}, err
	}
	row, err := p.queries().UpdateProductRegion(ctx, dbgen.UpdateProductRegionParams{
		RegionID:        regionID,
		Kind:            spec.Input.Kind,
		Name:            spec.Input.Name,
		CharterDeadline: optionalTimestamptz(spec.Input.CharterDeadline),
		DocumentID:      docID,
	})
	if err != nil {
		return RegionView{}, err
	}
	return mapProductRegionRow(row.ID, row.Name, row.Kind, row.CharterDeadline, row.DocumentID, row.CreatedAt), nil
}

func (p *ProductPostgres) LockTransitionRegion(ctx context.Context, spec TransitionRegionSpec) (TransitionRegionState, error) {
	regionID, err := spatialPublicID(spec.Id)
	if err != nil {
		return TransitionRegionState{}, err
	}
	before, err := readRegionByID(ctx, p.queries(), regionID)
	if err != nil {
		return TransitionRegionState{}, err
	}
	if before == nil {
		return TransitionRegionState{}, nil
	}
	return TransitionRegionState{Exists: true, SubjectID: spec.Id, Before: before}, nil
}

func (p *ProductPostgres) StoreTransitionRegion(ctx context.Context, write TransitionRegionWrite) (RegionView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return RegionView{}, apierr.New(apierr.NotFound, "region not found")
	}
	spec := write.ValidatedInput
	if (write.Locked.Before.Kind != "uncharted" || spec.To != "archon") && (write.Locked.Before.Kind != "archon" || spec.To != "server") {
		return RegionView{}, apierr.New(apierr.Conflict, "invalid region transition")
	}
	regionID, err := spatialPublicID(spec.Id)
	if err != nil {
		return RegionView{}, err
	}
	row, err := p.queries().TransitionProductRegion(ctx, dbgen.TransitionProductRegionParams{
		RegionID: regionID,
		Kind:     spec.To,
	})
	if err != nil {
		return RegionView{}, err
	}
	return mapProductRegionRow(row.ID, row.Name, row.Kind, row.CharterDeadline, row.DocumentID, row.CreatedAt), nil
}

func (p *ProductPostgres) LockDeleteRegion(ctx context.Context, spec DeleteRegionSpec) (DeleteRegionState, error) {
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return DeleteRegionState{}, err
	}
	row, err := p.queries().LockProductRegion(ctx, regionID)
	if isNotFound(err) {
		return DeleteRegionState{}, nil
	}
	if err != nil {
		return DeleteRegionState{}, err
	}
	if row.DeletedAt.Valid {
		before, _ := mapLockRegionState(row)
		return DeleteRegionState{SubjectID: spec.RegionId, Before: &before}, nil
	}
	before, _ := mapLockRegionState(row)
	return DeleteRegionState{Exists: true, SubjectID: spec.RegionId, Before: &before}, nil
}

func (p *ProductPostgres) StoreDeleteRegion(ctx context.Context, write DeleteRegionWrite) (product.CommandReceipt, error) {
	if !write.Locked.Exists {
		if write.Locked.Before != nil {
			return product.CommandReceipt{}, nil
		}
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "region not found")
	}
	regionID, err := spatialPublicID(write.ValidatedInput.RegionId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	actorID, err := spatialPublicID(write.ActorID)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	affected, err := p.queries().SoftDeleteProductRegion(ctx, dbgen.SoftDeleteProductRegionParams{
		RecordedAt: pgTimestamptz(write.At),
		ActorID:    actorID,
		RegionID:   regionID,
	})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	if affected == 0 {
		return product.CommandReceipt{}, apierr.New(apierr.Conflict, "region has active references")
	}
	return product.CommandReceipt{}, nil
}

func (p *ProductPostgres) LockRestoreRegion(ctx context.Context, spec RestoreRegionSpec) (RestoreRegionState, error) {
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return RestoreRegionState{}, err
	}
	row, err := p.queries().LockProductRegion(ctx, regionID)
	if isNotFound(err) {
		return RestoreRegionState{}, nil
	}
	if err != nil {
		return RestoreRegionState{}, err
	}
	before, _ := mapLockRegionState(row)
	return RestoreRegionState{Exists: true, SubjectID: spec.RegionId, Before: &before}, nil
}

func (p *ProductPostgres) StoreRestoreRegion(ctx context.Context, write RestoreRegionWrite) (RegionView, error) {
	if !write.Locked.Exists {
		return RegionView{}, apierr.New(apierr.NotFound, "region not found")
	}
	regionID, err := spatialPublicID(write.ValidatedInput.RegionId)
	if err != nil {
		return RegionView{}, err
	}
	row, err := p.queries().RestoreProductRegion(ctx, regionID)
	if err != nil {
		return RegionView{}, err
	}
	return mapProductRegionRow(row.ID, row.Name, row.Kind, row.CharterDeadline, row.DocumentID, row.CreatedAt), nil
}

func (p *ProductPostgres) LockAssignArchon(ctx context.Context, spec AssignArchonSpec) (AssignArchonState, error) {
	memberID, err := spatialPublicID(spec.MemberId)
	if err != nil {
		return AssignArchonState{}, err
	}
	member, err := p.queries().GetMemberAuthority(ctx, memberID)
	if isNotFound(err) || err == nil && (member.Status != "active" || !slices.Contains(member.Roles, "archon")) {
		return AssignArchonState{}, apierr.New(apierr.Invalid, "active archon required")
	}
	if err != nil {
		return AssignArchonState{}, err
	}
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return AssignArchonState{}, err
	}
	if region, err := p.queries().LockProductRegion(ctx, regionID); isNotFound(err) || err == nil && region.DeletedAt.Valid {
		return AssignArchonState{}, apierr.New(apierr.Invalid, "live region required")
	} else if err != nil {
		return AssignArchonState{}, err
	}
	_, err = p.queries().LockProductArchonAssignment(ctx, dbgen.LockProductArchonAssignmentParams{
		MemberID: memberID,
		RegionID: regionID,
	})
	if isNotFound(err) {
		return AssignArchonState{SubjectID: spec.MemberId, RegionID: &spec.RegionId}, nil
	}
	if err != nil {
		return AssignArchonState{}, err
	}
	return AssignArchonState{Exists: true, SubjectID: spec.MemberId, RegionID: &spec.RegionId}, nil
}

func (p *ProductPostgres) StoreAssignArchon(ctx context.Context, write AssignArchonWrite) (ArchonAssignmentView, error) {
	spec := write.ValidatedInput
	memberID, err := spatialPublicID(spec.MemberId)
	if err != nil {
		return ArchonAssignmentView{}, err
	}
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return ArchonAssignmentView{}, err
	}
	actorID, err := spatialPublicID(write.ActorID)
	if err != nil {
		return ArchonAssignmentView{}, err
	}
	row, err := p.queries().AssignProductArchon(ctx, dbgen.AssignProductArchonParams{
		RecordedAt: pgTimestamptz(write.At),
		ActorID:    actorID,
		MemberID:   memberID,
		RegionID:   regionID,
	})
	if err != nil {
		return ArchonAssignmentView{}, err
	}
	return mapArchonRow(row.RegionID, row.MemberID, row.GrantedAt, row.GrantedBy), nil
}

func (p *ProductPostgres) LockRevokeArchon(ctx context.Context, spec RevokeArchonSpec) (RevokeArchonState, error) {
	memberID, err := spatialPublicID(spec.MemberId)
	if err != nil {
		return RevokeArchonState{}, err
	}
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return RevokeArchonState{}, err
	}
	_, err = p.queries().LockProductArchonAssignment(ctx, dbgen.LockProductArchonAssignmentParams{
		MemberID: memberID,
		RegionID: regionID,
	})
	if isNotFound(err) {
		return RevokeArchonState{}, nil
	}
	if err != nil {
		return RevokeArchonState{}, err
	}
	return RevokeArchonState{Exists: true, SubjectID: spec.MemberId, RegionID: &spec.RegionId}, nil
}

func (p *ProductPostgres) StoreRevokeArchon(ctx context.Context, write RevokeArchonWrite) (product.CommandReceipt, error) {
	if !write.Locked.Exists {
		return product.CommandReceipt{}, nil
	}
	spec := write.ValidatedInput
	memberID, err := spatialPublicID(spec.MemberId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	affected, err := p.queries().RevokeProductArchon(ctx, dbgen.RevokeProductArchonParams{
		MemberID: memberID,
		RegionID: regionID,
	})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	if affected == 0 {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "archon assignment not found")
	}
	return product.CommandReceipt{}, nil
}

func (p *ProductPostgres) LockCreateTimeAnchor(ctx context.Context, spec CreateTimeAnchorSpec) (CreateTimeAnchorState, error) {
	if err := p.queries().LockProductTimeAggregate(ctx); err != nil {
		return CreateTimeAnchorState{}, err
	}
	collisions, err := p.queries().ListProductTimeAnchorCollisions(ctx, dbgen.ListProductTimeAnchorCollisionsParams{RealUtc: pgTimestamptz(spec.Input.RealUtc)})
	if err != nil {
		return CreateTimeAnchorState{}, err
	}
	if len(collisions) > 0 {
		return CreateTimeAnchorState{}, apierr.New(apierr.Conflict, "time anchor already exists at this instant")
	}
	return CreateTimeAnchorState{}, nil
}

func (p *ProductPostgres) StoreCreateTimeAnchor(ctx context.Context, write CreateTimeAnchorWrite) (TimeAnchorView, error) {
	if err := p.queries().LockProductTimeAggregate(ctx); err != nil {
		return TimeAnchorView{}, err
	}
	spec := write.ValidatedInput.Input
	anchorUUID := uuid.New()
	var anchorID pgtype.UUID
	_ = anchorID.Scan(anchorUUID.String())
	row, err := p.queries().CreateProductTimeAnchor(ctx, dbgen.CreateProductTimeAnchorParams{
		AnchorID: anchorID,
		RealUtc:  pgTimestamptz(spec.RealUtc),
		EpochDay: spec.EpochDay,
		Rate:     spec.Rate,
		Note:     optionalText(spec.Note),
	})
	if err != nil {
		return TimeAnchorView{}, err
	}
	return mapTimeAnchorRow(row.ID, row.RealUtc, row.EpochDay, row.Rate, row.Note), nil
}

func (p *ProductPostgres) LockUpdateTimeAnchor(ctx context.Context, spec UpdateTimeAnchorSpec) (UpdateTimeAnchorState, error) {
	anchorID, err := spatialPublicID(spec.Id)
	if err != nil {
		return UpdateTimeAnchorState{}, err
	}
	if err := p.queries().LockProductTimeAggregate(ctx); err != nil {
		return UpdateTimeAnchorState{}, err
	}
	row, err := p.queries().LockProductTimeAnchor(ctx, anchorID)
	if isNotFound(err) {
		return UpdateTimeAnchorState{}, nil
	}
	if err != nil {
		return UpdateTimeAnchorState{}, err
	}
	collisions, err := p.queries().ListProductTimeAnchorCollisions(ctx, dbgen.ListProductTimeAnchorCollisionsParams{RealUtc: pgTimestamptz(spec.Input.RealUtc), ExcludeAnchorID: anchorID})
	if err != nil {
		return UpdateTimeAnchorState{}, err
	}
	if len(collisions) > 0 {
		return UpdateTimeAnchorState{}, apierr.New(apierr.Conflict, "time anchor already exists at this instant")
	}
	before := mapTimeAnchorRow(row.PublicID, row.RealUtc, row.EpochDay, row.Rate, row.Note)
	return UpdateTimeAnchorState{Exists: true, SubjectID: spec.Id, Before: &before}, nil
}

func (p *ProductPostgres) StoreUpdateTimeAnchor(ctx context.Context, write UpdateTimeAnchorWrite) (TimeAnchorView, error) {
	if !write.Locked.Exists {
		return TimeAnchorView{}, apierr.New(apierr.NotFound, "time anchor not found")
	}
	spec := write.ValidatedInput
	anchorID, err := spatialPublicID(spec.Id)
	if err != nil {
		return TimeAnchorView{}, err
	}
	row, err := p.queries().UpdateProductTimeAnchor(ctx, dbgen.UpdateProductTimeAnchorParams{
		AnchorID: anchorID,
		RealUtc:  pgTimestamptz(spec.Input.RealUtc),
		EpochDay: spec.Input.EpochDay,
		Rate:     spec.Input.Rate,
		Note:     optionalText(spec.Input.Note),
	})
	if err != nil {
		return TimeAnchorView{}, err
	}
	return mapTimeAnchorRow(row.ID, row.RealUtc, row.EpochDay, row.Rate, row.Note), nil
}

func (p *ProductPostgres) LockUpdateGameCalendar(ctx context.Context, _ UpdateGameCalendarSpec) (UpdateGameCalendarState, error) {
	if err := p.queries().LockProductTimeAggregate(ctx); err != nil {
		return UpdateGameCalendarState{}, err
	}
	if _, err := p.queries().LockProductCalendar(ctx); err != nil && !isNotFound(err) {
		return UpdateGameCalendarState{}, err
	}
	return UpdateGameCalendarState{Exists: true, SubjectID: "1"}, nil
}

func (p *ProductPostgres) StoreUpdateGameCalendar(ctx context.Context, write UpdateGameCalendarWrite) (GameCalendarView, error) {
	if !write.Locked.Exists {
		return GameCalendarView{}, apierr.New(apierr.Internal, "game calendar lock missing")
	}
	row, err := p.queries().UpdateProductCalendar(ctx, dbgen.UpdateProductCalendarParams{
		Definition: []byte(write.ValidatedInput.Definition),
		RecordedAt: pgTimestamptz(write.At),
	})
	if err != nil {
		return GameCalendarView{}, err
	}
	def := rawJSON(row.Definition)
	from, to := timeProjectionRange(write.At)
	today, err := pgDateFromProduct(from)
	if err != nil {
		return GameCalendarView{}, err
	}
	cal, err := p.queries().ReadProductCalendar(ctx, today)
	if err != nil {
		return GameCalendarView{}, err
	}
	end, err := pgDateFromProduct(to)
	if err != nil {
		return GameCalendarView{}, err
	}
	rows, err := p.queries().ListProductCalendarCells(ctx, dbgen.ListProductCalendarCellsParams{RealFrom: today, RealTo: end})
	if err != nil {
		return GameCalendarView{}, err
	}
	cells := make([]GameDayCellView, 0, len(rows))
	for _, cell := range rows {
		realDate, err := productDateFromAny(cell.RealDate)
		if err != nil {
			return GameCalendarView{}, err
		}
		cells = append(cells, GameDayCellView{RealDate: realDate, GameDay: int32Ptr(cell.GameDay)})
	}
	return GameCalendarView{Definition: def, CurrentGameDay: int32Ptr(cal.CurrentGameDay), MonthGrid: cells}, nil
}

func (p *ProductPostgres) LockUpsertPointcrawlNode(ctx context.Context, spec UpsertPointcrawlNodeSpec) (UpsertPointcrawlNodeState, error) {
	view, err := p.lockPointcrawlMap(ctx, spec.MapId)
	if err != nil {
		return UpsertPointcrawlNodeState{}, err
	}
	state := UpsertPointcrawlNodeState{Exists: true, SubjectID: spec.MapId, MapKind: view.MapKind, RegionID: view.RegionId, Before: view}
	if spec.Input.Id != nil {
		node, err := p.lockPointcrawlNode(ctx, *spec.Input.Id, spec.MapId)
		if err != nil {
			return UpsertPointcrawlNodeState{}, err
		}
		state.Node = &node
	}
	return state, nil
}

func (p *ProductPostgres) StoreUpsertPointcrawlNode(ctx context.Context, write UpsertPointcrawlNodeWrite) (PointcrawlNodeView, error) {
	if !write.Locked.Exists {
		return PointcrawlNodeView{}, apierr.New(apierr.NotFound, "map not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return PointcrawlNodeView{}, spatialWriteError(err)
	}
	var nodeID pgtype.UUID
	if spec.Input.Id != nil {
		nodeID, err = spatialPublicID(*spec.Input.Id)
		if err != nil {
			return PointcrawlNodeView{}, spatialWriteError(err)
		}
	}
	submapID, err := optionalSpatialUUID(spec.Input.SubmapId)
	if err != nil {
		return PointcrawlNodeView{}, spatialWriteError(err)
	}
	row, err := p.queries().UpsertProductPointcrawlNode(ctx, dbgen.UpsertProductPointcrawlNodeParams{
		NodeID:     nodeID,
		Name:       spec.Input.Name,
		X:          spec.Input.X,
		Y:          spec.Input.Y,
		SubmapID:   submapID,
		MapID:      mapID,
		RecordedAt: pgTimestamptz(write.At),
	})
	if err != nil {
		return PointcrawlNodeView{}, spatialWriteError(err)
	}
	return mapPointcrawlNodeRow(row.ID, row.MapID, row.Name, row.X, row.Y, row.SubmapID, row.CreatedAt, row.State), nil
}

func (p *ProductPostgres) LockSetPointcrawlNodeState(ctx context.Context, spec SetPointcrawlNodeStateSpec) (SetPointcrawlNodeStateState, error) {
	view, err := p.lockPointcrawlMap(ctx, spec.MapId)
	if err != nil {
		return SetPointcrawlNodeStateState{}, err
	}
	id, err := spatialPublicID(spec.NodeId)
	if err != nil {
		return SetPointcrawlNodeStateState{}, err
	}
	row, err := p.queries().LockProductPointcrawlNode(ctx, id)
	if isNotFound(err) {
		return SetPointcrawlNodeStateState{}, apierr.New(apierr.NotFound, "pointcrawl node not found")
	}
	if err != nil {
		return SetPointcrawlNodeStateState{}, err
	}
	if db.UUIDString(row.MapPublicID) != spec.MapId {
		return SetPointcrawlNodeStateState{}, apierr.New(apierr.NotFound, "pointcrawl node not found")
	}
	node := mapPointcrawlNodeRow(row.PublicID, row.MapPublicID, row.Name, row.X, row.Y, row.SubmapPublicID, row.CreatedAt, row.State)
	return SetPointcrawlNodeStateState{Exists: true, MapKind: view.MapKind, RegionID: view.RegionId, Node: &node}, nil
}

func (p *ProductPostgres) StoreSetPointcrawlNodeState(ctx context.Context, write SetPointcrawlNodeStateWrite) (PointcrawlNodeView, error) {
	if !write.Locked.Exists || write.Locked.Node == nil {
		return PointcrawlNodeView{}, apierr.New(apierr.NotFound, "pointcrawl node not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return PointcrawlNodeView{}, spatialWriteError(err)
	}
	nodeID, err := spatialPublicID(spec.NodeId)
	if err != nil {
		return PointcrawlNodeView{}, spatialWriteError(err)
	}
	row, err := p.queries().SetProductPointcrawlNodeState(ctx, dbgen.SetProductPointcrawlNodeStateParams{
		State:  spec.State,
		NodeID: nodeID,
		MapID:  mapID,
	})
	if isNotFound(err) {
		return PointcrawlNodeView{}, apierr.New(apierr.NotFound, "pointcrawl node not found")
	}
	if err != nil {
		return PointcrawlNodeView{}, spatialWriteError(err)
	}
	return mapPointcrawlNodeRow(row.ID, row.MapID, row.Name, row.X, row.Y, row.SubmapID, row.CreatedAt, row.State), nil
}

func (p *ProductPostgres) LockSetPointcrawlEdge(ctx context.Context, spec SetPointcrawlEdgeSpec) (SetPointcrawlEdgeState, error) {
	view, err := p.lockPointcrawlMap(ctx, spec.MapId)
	if err != nil {
		return SetPointcrawlEdgeState{}, err
	}
	state := SetPointcrawlEdgeState{Exists: true, SubjectID: spec.MapId, MapKind: view.MapKind, RegionID: view.RegionId, Before: view}
	ids := []string{spec.Input.NodeA, spec.Input.NodeB}
	slices.Sort(ids)
	for _, id := range ids {
		node, err := p.lockPointcrawlNode(ctx, id, spec.MapId)
		if err != nil {
			return SetPointcrawlEdgeState{}, err
		}
		state.Endpoints = append(state.Endpoints, node)
	}
	if spec.Input.Id != nil {
		id, err := spatialPublicID(*spec.Input.Id)
		if err != nil {
			return SetPointcrawlEdgeState{}, err
		}
		edge, err := p.queries().LockProductPointcrawlEdge(ctx, id)
		if err != nil {
			return SetPointcrawlEdgeState{}, spatialWriteError(err)
		}
		if db.UUIDString(edge.MapID) != spec.MapId {
			return SetPointcrawlEdgeState{}, apierr.New(apierr.Invalid, "edge belongs to another map")
		}
	}
	return state, nil
}

func (p *ProductPostgres) StoreSetPointcrawlEdge(ctx context.Context, write SetPointcrawlEdgeWrite) (PointcrawlEdgeView, error) {
	if !write.Locked.Exists {
		return PointcrawlEdgeView{}, apierr.New(apierr.NotFound, "map not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return PointcrawlEdgeView{}, spatialWriteError(err)
	}
	nodeA, err := spatialPublicID(spec.Input.NodeA)
	if err != nil {
		return PointcrawlEdgeView{}, spatialWriteError(err)
	}
	nodeB, err := spatialPublicID(spec.Input.NodeB)
	if err != nil {
		return PointcrawlEdgeView{}, spatialWriteError(err)
	}
	var edgeID pgtype.UUID
	if spec.Input.Id != nil {
		edgeID, err = spatialPublicID(*spec.Input.Id)
		if err != nil {
			return PointcrawlEdgeView{}, spatialWriteError(err)
		}
	}
	docID, err := optionalSpatialUUID(spec.Input.DocumentId)
	if err != nil {
		return PointcrawlEdgeView{}, spatialWriteError(err)
	}
	row, err := p.queries().SetProductPointcrawlEdge(ctx, dbgen.SetProductPointcrawlEdgeParams{
		EdgeID:     edgeID,
		MapID:      mapID,
		NodeA:      nodeA,
		NodeB:      nodeB,
		Directed:   spec.Input.Directed,
		Kind:       spec.Input.Kind,
		Label:      optionalText(spec.Input.Label),
		DocumentID: docID,
	})
	if err != nil {
		return PointcrawlEdgeView{}, spatialWriteError(err)
	}
	return mapPointcrawlEdgeRow(row.ID, row.MapID, row.NodeA, row.NodeB, row.Directed, row.Kind, row.Label, row.DocumentID), nil
}

func (p *ProductPostgres) LockLinkPointcrawlEntry(ctx context.Context, spec LinkPointcrawlEntrySpec) (LinkPointcrawlEntryState, error) {
	view, err := p.lockPointcrawlMap(ctx, spec.MapId)
	if err != nil {
		return LinkPointcrawlEntryState{}, err
	}
	if _, err := p.lockPointcrawlNode(ctx, spec.NodeId, spec.MapId); err != nil {
		return LinkPointcrawlEntryState{}, err
	}
	return LinkPointcrawlEntryState{Exists: true, SubjectID: spec.MapId, MapKind: view.MapKind, RegionID: view.RegionId, Before: view}, nil
}

func (p *ProductPostgres) StoreLinkPointcrawlEntry(ctx context.Context, write LinkPointcrawlEntryWrite) (PointcrawlEntryLinkView, error) {
	if !write.Locked.Exists {
		return PointcrawlEntryLinkView{}, apierr.New(apierr.NotFound, "map not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return PointcrawlEntryLinkView{}, spatialWriteError(err)
	}
	nodeID, err := spatialPublicID(spec.NodeId)
	if err != nil {
		return PointcrawlEntryLinkView{}, spatialWriteError(err)
	}
	docID, err := spatialPublicID(spec.DocumentId)
	if err != nil {
		return PointcrawlEntryLinkView{}, spatialWriteError(err)
	}
	actorID, err := spatialPublicID(write.ActorID)
	if err != nil {
		return PointcrawlEntryLinkView{}, spatialWriteError(err)
	}
	row, err := p.queries().LinkProductPointcrawlEntry(ctx, dbgen.LinkProductPointcrawlEntryParams{
		Relation:   spec.Relation,
		RecordedAt: pgTimestamptz(write.At),
		DocumentID: docID,
		ActorID:    actorID,
		MapID:      mapID,
		NodeID:     nodeID,
	})
	if err != nil {
		return PointcrawlEntryLinkView{}, spatialWriteError(err)
	}
	return PointcrawlEntryLinkView{
		MapId:      db.UUIDString(row.MapID),
		NodeId:     db.UUIDString(row.NodeID),
		DocumentId: db.UUIDString(row.DocumentID),
		Relation:   row.Relation,
		CreatedAt:  row.CreatedAt.Time,
		CreatedBy:  db.UUIDString(row.CreatedBy),
	}, nil
}

func (p *ProductPostgres) LockUnlinkPointcrawlEntry(ctx context.Context, spec UnlinkPointcrawlEntrySpec) (UnlinkPointcrawlEntryState, error) {
	state, err := p.LockLinkPointcrawlEntry(ctx, LinkPointcrawlEntrySpec(spec))
	if err != nil {
		return UnlinkPointcrawlEntryState{}, err
	}
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return UnlinkPointcrawlEntryState{}, err
	}
	nodeID, err := spatialPublicID(spec.NodeId)
	if err != nil {
		return UnlinkPointcrawlEntryState{}, err
	}
	documentID, err := spatialPublicID(spec.DocumentId)
	if err != nil {
		return UnlinkPointcrawlEntryState{}, err
	}
	row, err := p.queries().LockProductPointcrawlEntryIdentity(ctx, dbgen.LockProductPointcrawlEntryIdentityParams{MapID: mapID, NodeID: nodeID, DocumentID: documentID, Relation: spec.Relation})
	if isNotFound(err) {
		return UnlinkPointcrawlEntryState(state), nil
	}
	if err != nil {
		return UnlinkPointcrawlEntryState{}, err
	}
	state.Links = []PointcrawlEntryLinkView{{MapId: db.UUIDString(row.MapID), NodeId: db.UUIDString(row.NodeID), DocumentId: db.UUIDString(row.DocumentID), Relation: row.Relation, CreatedAt: row.CreatedAt.Time, CreatedBy: db.UUIDString(row.CreatedBy)}}
	return UnlinkPointcrawlEntryState(state), nil
}

func (p *ProductPostgres) StoreUnlinkPointcrawlEntry(ctx context.Context, write UnlinkPointcrawlEntryWrite) (product.CommandReceipt, error) {
	if !write.Locked.Exists {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "map not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	nodeID, err := spatialPublicID(spec.NodeId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	docID, err := spatialPublicID(spec.DocumentId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	_, err = p.queries().UnlinkProductPointcrawlEntry(ctx, dbgen.UnlinkProductPointcrawlEntryParams{
		MapID:      mapID,
		NodeID:     nodeID,
		DocumentID: docID,
		Relation:   spec.Relation,
	})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return product.CommandReceipt{}, nil
}
