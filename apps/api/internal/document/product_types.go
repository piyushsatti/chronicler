package document

import (
	"encoding/json"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type CategoryCountView struct {
	Category string
	Count    int32
}

type CodexDirectoryResult struct {
	Items []DocumentView
	Total int32
}

type CodexEntryCardView struct {
	BacklinkCount int32
	Document      DocumentView
}

type DocumentAudienceFields struct {
	Policy     []string
	ReaderIds  []string
	Visibility string
}

type DocumentAuthorView struct {
	Handle string
}

type DocumentDraftFields struct {
	Body        string
	Category    *string
	Frontmatter json.RawMessage
	Kind        string
	Policy      []string
	Title       string
	Visibility  string
}

type DocumentEditFields struct {
	Body             product.Optional[string]
	Category         product.Optional[string]
	ExpectedRevision int32
	Frontmatter      product.Optional[json.RawMessage]
	Title            product.Optional[string]
}

type DocumentFiltersFields struct {
	Category   *string
	CreatedBy  *string
	Kind       *string
	Region     *string
	Search     *string
	Status     *string
	Visibility *string
}

type DocumentLinkView struct {
	DocumentId string
	Relation   string
	TargetId   string
	TargetType string
}

type DocumentListResult struct {
	Items []DocumentView
	Total int32
}

type DocumentRevisionPage struct {
	Items []DocumentRevisionView
	Total int32
}

type DocumentRevisionView struct {
	Body        string
	DocumentId  string
	Frontmatter json.RawMessage
	Id          string
	PublishedAt *time.Time
	PublishedBy *string
	Reason      string
	RecordedAt  time.Time
	RecordedBy  *string
	Rev         int32
	Title       string
	Visibility  *string
}

type DocumentSearchHitView struct {
	Category       *string
	Id             string
	Kind           string
	QuestShortCode *string
	Slug           string
	Snippet        string
	Title          string
}

type DocumentView struct {
	AuthorId      string
	Category      *string
	DeletedAt     *time.Time
	DeletedBy     *string
	EffectiveBody *string
	Frontmatter   json.RawMessage
	Id            string
	Kind          string
	Policy        []string
	PublishedAt   *time.Time
	Slug          string
	Status        string
	Title         string
	UpdatedAt     time.Time
	Version       int32
	Visibility    string
}

type LieutenantAssignmentView struct {
	GrantedAt     time.Time
	GrantedBy     *string
	MemberId      string
	NpcDocumentId string
}

type LieutenantPage struct {
	Items []LieutenantAssignmentView
	Total int32
}

type PreviewAudience string

const (
	PreviewAudiencePlayer PreviewAudience = "PLAYER"
	PreviewAudienceDM     PreviewAudience = "DM"
)

type SummaryDerivedView struct {
	Arc        *string
	Dms        []SummaryDmView
	GameDate   *product.GameDateView
	GameDay    *int32
	Hexes      []SummaryHexView
	OccurredAt *time.Time
	Players    []SummaryPlayerView
	Regions    []SummaryRegionView
}

type SummaryDmView struct {
	DisplayName string
	Id          string
}

type SummaryHexView struct {
	Hexcode *string
	Id      string
	MapId   string
}

type SummaryPlayerView struct {
	CharacterId        string
	CharacterName      string
	CharacterShortCode string
	Manual             bool
	MemberId           string
}

type SummaryRegionView struct {
	Id   string
	Name string
}

type AssignLieutenantSpec struct {
	MemberId      string
	NpcDocumentId string
}

type CreateDocumentSpec struct {
	Input DocumentDraftFields
}

type DeleteDocumentSpec struct {
	Id               string
	ExpectedRevision int32
}

type EditPublishedDocumentSpec struct {
	Id    string
	Input DocumentEditFields
}

type PublishDocumentSpec struct {
	Id               string
	ExpectedRevision int32
}

type RestoreDocumentSpec struct {
	Id string
}

type RevokeLieutenantSpec struct {
	MemberId      string
	NpcDocumentId string
}

type SetDocumentVisibilitySpec struct {
	Id               string
	ExpectedRevision int32
	Input            DocumentAudienceFields
}

type UnpublishDocumentSpec struct {
	Id               string
	ExpectedRevision int32
}

type UpdateDocumentSpec struct {
	Id    string
	Input DocumentEditFields
}

type CodexCategoriesSpec struct {
}

type CodexDirectorySpec struct {
	CategoryPrefix *string
	Search         *string
	Limit          int32
	Offset         int32
}

type CodexEntrySpec struct {
	Slug string
}

type DocumentSpec struct {
	Slug string
}

type DocumentBacklinksSpec struct {
	Slug   string
	Limit  int32
	Offset int32
}

type DocumentByIdSpec struct {
	Id string
}

type DocumentRevisionsSpec struct {
	DocumentId string
	Limit      int32
	Offset     int32
}

type DocumentsSpec struct {
	Filters *DocumentFiltersFields
	Limit   int32
	Offset  int32
}

type DocumentsTrashSpec struct {
	Limit  int32
	Offset int32
}

type LieutenantAssignmentsSpec struct {
	MemberId      *string
	NpcDocumentId *string
	Limit         int32
	Offset        int32
}

type PreviewBodySpec struct {
	Body     string
	Audience PreviewAudience
	AuthorId *string
}

type AssignLieutenantState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
}

