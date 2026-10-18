package spatial

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) LockCreateMap(ctx context.Context, spec CreateMapSpec) (CreateMapState, error) {
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
		RegionID:  regionID,
		AssetPath: optionalText(spec.AssetPath),
		ActorID:   actorID,
	})
	if err != nil {
		return MapView{}, err
	}
	return mapProductMapRow(row.ID, row.Name, row.AtlasCode, row.MapKind, row.Family, row.RegionID, row.AssetPath, row.CreatedAt, row.CreatedBy), nil
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
		return DeleteRegionState{}, nil
	}
	before, _ := mapLockRegionState(row)
	return DeleteRegionState{Exists: true, SubjectID: spec.RegionId, Before: &before}, nil
}

func (p *ProductPostgres) StoreDeleteRegion(ctx context.Context, write DeleteRegionWrite) (product.CommandReceipt, error) {
	if !write.Locked.Exists {
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
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "region not found")
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
	regionID, err := spatialPublicID(spec.RegionId)
	if err != nil {
		return AssignArchonState{}, err
	}
	if _, err := p.queries().LockProductRegion(ctx, regionID); isNotFound(err) {
		return AssignArchonState{}, nil
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
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "archon assignment not found")
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

func (p *ProductPostgres) LockCreateTimeAnchor(_ context.Context, _ CreateTimeAnchorSpec) (CreateTimeAnchorState, error) {
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
	var current *int32
	today, _ := pgDateFromProduct(product.Date(write.At.Format("2006-01-02")))
	cal, err := p.queries().ReadProductCalendar(ctx, today)
	if err == nil {
		current = int32Ptr(cal.CurrentGameDay)
	}
	return GameCalendarView{Definition: def, CurrentGameDay: current}, nil
}

func (p *ProductPostgres) LockUpsertPointcrawlNode(ctx context.Context, spec UpsertPointcrawlNodeSpec) (UpsertPointcrawlNodeState, error) {
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return UpsertPointcrawlNodeState{}, err
	}
	if _, err := p.queries().LockProductMap(ctx, mapID); isNotFound(err) {
		return UpsertPointcrawlNodeState{}, nil
	} else if err != nil {
		return UpsertPointcrawlNodeState{}, err
	}
	state := UpsertPointcrawlNodeState{Exists: true, SubjectID: spec.MapId, MapKind: "pointcrawl"}
	if spec.Input.Id != nil {
		nodeID, err := spatialPublicID(*spec.Input.Id)
		if err != nil {
			return UpsertPointcrawlNodeState{}, err
		}
		row, err := p.queries().LockProductPointcrawlNode(ctx, nodeID)
		if isNotFound(err) {
			return UpsertPointcrawlNodeState{}, nil
		}
		if err != nil {
			return UpsertPointcrawlNodeState{}, err
		}
		node := mapPointcrawlNodeRow(row.PublicID, row.MapPublicID, row.Name, row.X, row.Y, pgtype.UUID{}, row.CreatedAt)
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
		return PointcrawlNodeView{}, err
	}
	var nodeID pgtype.UUID
	if spec.Input.Id != nil {
		nodeID, err = spatialPublicID(*spec.Input.Id)
		if err != nil {
			return PointcrawlNodeView{}, err
		}
	}
	submapID, err := optionalSpatialUUID(spec.Input.SubmapId)
	if err != nil {
		return PointcrawlNodeView{}, err
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
		return PointcrawlNodeView{}, err
	}
	return mapPointcrawlNodeRow(row.ID, row.MapID, row.Name, row.X, row.Y, row.SubmapID, row.CreatedAt), nil
}

func (p *ProductPostgres) LockSetPointcrawlEdge(ctx context.Context, spec SetPointcrawlEdgeSpec) (SetPointcrawlEdgeState, error) {
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return SetPointcrawlEdgeState{}, err
	}
	if _, err := p.queries().LockProductMap(ctx, mapID); isNotFound(err) {
		return SetPointcrawlEdgeState{}, nil
	} else if err != nil {
		return SetPointcrawlEdgeState{}, err
	}
	return SetPointcrawlEdgeState{Exists: true, SubjectID: spec.MapId, MapKind: "pointcrawl"}, nil
}

func (p *ProductPostgres) StoreSetPointcrawlEdge(ctx context.Context, write SetPointcrawlEdgeWrite) (PointcrawlEdgeView, error) {
	if !write.Locked.Exists {
		return PointcrawlEdgeView{}, apierr.New(apierr.NotFound, "map not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return PointcrawlEdgeView{}, err
	}
	nodeA, err := spatialPublicID(spec.Input.NodeA)
	if err != nil {
		return PointcrawlEdgeView{}, err
	}
	nodeB, err := spatialPublicID(spec.Input.NodeB)
	if err != nil {
		return PointcrawlEdgeView{}, err
	}
	var edgeID pgtype.UUID
	if spec.Input.Id != nil {
		edgeID, err = spatialPublicID(*spec.Input.Id)
		if err != nil {
			return PointcrawlEdgeView{}, err
		}
	}
	docID, err := optionalSpatialUUID(spec.Input.DocumentId)
	if err != nil {
		return PointcrawlEdgeView{}, err
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
		return PointcrawlEdgeView{}, err
	}
	return mapPointcrawlEdgeRow(row.ID, row.MapID, row.NodeA, row.NodeB, row.Directed, row.Kind, row.Label, row.DocumentID), nil
}

func (p *ProductPostgres) LockLinkPointcrawlEntry(ctx context.Context, spec LinkPointcrawlEntrySpec) (LinkPointcrawlEntryState, error) {
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return LinkPointcrawlEntryState{}, err
	}
	if _, err := p.queries().LockProductMap(ctx, mapID); isNotFound(err) {
		return LinkPointcrawlEntryState{}, nil
	} else if err != nil {
		return LinkPointcrawlEntryState{}, err
	}
	return LinkPointcrawlEntryState{Exists: true, SubjectID: spec.MapId, MapKind: "pointcrawl"}, nil
}

func (p *ProductPostgres) StoreLinkPointcrawlEntry(ctx context.Context, write LinkPointcrawlEntryWrite) (PointcrawlEntryLinkView, error) {
	if !write.Locked.Exists {
		return PointcrawlEntryLinkView{}, apierr.New(apierr.NotFound, "map not found")
	}
	spec := write.ValidatedInput
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	nodeID, err := spatialPublicID(spec.NodeId)
	if err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	docID, err := spatialPublicID(spec.DocumentId)
	if err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	actorID, err := spatialPublicID(write.ActorID)
	if err != nil {
		return PointcrawlEntryLinkView{}, err
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
		return PointcrawlEntryLinkView{}, err
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
	mapID, err := spatialPublicID(spec.MapId)
	if err != nil {
		return UnlinkPointcrawlEntryState{}, err
	}
	if _, err := p.queries().LockProductMap(ctx, mapID); isNotFound(err) {
		return UnlinkPointcrawlEntryState{}, nil
	} else if err != nil {
		return UnlinkPointcrawlEntryState{}, err
	}
	return UnlinkPointcrawlEntryState{Exists: true, SubjectID: spec.MapId, MapKind: "pointcrawl"}, nil
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
	count, err := p.queries().UnlinkProductPointcrawlEntry(ctx, dbgen.UnlinkProductPointcrawlEntryParams{
		MapID:      mapID,
		NodeID:     nodeID,
		DocumentID: docID,
		Relation:   spec.Relation,
	})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	if count == 0 {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "pointcrawl entry link not found")
	}
	return product.CommandReceipt{}, nil
}
