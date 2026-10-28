package spatial

import (
	"context"
	"encoding/json"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type MapReadRepository interface {
	ReadHex(ctx context.Context, actor auth.Authority, spec HexSpec) (*HexView, error)
	ReadHexHistory(ctx context.Context, actor auth.Authority, spec HexHistorySpec) (HexChangePage, error)
	ReadMap(ctx context.Context, actor auth.Authority, spec MapSpec) (*MapView, error)
	ReadMapView(ctx context.Context, actor auth.Authority, spec MapViewSpec) (*MapViewView, error)
	ReadMaps(ctx context.Context, actor auth.Authority, spec MapsSpec) ([]MapView, error)
	ReadPoisForHex(ctx context.Context, actor auth.Authority, spec PoisForHexSpec) (PoiPage, error)
	ReadRecentHexChanges(ctx context.Context, actor auth.Authority, spec RecentHexChangesSpec) (HexChangePage, error)
}

type MapWriteRepository interface {
	LockCreateMap(ctx context.Context, spec CreateMapSpec) (CreateMapState, error)
	StoreCreateMap(ctx context.Context, write CreateMapWrite) (MapView, error)
	LockUpdateMap(ctx context.Context, spec UpdateMapSpec) (UpdateMapState, error)
	StoreUpdateMap(ctx context.Context, write UpdateMapWrite) (MapView, error)
	LockLinkHexEntry(ctx context.Context, spec LinkHexEntrySpec) (LinkHexEntryState, error)
	StoreLinkHexEntry(ctx context.Context, write LinkHexEntryWrite) (HexEntryLinkView, error)
	LockLinkPointcrawlEntry(ctx context.Context, spec LinkPointcrawlEntrySpec) (LinkPointcrawlEntryState, error)
	StoreLinkPointcrawlEntry(ctx context.Context, write LinkPointcrawlEntryWrite) (PointcrawlEntryLinkView, error)
	LockSetHexEdge(ctx context.Context, spec SetHexEdgeSpec) (SetHexEdgeState, error)
	StoreSetHexEdge(ctx context.Context, write SetHexEdgeWrite) (HexEdgeView, error)
	LockSetPointcrawlEdge(ctx context.Context, spec SetPointcrawlEdgeSpec) (SetPointcrawlEdgeState, error)
	StoreSetPointcrawlEdge(ctx context.Context, write SetPointcrawlEdgeWrite) (PointcrawlEdgeView, error)
	LockUnlinkHexEntry(ctx context.Context, spec UnlinkHexEntrySpec) (UnlinkHexEntryState, error)
	StoreUnlinkHexEntry(ctx context.Context, write UnlinkHexEntryWrite) (product.CommandReceipt, error)
	LockUnlinkPointcrawlEntry(ctx context.Context, spec UnlinkPointcrawlEntrySpec) (UnlinkPointcrawlEntryState, error)
	StoreUnlinkPointcrawlEntry(ctx context.Context, write UnlinkPointcrawlEntryWrite) (product.CommandReceipt, error)
	LockUpdateHex(ctx context.Context, spec UpdateHexSpec) (UpdateHexState, error)
	StoreUpdateHex(ctx context.Context, write UpdateHexWrite) (HexView, error)
	LockUpsertPoi(ctx context.Context, spec UpsertPoiSpec) (UpsertPoiState, error)
	StoreUpsertPoi(ctx context.Context, write UpsertPoiWrite) (PoiView, error)
	LockUpsertPointcrawlNode(ctx context.Context, spec UpsertPointcrawlNodeSpec) (UpsertPointcrawlNodeState, error)
	StoreUpsertPointcrawlNode(ctx context.Context, write UpsertPointcrawlNodeWrite) (PointcrawlNodeView, error)
	LockSetPointcrawlNodeState(ctx context.Context, spec SetPointcrawlNodeStateSpec) (SetPointcrawlNodeStateState, error)
	StoreSetPointcrawlNodeState(ctx context.Context, write SetPointcrawlNodeStateWrite) (PointcrawlNodeView, error)
	ReadMapReference(ctx context.Context, mapID string) (auth.MapRef, error)
}

type ProductBatchRepository interface {
	ReadBatchMapHexes(ctx context.Context, actor auth.Authority, keys []MapHexesKey) ([]product.BatchResult[HexList], error)
	ReadBatchMapEdges(ctx context.Context, actor auth.Authority, keys []MapEdgesKey) ([]product.BatchResult[EdgeList], error)
	ReadBatchMapNodes(ctx context.Context, actor auth.Authority, keys []MapNodesKey) ([]product.BatchResult[NodeList], error)
	ReadBatchMapNodeEdges(ctx context.Context, actor auth.Authority, keys []MapNodeEdgesKey) ([]product.BatchResult[NodeEdgeList], error)
	ReadBatchHexLinks(ctx context.Context, actor auth.Authority, keys []HexLinksKey) ([]product.BatchResult[HexLinkList], error)
	ReadBatchNodeLinks(ctx context.Context, actor auth.Authority, keys []NodeLinksKey) ([]product.BatchResult[NodeLinkList], error)
	ReadBatchPOIs(ctx context.Context, actor auth.Authority, keys []POIsKey) ([]product.BatchResult[PoiList], error)
}

type RegionReadRepository interface {
	ReadArchonAssignments(ctx context.Context, actor auth.Authority, spec ArchonAssignmentsSpec) (ArchonPage, error)
	ReadRegionActivity(ctx context.Context, actor auth.Authority, spec RegionActivitySpec) (*RegionActivityView, error)
	ReadRegionCounts(ctx context.Context, actor auth.Authority, spec RegionCountsSpec) (*RegionCountsView, error)
	ReadRegions(ctx context.Context, actor auth.Authority, spec RegionsSpec) ([]RegionView, error)
}

type PlaceReader interface {
	ResolveQuestPointcrawlNodes(ctx context.Context, actor auth.Authority, nodes []QuestPointcrawlCandidate) ([]PointcrawlAdmission, error)
}

type DocumentReferenceReader interface {
	ReadCommandDocument(ctx context.Context, actor auth.Authority, documentID string) (document.DocumentView, error)
}

type RegionWriteRepository interface {
	LockAssignArchon(ctx context.Context, spec AssignArchonSpec) (AssignArchonState, error)
	StoreAssignArchon(ctx context.Context, write AssignArchonWrite) (ArchonAssignmentView, error)
	LockCreateRegion(ctx context.Context, spec CreateRegionSpec) (CreateRegionState, error)
	StoreCreateRegion(ctx context.Context, write CreateRegionWrite) (RegionView, error)
	LockDeleteRegion(ctx context.Context, spec DeleteRegionSpec) (DeleteRegionState, error)
	StoreDeleteRegion(ctx context.Context, write DeleteRegionWrite) (product.CommandReceipt, error)
	LockRestoreRegion(ctx context.Context, spec RestoreRegionSpec) (RestoreRegionState, error)
	StoreRestoreRegion(ctx context.Context, write RestoreRegionWrite) (RegionView, error)
	LockRevokeArchon(ctx context.Context, spec RevokeArchonSpec) (RevokeArchonState, error)
	StoreRevokeArchon(ctx context.Context, write RevokeArchonWrite) (product.CommandReceipt, error)
	LockTransitionRegion(ctx context.Context, spec TransitionRegionSpec) (TransitionRegionState, error)
	StoreTransitionRegion(ctx context.Context, write TransitionRegionWrite) (RegionView, error)
	LockUpdateRegion(ctx context.Context, spec UpdateRegionSpec) (UpdateRegionState, error)
	StoreUpdateRegion(ctx context.Context, write UpdateRegionWrite) (RegionView, error)
}

type TimeReadRepository interface {
	ReadGameCalendar(ctx context.Context, actor auth.Authority, spec GameCalendarSpec) (TimeCalendarSnapshot, error)
	ReadGameDate(ctx context.Context, actor auth.Authority, spec GameDateSpec) (TimeDateSnapshot, error)
	ReadRealDates(ctx context.Context, actor auth.Authority, spec RealDatesSpec) (RealDatePage, error)
	ReadTimeAnchors(ctx context.Context, actor auth.Authority, spec TimeAnchorsSpec) (TimeAnchorPage, error)
}

type TimeWriteRepository interface {
	LockTimeProjection(ctx context.Context, from product.Date, to product.Date) ([]TimeAnchorView, error)
	StoreTimeProjection(ctx context.Context, from product.Date, to product.Date, cells []GameDayCellView) (int32, error)
	LockCreateTimeAnchor(ctx context.Context, spec CreateTimeAnchorSpec) (CreateTimeAnchorState, error)
	StoreCreateTimeAnchor(ctx context.Context, write CreateTimeAnchorWrite) (TimeAnchorView, error)
	LockUpdateGameCalendar(ctx context.Context, spec UpdateGameCalendarSpec) (UpdateGameCalendarState, error)
	StoreUpdateGameCalendar(ctx context.Context, write UpdateGameCalendarWrite) (GameCalendarView, error)
	LockUpdateTimeAnchor(ctx context.Context, spec UpdateTimeAnchorSpec) (UpdateTimeAnchorState, error)
	StoreUpdateTimeAnchor(ctx context.Context, write UpdateTimeAnchorWrite) (TimeAnchorView, error)
}

type TimeBatchReadRepository interface {
	ReadGameDates(ctx context.Context, dates []product.Date) ([]product.BatchResult[TimeDateSnapshot], error)
}

type QuestPointcrawlCandidate struct {
	ID   string
	Role string
}

type ContainmentWriter interface {
	LockContainment(ctx context.Context) error
	ReadContainmentEdges(ctx context.Context) ([]ContainmentEdge, error)
}

type MapHexesKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type MapEdgesKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type MapNodesKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type MapNodeEdgesKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type HexLinksKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type NodeLinksKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type POIsKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type HexList struct {
	Items []HexView
}

type EdgeList struct {
	Items []HexEdgeView
}

type NodeList struct {
	Items []PointcrawlNodeView
}

type NodeEdgeList struct {
	Items []PointcrawlEdgeView
}

type HexLinkList struct {
	Items []HexEntryLinkView
}

type NodeLinkList struct {
	Items []PointcrawlEntryLinkView
}

type PoiList struct {
	Items []PoiView
}

type TimeDateSnapshot struct {
	GameDay    *int32
	Definition *json.RawMessage
}

type TimeCalendarSnapshot struct {
	CurrentGameDay *int32
	Definition     *json.RawMessage
	Cells          []GameDayCellView
}

type ContainmentEdge struct {
	ParentMapID string
	ChildMapID  string
}

type ProductReadRepos struct {
	Map              MapReadRepository
	Region           RegionReadRepository
	Time             TimeReadRepository
	Batch            ProductBatchRepository
	DocumentAudience document.ReferenceAudienceReader
	TimeBatch        TimeBatchReadRepository
}

type ProductCommandRepos struct {
	Map         MapWriteRepository
	Region      RegionWriteRepository
	Time        TimeWriteRepository
	Policy      *auth.Policy
	Authority   auth.AuthorityResolver
	Replay      idempotency.Repository
	Producer    notification.EventProducer
	Notice      notification.ProducerRepos
	Audit       auth.OverrideRecorder
	Locations   document.LocationAdmissionReader
	Containment ContainmentWriter
	Documents   DocumentReferenceReader
}
