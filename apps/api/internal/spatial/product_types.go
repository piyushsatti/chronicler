package spatial

import (
	"encoding/json"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ArchonAssignmentView struct {
	GrantedAt time.Time
	GrantedBy *string
	MemberId  string
	RegionId  string
}

type ArchonPage struct {
	Items []ArchonAssignmentView
	Total int32
}

type GameCalendarView struct {
	CurrentGameDay *int32
	Definition     *json.RawMessage
	MonthGrid      []GameDayCellView
}

type GameDayCellView struct {
	GameDay  *int32
	RealDate product.Date
}

type MapCreateFields struct {
	AssetPath *string
	AtlasCode string
	Cols      *int32
	Family    string
	Grid      string
	MapKind   string
	Name      string
	RegionId  *string
	Rows      *int32
}

// MapUpdateFields are the editable map fields. The atlas code (the map's address) and the
// map kind never change after creation.
type MapUpdateFields struct {
	AssetPath *string
	Family    string
	Grid      string
	Name      string
}

type MapView struct {
	CanEdit   bool
	AssetPath *string
	AtlasCode string
	Cols      *int32
	CreatedAt time.Time
	CreatedBy *string
	Family    string
	Grid      string
	Id        string
	MapKind   string
	Name      string
	RegionId  *string
	Rows      *int32
}

type PointcrawlEdgeFields struct {
	Directed   bool
	DocumentId *string
	Id         *string
	Kind       string
	Label      *string
	NodeA      string
	NodeB      string
}

type PointcrawlEdgeView struct {
	Directed   bool
	DocumentId *string
	Id         string
	Kind       string
	Label      *string
	MapId      string
	NodeA      string
	NodeB      string
}

type PointcrawlEntryLinkView struct {
	CreatedAt  time.Time
	CreatedBy  string
	DocumentId string
	MapId      string
	NodeId     string
	Relation   string
}

type PointcrawlNodeFields struct {
	Id       *string
	Name     string
	SubmapId *string
	X        float64
	Y        float64
}

type PointcrawlNodeView struct {
	CreatedAt time.Time
	Id        string
	MapId     string
	Name      string
	State     string
	SubmapId  *string
	X         float64
	Y         float64
}

type RealDatePage struct {
	Items []product.Date
	Total int32
}

type RegionActivityQuestRefView struct {
	FilledCount int32
	Id          string
	ScheduledAt time.Time
	ShortCode   string
	SlotsMax    int32
}

type RegionActivityView struct {
	FillingCount   int32
	LiveCount      int32
	LiveQuests     []RegionActivityQuestRefView
	OpenQuests     []RegionActivityQuestRefView
	RegionId       string
	RegionName     string
	ScheduledCount int32
}

type RegionCountsView struct {
	FeatureCount int32
	HexCount     int32
	QuestCount   int32
	RegionId     string
}

type RegionFields struct {
	CharterDeadline *time.Time
	DocumentId      *string
	Kind            string
	Name            string
}

type RegionView struct {
	CanCreateMap    bool
	CharterDeadline *time.Time
	CreatedAt       time.Time
	DocumentId      *string
	Id              string
	Kind            string
	Name            string
}

type TimeAnchorFields struct {
	EpochDay int32
	Note     *string
	Rate     float64
	RealUtc  time.Time
}

type TimeAnchorPage struct {
	Items []TimeAnchorView
	Total int32
}

type TimeAnchorView struct {
	EpochDay int32
	Id       string
	Note     *string
	Rate     float64
	RealUtc  time.Time
}

type AssignArchonSpec struct {
	MemberId string
	RegionId string
}

type CreateMapSpec struct {
	Input MapCreateFields
}

type UpdateMapSpec struct {
	MapId string
	Input MapUpdateFields
}

type CreateRegionSpec struct {
	Input RegionFields
}

type CreateTimeAnchorSpec struct {
	Input TimeAnchorFields
}

type DeleteRegionSpec struct {
	RegionId string
}

type LinkPointcrawlEntrySpec struct {
	MapId      string
	NodeId     string
	DocumentId string
	Relation   string
}

type RestoreRegionSpec struct {
	RegionId string
}

type RevokeArchonSpec struct {
	MemberId string
	RegionId string
}

type SetPointcrawlEdgeSpec struct {
	MapId string
	Input PointcrawlEdgeFields
}

type TransitionRegionSpec struct {
	Id   string
	To   string
	Note string
}

type UnlinkPointcrawlEntrySpec struct {
	MapId      string
	NodeId     string
	DocumentId string
	Relation   string
}

type UpdateGameCalendarSpec struct {
	Definition json.RawMessage
}

type UpdateRegionSpec struct {
	Id    string
	Input RegionFields
}

type UpdateTimeAnchorSpec struct {
	Id    string
	Input TimeAnchorFields
}

type UpsertPointcrawlNodeSpec struct {
	MapId string
	Input PointcrawlNodeFields
}

type SetPointcrawlNodeStateSpec struct {
	MapId  string
	NodeId string
	State  string
}

type ArchonAssignmentsSpec struct {
	RegionId *string
	MemberId *string
	Limit    int32
	Offset   int32
}

type GameCalendarSpec struct {
	RealFrom product.Date
	RealTo   product.Date
	AsOf     time.Time
}

type GameDateSpec struct {
	RealDate product.Date
}

type MapSpec struct {
	AtlasCode string
}

type MapsSpec struct {
	Family  *string
	MapKind *string
	Limit   int32
	Offset  int32
}

type RealDatesSpec struct {
	GameDay int32
	Limit   int32
	Offset  int32
}

type RegionActivitySpec struct {
	AtlasCode string
}

type RegionCountsSpec struct {
	RegionId string
}

type RegionsSpec struct {
	Kind   *string
	Limit  int32
	Offset int32
}

type TimeAnchorsSpec struct {
	Limit  int32
	Offset int32
}

type AssignArchonState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *RegionView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type CreateMapState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MapView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type CreateRegionState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *RegionView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type CreateTimeAnchorState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *TimeAnchorView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type DeleteRegionState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *RegionView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type LinkPointcrawlEntryState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MapView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
	Links             []PointcrawlEntryLinkView
}

