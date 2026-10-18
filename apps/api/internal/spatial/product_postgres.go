package spatial

import (
	"context"
	"fmt"
	"reflect"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductPostgres struct {
	DB dbgen.DBTX
}

func NewProductPostgres(db dbgen.DBTX) (*ProductPostgres, error) {
	if db == nil || (reflect.ValueOf(db).Kind() == reflect.Pointer && reflect.ValueOf(db).IsNil()) {
		return nil, fmt.Errorf("spatial database executor required")
	}
	return &ProductPostgres{DB: db}, nil
}

func (p *ProductPostgres) pending() error {
	return apierr.New(apierr.Internal, "spatial product surface pending")
}

func emptyBatch[T any](n int) []product.BatchResult[T] {
	return make([]product.BatchResult[T], n)
}

func (p *ProductPostgres) ReadBatchMapHexes(_ context.Context, _ auth.Authority, keys []MapHexesKey) ([]product.BatchResult[HexList], error) {
	return emptyBatch[HexList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchMapEdges(_ context.Context, _ auth.Authority, keys []MapEdgesKey) ([]product.BatchResult[EdgeList], error) {
	return emptyBatch[EdgeList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchMapNodes(_ context.Context, _ auth.Authority, keys []MapNodesKey) ([]product.BatchResult[NodeList], error) {
	return emptyBatch[NodeList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchMapNodeEdges(_ context.Context, _ auth.Authority, keys []MapNodeEdgesKey) ([]product.BatchResult[NodeEdgeList], error) {
	return emptyBatch[NodeEdgeList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchHexLinks(_ context.Context, _ auth.Authority, keys []HexLinksKey) ([]product.BatchResult[HexLinkList], error) {
	return emptyBatch[HexLinkList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchNodeLinks(_ context.Context, _ auth.Authority, keys []NodeLinksKey) ([]product.BatchResult[NodeLinkList], error) {
	return emptyBatch[NodeLinkList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchPOIs(_ context.Context, _ auth.Authority, keys []POIsKey) ([]product.BatchResult[PoiList], error) {
	return emptyBatch[PoiList](len(keys)), nil
}

func (p *ProductPostgres) ReadableDocumentIDs(_ context.Context, _ auth.Authority, ids []string) (map[string]bool, error) {
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = false
	}
	return out, nil
}

func (p *ProductPostgres) ReadHex(context.Context, auth.Authority, HexSpec) (*HexView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadHexHistory(context.Context, auth.Authority, HexHistorySpec) (HexChangePage, error) {
	return HexChangePage{}, p.pending()
}
func (p *ProductPostgres) ReadMap(context.Context, auth.Authority, MapSpec) (*MapView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadMapView(context.Context, auth.Authority, MapViewSpec) (*MapViewView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadMaps(context.Context, auth.Authority, MapsSpec) ([]MapView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadPoisForHex(context.Context, auth.Authority, PoisForHexSpec) (PoiPage, error) {
	return PoiPage{}, p.pending()
}
func (p *ProductPostgres) ReadRecentHexChanges(context.Context, auth.Authority, RecentHexChangesSpec) (HexChangePage, error) {
	return HexChangePage{}, p.pending()
}

func (p *ProductPostgres) ReadArchonAssignments(context.Context, auth.Authority, ArchonAssignmentsSpec) (ArchonPage, error) {
	return ArchonPage{}, p.pending()
}
func (p *ProductPostgres) ReadRegionActivity(context.Context, auth.Authority, RegionActivitySpec) (*RegionActivityView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadRegionCounts(context.Context, auth.Authority, RegionCountsSpec) (*RegionCountsView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadRegions(context.Context, auth.Authority, RegionsSpec) ([]RegionView, error) {
	return nil, p.pending()
}

func (p *ProductPostgres) ReadGameCalendar(context.Context, auth.Authority, GameCalendarSpec) (TimeCalendarSnapshot, error) {
	return TimeCalendarSnapshot{}, p.pending()
}
func (p *ProductPostgres) ReadGameDate(context.Context, auth.Authority, GameDateSpec) (TimeDateSnapshot, error) {
	return TimeDateSnapshot{}, p.pending()
}
func (p *ProductPostgres) ReadRealDates(context.Context, auth.Authority, RealDatesSpec) (RealDatePage, error) {
	return RealDatePage{}, p.pending()
}
func (p *ProductPostgres) ReadTimeAnchors(context.Context, auth.Authority, TimeAnchorsSpec) (TimeAnchorPage, error) {
	return TimeAnchorPage{}, p.pending()
}
func (p *ProductPostgres) ReadGameDates(_ context.Context, dates []product.Date) ([]product.BatchResult[TimeDateSnapshot], error) {
	return emptyBatch[TimeDateSnapshot](len(dates)), nil
}

func (p *ProductPostgres) LockCreateMap(context.Context, CreateMapSpec) (CreateMapState, error) {
	return CreateMapState{}, p.pending()
}
func (p *ProductPostgres) StoreCreateMap(context.Context, CreateMapWrite) (MapView, error) {
	return MapView{}, p.pending()
}
func (p *ProductPostgres) LockLinkHexEntry(context.Context, LinkHexEntrySpec) (LinkHexEntryState, error) {
	return LinkHexEntryState{}, p.pending()
}
func (p *ProductPostgres) StoreLinkHexEntry(context.Context, LinkHexEntryWrite) (HexEntryLinkView, error) {
	return HexEntryLinkView{}, p.pending()
}
func (p *ProductPostgres) LockLinkPointcrawlEntry(context.Context, LinkPointcrawlEntrySpec) (LinkPointcrawlEntryState, error) {
	return LinkPointcrawlEntryState{}, p.pending()
}
func (p *ProductPostgres) StoreLinkPointcrawlEntry(context.Context, LinkPointcrawlEntryWrite) (PointcrawlEntryLinkView, error) {
	return PointcrawlEntryLinkView{}, p.pending()
}
func (p *ProductPostgres) LockSetHexEdge(context.Context, SetHexEdgeSpec) (SetHexEdgeState, error) {
	return SetHexEdgeState{}, p.pending()
}
func (p *ProductPostgres) StoreSetHexEdge(context.Context, SetHexEdgeWrite) (HexEdgeView, error) {
	return HexEdgeView{}, p.pending()
}
func (p *ProductPostgres) LockSetPointcrawlEdge(context.Context, SetPointcrawlEdgeSpec) (SetPointcrawlEdgeState, error) {
	return SetPointcrawlEdgeState{}, p.pending()
}
func (p *ProductPostgres) StoreSetPointcrawlEdge(context.Context, SetPointcrawlEdgeWrite) (PointcrawlEdgeView, error) {
	return PointcrawlEdgeView{}, p.pending()
}
func (p *ProductPostgres) LockUnlinkHexEntry(context.Context, UnlinkHexEntrySpec) (UnlinkHexEntryState, error) {
	return UnlinkHexEntryState{}, p.pending()
}
func (p *ProductPostgres) StoreUnlinkHexEntry(context.Context, UnlinkHexEntryWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockUnlinkPointcrawlEntry(context.Context, UnlinkPointcrawlEntrySpec) (UnlinkPointcrawlEntryState, error) {
	return UnlinkPointcrawlEntryState{}, p.pending()
}
func (p *ProductPostgres) StoreUnlinkPointcrawlEntry(context.Context, UnlinkPointcrawlEntryWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockUpdateHex(context.Context, UpdateHexSpec) (UpdateHexState, error) {
	return UpdateHexState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateHex(context.Context, UpdateHexWrite) (HexView, error) {
	return HexView{}, p.pending()
}
func (p *ProductPostgres) LockUpsertPoi(context.Context, UpsertPoiSpec) (UpsertPoiState, error) {
	return UpsertPoiState{}, p.pending()
}
func (p *ProductPostgres) StoreUpsertPoi(context.Context, UpsertPoiWrite) (PoiView, error) {
	return PoiView{}, p.pending()
}
func (p *ProductPostgres) LockUpsertPointcrawlNode(context.Context, UpsertPointcrawlNodeSpec) (UpsertPointcrawlNodeState, error) {
	return UpsertPointcrawlNodeState{}, p.pending()
}
func (p *ProductPostgres) StoreUpsertPointcrawlNode(context.Context, UpsertPointcrawlNodeWrite) (PointcrawlNodeView, error) {
	return PointcrawlNodeView{}, p.pending()
}

func (p *ProductPostgres) LockAssignArchon(context.Context, AssignArchonSpec) (AssignArchonState, error) {
	return AssignArchonState{}, p.pending()
}
func (p *ProductPostgres) StoreAssignArchon(context.Context, AssignArchonWrite) (ArchonAssignmentView, error) {
	return ArchonAssignmentView{}, p.pending()
}
func (p *ProductPostgres) LockCreateRegion(context.Context, CreateRegionSpec) (CreateRegionState, error) {
	return CreateRegionState{}, p.pending()
}
func (p *ProductPostgres) StoreCreateRegion(context.Context, CreateRegionWrite) (RegionView, error) {
	return RegionView{}, p.pending()
}
func (p *ProductPostgres) LockDeleteRegion(context.Context, DeleteRegionSpec) (DeleteRegionState, error) {
	return DeleteRegionState{}, p.pending()
}
func (p *ProductPostgres) StoreDeleteRegion(context.Context, DeleteRegionWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockRestoreRegion(context.Context, RestoreRegionSpec) (RestoreRegionState, error) {
	return RestoreRegionState{}, p.pending()
}
func (p *ProductPostgres) StoreRestoreRegion(context.Context, RestoreRegionWrite) (RegionView, error) {
	return RegionView{}, p.pending()
}
func (p *ProductPostgres) LockRevokeArchon(context.Context, RevokeArchonSpec) (RevokeArchonState, error) {
	return RevokeArchonState{}, p.pending()
}
func (p *ProductPostgres) StoreRevokeArchon(context.Context, RevokeArchonWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockTransitionRegion(context.Context, TransitionRegionSpec) (TransitionRegionState, error) {
	return TransitionRegionState{}, p.pending()
}
func (p *ProductPostgres) StoreTransitionRegion(context.Context, TransitionRegionWrite) (RegionView, error) {
	return RegionView{}, p.pending()
}
func (p *ProductPostgres) LockUpdateRegion(context.Context, UpdateRegionSpec) (UpdateRegionState, error) {
	return UpdateRegionState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateRegion(context.Context, UpdateRegionWrite) (RegionView, error) {
	return RegionView{}, p.pending()
}

func (p *ProductPostgres) LockCreateTimeAnchor(context.Context, CreateTimeAnchorSpec) (CreateTimeAnchorState, error) {
	return CreateTimeAnchorState{}, p.pending()
}
func (p *ProductPostgres) StoreCreateTimeAnchor(context.Context, CreateTimeAnchorWrite) (TimeAnchorView, error) {
	return TimeAnchorView{}, p.pending()
}
func (p *ProductPostgres) LockUpdateGameCalendar(context.Context, UpdateGameCalendarSpec) (UpdateGameCalendarState, error) {
	return UpdateGameCalendarState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateGameCalendar(context.Context, UpdateGameCalendarWrite) (GameCalendarView, error) {
	return GameCalendarView{}, p.pending()
}
func (p *ProductPostgres) LockUpdateTimeAnchor(context.Context, UpdateTimeAnchorSpec) (UpdateTimeAnchorState, error) {
	return UpdateTimeAnchorState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateTimeAnchor(context.Context, UpdateTimeAnchorWrite) (TimeAnchorView, error) {
	return TimeAnchorView{}, p.pending()
}

func (p *ProductPostgres) ResolveQuestHexIDs(context.Context, auth.Authority, []QuestHexCandidate) ([]HexAdmission, error) {
	return nil, p.pending()
}

func (p *ProductPostgres) AdmitLocationLink(context.Context, auth.Authority, string, string) (document.LocationAdmission, error) {
	return document.LocationAdmission{}, p.pending()
}

func (p *ProductPostgres) LockContainment(context.Context) error { return p.pending() }
func (p *ProductPostgres) ReadContainmentEdges(context.Context) ([]ContainmentEdge, error) {
	return nil, p.pending()
}
