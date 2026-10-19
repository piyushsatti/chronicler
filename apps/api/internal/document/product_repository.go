package document

import (
	"context"
	"encoding/json"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type GuildReader interface {
	ValidateGuild(ctx context.Context, actor auth.Authority, documentID string) (GuildAdmission, error)
}

type GuildAdmission struct {
	ID       string
	Category *string
}

type DocumentReadRepository interface {
	ReadCodexCategories(ctx context.Context, actor auth.Authority, spec CodexCategoriesSpec) ([]CategoryCountView, error)
	ReadCodexDirectory(ctx context.Context, actor auth.Authority, spec CodexDirectorySpec) (CodexDirectoryResult, error)
	ReadCodexEntry(ctx context.Context, actor auth.Authority, spec CodexEntrySpec) (*CodexEntryCardView, error)
	ReadDocument(ctx context.Context, actor auth.Authority, spec DocumentSpec) (*DocumentView, error)
	ReadDocumentBacklinks(ctx context.Context, actor auth.Authority, spec DocumentBacklinksSpec) ([]DocumentLinkView, error)
	ReadDocumentById(ctx context.Context, actor auth.Authority, spec DocumentByIdSpec) (*DocumentView, error)
	ReadDocumentRevisions(ctx context.Context, actor auth.Authority, spec DocumentRevisionsSpec) (DocumentRevisionPage, error)
	ReadDocuments(ctx context.Context, actor auth.Authority, spec DocumentsSpec) (DocumentListResult, error)
	ReadDocumentsTrash(ctx context.Context, actor auth.Authority, spec DocumentsTrashSpec) (DocumentListResult, error)
	ReadLieutenantAssignments(ctx context.Context, actor auth.Authority, spec LieutenantAssignmentsSpec) (LieutenantPage, error)
	ReadPreviewBody(ctx context.Context, actor auth.Authority, spec PreviewBodySpec) (string, error)
}

type DocumentWriteRepository interface {
	LockAssignLieutenant(ctx context.Context, spec AssignLieutenantSpec) (AssignLieutenantState, error)
	StoreAssignLieutenant(ctx context.Context, write AssignLieutenantWrite) (LieutenantAssignmentView, error)
	LockCreateDocument(ctx context.Context, spec CreateDocumentSpec) (CreateDocumentState, error)
	StoreCreateDocument(ctx context.Context, write CreateDocumentWrite) (DocumentView, error)
	LockDeleteDocument(ctx context.Context, spec DeleteDocumentSpec) (DeleteDocumentState, error)
	StoreDeleteDocument(ctx context.Context, write DeleteDocumentWrite) (product.CommandReceipt, error)
	LockEditPublishedDocument(ctx context.Context, spec EditPublishedDocumentSpec) (EditPublishedDocumentState, error)
	StoreEditPublishedDocument(ctx context.Context, write EditPublishedDocumentWrite) (DocumentView, error)
	LockPublishDocument(ctx context.Context, spec PublishDocumentSpec) (PublishDocumentState, error)
	StorePublishDocument(ctx context.Context, write PublishDocumentWrite) (DocumentView, error)
	LockRestoreDocument(ctx context.Context, spec RestoreDocumentSpec) (RestoreDocumentState, error)
	StoreRestoreDocument(ctx context.Context, write RestoreDocumentWrite) (DocumentView, error)
	LockRevokeLieutenant(ctx context.Context, spec RevokeLieutenantSpec) (RevokeLieutenantState, error)
	StoreRevokeLieutenant(ctx context.Context, write RevokeLieutenantWrite) (product.CommandReceipt, error)
	LockSetDocumentVisibility(ctx context.Context, spec SetDocumentVisibilitySpec) (SetDocumentVisibilityState, error)
	StoreSetDocumentVisibility(ctx context.Context, write SetDocumentVisibilityWrite) (DocumentView, error)
	LockUnpublishDocument(ctx context.Context, spec UnpublishDocumentSpec) (UnpublishDocumentState, error)
	StoreUnpublishDocument(ctx context.Context, write UnpublishDocumentWrite) (DocumentView, error)
	LockUpdateDocument(ctx context.Context, spec UpdateDocumentSpec) (UpdateDocumentState, error)
	StoreUpdateDocument(ctx context.Context, write UpdateDocumentWrite) (DocumentView, error)
	StoreSummary(ctx context.Context, actor auth.Authority, spec SummaryWrite) (WriteResult, error)
	FindAvailableSlug(ctx context.Context, base string) (string, error)
}

type ProductBatchRepository interface {
	ReadBatchDocuments(ctx context.Context, actor auth.Authority, keys []DocumentKey) ([]product.BatchResult[DocumentView], error)
	ReadBatchDmTables(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[DocumentView], error)
	ReadBatchSummaryDerived(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[SummaryDerivedView], error)
	ReadBatchDocumentSubjects(ctx context.Context, actor auth.Authority, keys []DocumentSubjectsKey) ([]product.BatchResult[SubjectLinkList], error)
	ReadBatchReaderIds(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[ReaderIDList], error)
}

type ReferenceAudienceReader interface {
	ReadableDocumentIDs(ctx context.Context, actor auth.Authority, documentIDs []string) (map[string]bool, error)
}

type BriefWriter interface {
	CreateBrief(ctx context.Context, actor auth.Authority, spec BriefCreate) (WriteResult, error)
	EditBrief(ctx context.Context, actor auth.Authority, spec BriefEdit) (WriteResult, error)
}

type SummaryWriter interface {
	WriteSummary(ctx context.Context, actor auth.Authority, spec SummaryWrite) (WriteResult, error)
}

type MentionMemberReader interface {
	ResolveMentionHandles(ctx context.Context, handles []string) (map[string]string, error)
}

type LocationAdmissionReader interface {
	AdmitLocationLink(ctx context.Context, actor auth.Authority, documentID, targetRegionID string) (LocationAdmission, error)
}

type SummaryWrite struct {
	DocumentID  *string
	QuestIDs    []string
	CharacterID *string
	Title       string
	Body        string
	Visibility  string
	Frontmatter json.RawMessage
	At          time.Time
}

type BriefCreate struct {
	QuestID        string
	Title          string
	Body           string
	AdditionalInfo *string
	DMID           string
	RegionIDs      []string
	At             time.Time
}

type BriefEdit struct {
	DocumentID      string
	ExpectedVersion int64
	Title           product.Optional[string]
	Body            product.Optional[string]
	AdditionalInfo  product.Optional[string]
	At              time.Time
}

type WriteResult struct {
	Document DocumentView
	Events   []notification.Event
}

type SubjectLinkList struct {
	Items []DocumentLinkView
}

type ReaderIDList struct {
	Items []string
}

type DocumentSubjectsKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type DocumentKey struct {
	ID     string
	Slug   string
	BySlug bool
}

type IDKey struct {
	ID string
}

type ProductReadRepos struct {
	Document DocumentReadRepository
	Batch    ProductBatchRepository
}

type ProductCommandRepos struct {
	Document  DocumentWriteRepository
	Policy    *auth.Policy
	Authority auth.AuthorityResolver
	Replay    idempotency.Repository
	Producer  notification.EventProducer
	Notice    notification.ProducerRepos
	Audit     auth.OverrideRecorder
	Mentions  MentionMemberReader
}

type LocationAdmission struct {
	DocumentID      string
	LinkedRegionIDs []string
	TargetRegionID  string
	UsedOverride    bool
}