type CreateDocumentState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
}

type DeleteDocumentState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
}

type EditPublishedDocumentState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
	RawBody        string
	Frontmatter    json.RawMessage
	Policy         json.RawMessage
}

type PublishDocumentState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
	RawBody        string
	Frontmatter    json.RawMessage
	Policy         json.RawMessage
}

type RestoreDocumentState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
}

type RevokeLieutenantState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
}

type SetDocumentVisibilityState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
	Readers        []string
	Policy         json.RawMessage
}

type UnpublishDocumentState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
}

type UpdateDocumentState struct {
	Exists         bool
	SubjectID      string
	OwnerID        string
	Version        int64
	UpdatedAt      *time.Time
	Before         *DocumentView
	LieutenantIDs  []string
	LinkedQuestIDs []string
	RawBody        string
	Frontmatter    json.RawMessage
	Policy         json.RawMessage
}

type AssignLieutenantWrite struct {
	ActorID             string
	At                  time.Time
	Input               AssignLieutenantSpec
	Locked              AssignLieutenantState
	ValidatedInput      AssignLieutenantSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type CreateDocumentWrite struct {
	ActorID             string
	At                  time.Time
	Input               CreateDocumentSpec
	Locked              CreateDocumentState
	ValidatedInput      CreateDocumentSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type DeleteDocumentWrite struct {
	ActorID             string
	At                  time.Time
	Input               DeleteDocumentSpec
	Locked              DeleteDocumentState
	ValidatedInput      DeleteDocumentSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type EditPublishedDocumentWrite struct {
	ActorID             string
	At                  time.Time
	Input               EditPublishedDocumentSpec
	Locked              EditPublishedDocumentState
	ValidatedInput      EditPublishedDocumentSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type PublishDocumentWrite struct {
	ActorID             string
	At                  time.Time
	Input               PublishDocumentSpec
	Locked              PublishDocumentState
	ValidatedInput      PublishDocumentSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type RestoreDocumentWrite struct {
	ActorID             string
	At                  time.Time
	Input               RestoreDocumentSpec
	Locked              RestoreDocumentState
	ValidatedInput      RestoreDocumentSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type RevokeLieutenantWrite struct {
	ActorID             string
	At                  time.Time
	Input               RevokeLieutenantSpec
	Locked              RevokeLieutenantState
	ValidatedInput      RevokeLieutenantSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type SetDocumentVisibilityWrite struct {
	ActorID             string
	At                  time.Time
	Input               SetDocumentVisibilitySpec
	Locked              SetDocumentVisibilityState
	ValidatedInput      SetDocumentVisibilitySpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type UnpublishDocumentWrite struct {
	ActorID             string
	At                  time.Time
	Input               UnpublishDocumentSpec
	Locked              UnpublishDocumentState
	ValidatedInput      UnpublishDocumentSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}

type UpdateDocumentWrite struct {
	ActorID             string
	At                  time.Time
	Input               UpdateDocumentSpec
	Locked              UpdateDocumentState
	ValidatedInput      UpdateDocumentSpec
	HistoryID           *string
	DecisionID          *string
	RevisionID          *string
	EventKey            *string
	NewMentionMemberIDs []string
}