type RestoreRegionState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *RegionView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type RevokeArchonState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *RegionView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type SetPointcrawlEdgeState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MapView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
	Endpoints         []PointcrawlNodeView
}

type TransitionRegionState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *RegionView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type UnlinkPointcrawlEntryState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MapView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
	Links             []PointcrawlEntryLinkView
}

type UpdateGameCalendarState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *TimeAnchorView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
	Definition        json.RawMessage
	Trajectory        []TimeAnchorView
}

type UpdateRegionState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *RegionView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
}

type UpdateTimeAnchorState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *TimeAnchorView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
	Trajectory        []TimeAnchorView
}

type UpsertPointcrawlNodeState struct {
	Exists            bool
	SubjectID         string
	OwnerID           string
	Version           int64
	UpdatedAt         *time.Time
	Before            *MapView
	MapKind           string
	RegionID          *string
	EndpointIDs       []string
	LinkedDocumentIDs []string
	Node              *PointcrawlNodeView
}

type AssignArchonWrite struct {
	ActorID        string
	At             time.Time
	Input          AssignArchonSpec
	Locked         AssignArchonState
	ValidatedInput AssignArchonSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateMapState struct {
	Exists    bool
	SubjectID string
	MapKind   string
	RegionID  *string
	Before    *MapView
}

type UpdateMapWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateMapSpec
	Locked         UpdateMapState
	ValidatedInput UpdateMapSpec
}

type CreateMapWrite struct {
	ActorID        string
	At             time.Time
	Input          CreateMapSpec
	Locked         CreateMapState
	ValidatedInput CreateMapSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type CreateRegionWrite struct {
	ActorID        string
	At             time.Time
	Input          CreateRegionSpec
	Locked         CreateRegionState
	ValidatedInput CreateRegionSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type CreateTimeAnchorWrite struct {
	ActorID        string
	At             time.Time
	Input          CreateTimeAnchorSpec
	Locked         CreateTimeAnchorState
	ValidatedInput CreateTimeAnchorSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type DeleteRegionWrite struct {
	ActorID        string
	At             time.Time
	Input          DeleteRegionSpec
	Locked         DeleteRegionState
	ValidatedInput DeleteRegionSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type LinkPointcrawlEntryWrite struct {
	ActorID        string
	At             time.Time
	Input          LinkPointcrawlEntrySpec
	Locked         LinkPointcrawlEntryState
	ValidatedInput LinkPointcrawlEntrySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type RestoreRegionWrite struct {
	ActorID        string
	At             time.Time
	Input          RestoreRegionSpec
	Locked         RestoreRegionState
	ValidatedInput RestoreRegionSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type RevokeArchonWrite struct {
	ActorID        string
	At             time.Time
	Input          RevokeArchonSpec
	Locked         RevokeArchonState
	ValidatedInput RevokeArchonSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetPointcrawlEdgeWrite struct {
	ActorID        string
	At             time.Time
	Input          SetPointcrawlEdgeSpec
	Locked         SetPointcrawlEdgeState
	ValidatedInput SetPointcrawlEdgeSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type TransitionRegionWrite struct {
	ActorID        string
	At             time.Time
	Input          TransitionRegionSpec
	Locked         TransitionRegionState
	ValidatedInput TransitionRegionSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UnlinkPointcrawlEntryWrite struct {
	ActorID        string
	At             time.Time
	Input          UnlinkPointcrawlEntrySpec
	Locked         UnlinkPointcrawlEntryState
	ValidatedInput UnlinkPointcrawlEntrySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateGameCalendarWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateGameCalendarSpec
	Locked         UpdateGameCalendarState
	ValidatedInput UpdateGameCalendarSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateRegionWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateRegionSpec
	Locked         UpdateRegionState
	ValidatedInput UpdateRegionSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateTimeAnchorWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateTimeAnchorSpec
	Locked         UpdateTimeAnchorState
	ValidatedInput UpdateTimeAnchorSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetPointcrawlNodeStateState struct {
	Exists   bool
	MapKind  string
	RegionID *string
	Node     *PointcrawlNodeView
}

type SetPointcrawlNodeStateWrite struct {
	ActorID        string
	At             time.Time
	Input          SetPointcrawlNodeStateSpec
	Locked         SetPointcrawlNodeStateState
	ValidatedInput SetPointcrawlNodeStateSpec
}

type UpsertPointcrawlNodeWrite struct {
	ActorID        string
	At             time.Time
	Input          UpsertPointcrawlNodeSpec
	Locked         UpsertPointcrawlNodeState
	ValidatedInput UpsertPointcrawlNodeSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type PointcrawlAdmission struct {
	ID            string
	MapID         string
	RegionID      *string
	Role          string
	AdminOverride bool
}
