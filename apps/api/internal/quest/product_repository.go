package quest

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

// QUE02 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Typed repository/read/write contracts and CommandRepos; no transaction ownership.
// Dependencies: P01, QUE01.
// Acceptance: TASK-QUE02, AUTH-quest, BATCH-quest. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/QUE02.json.

type QuestReadRepository interface {
	ReadDmSessionHistory(ctx context.Context, actor auth.Authority, spec DmSessionHistorySpec) (DmSessionHistoryResult, error)
	ReadDmStats(ctx context.Context, actor auth.Authority, spec DmStatsSpec) (*DmStatsView, error)
	ReadDmSummaries(ctx context.Context, actor auth.Authority, spec DmSummariesSpec) (document.DocumentListResult, error)
	ReadMyQuestSignups(ctx context.Context, actor auth.Authority, spec MyQuestSignupsSpec) (ParticipationPage, error)
	ReadOpenQuestSeats(ctx context.Context, actor auth.Authority, spec OpenQuestSeatsSpec) (OpenQuestSeatsResult, error)
	ReadQuest(ctx context.Context, actor auth.Authority, spec QuestSpec) (*QuestView, error)
	ReadQuestBoard(ctx context.Context, actor auth.Authority, spec QuestBoardSpec) (QuestListResult, error)
	ReadQuestGenreOptions(ctx context.Context, actor auth.Authority, spec QuestGenreOptionsSpec) ([]string, error)
	ReadQuestStateCounts(ctx context.Context, actor auth.Authority, spec QuestStateCountsSpec) ([]QuestStateCountView, error)
	ReadQuestSummaries(ctx context.Context, actor auth.Authority, spec QuestSummariesSpec) (QuestSummariesResult, error)
	ReadQuests(ctx context.Context, actor auth.Authority, spec QuestsSpec) (QuestListResult, error)
	ReadRecentlyClosedQuests(ctx context.Context, actor auth.Authority, spec RecentlyClosedQuestsSpec) (QuestListResult, error)
}

type ArcReadRepository interface {
	ReadQuestArc(ctx context.Context, actor auth.Authority, spec QuestArcSpec) (*QuestArcView, error)
	ReadQuestArcs(ctx context.Context, actor auth.Authority, spec QuestArcsSpec) (QuestArcListResult, error)
}

type ArcWriteRepository interface {
	LockUpsertQuestArc(ctx context.Context, spec UpsertQuestArcSpec) (UpsertQuestArcState, error)
	StoreUpsertQuestArc(ctx context.Context, write UpsertQuestArcWrite) (QuestArcView, error)
}

type QuestWriteRepository interface {
	LockAttestQuestParticipation(ctx context.Context, spec AttestQuestParticipationSpec) (AttestQuestParticipationState, error)
	StoreAttestQuestParticipation(ctx context.Context, write AttestQuestParticipationWrite) ([]QuestParticipantView, error)
	LockCloseQuest(ctx context.Context, spec CloseQuestSpec) (CloseQuestState, error)
	StoreCloseQuest(ctx context.Context, write CloseQuestWrite) (QuestView, error)
	LockCreateQuest(ctx context.Context, spec CreateQuestSpec) (CreateQuestState, error)
	StoreCreateQuest(ctx context.Context, write CreateQuestWrite) (QuestView, error)
	LockDeleteQuest(ctx context.Context, spec DeleteQuestSpec) (DeleteQuestState, error)
	StoreDeleteQuest(ctx context.Context, write DeleteQuestWrite) (product.CommandReceipt, error)
	LockRemoveQuestFromArc(ctx context.Context, spec RemoveQuestFromArcSpec) (RemoveQuestFromArcState, error)
	StoreRemoveQuestFromArc(ctx context.Context, write RemoveQuestFromArcWrite) (QuestView, error)
	LockRestoreQuest(ctx context.Context, spec RestoreQuestSpec) (RestoreQuestState, error)
	StoreRestoreQuest(ctx context.Context, write RestoreQuestWrite) (QuestView, error)
	LockSelectQuestParticipants(ctx context.Context, spec SelectQuestParticipantsSpec) (SelectQuestParticipantsState, error)
	StoreSelectQuestParticipants(ctx context.Context, write SelectQuestParticipantsWrite) ([]QuestParticipantView, error)
	LockSetQuestHexes(ctx context.Context, spec SetQuestHexesSpec) (SetQuestHexesState, error)
	StoreSetQuestHexes(ctx context.Context, write SetQuestHexesWrite) ([]QuestHexView, error)
	LockSignupForQuest(ctx context.Context, spec SignupForQuestSpec) (SignupForQuestState, error)
	StoreSignupForQuest(ctx context.Context, write SignupForQuestWrite) (QuestParticipantView, string, error)
	LockSyncQuestDiscord(ctx context.Context, spec SyncQuestDiscordSpec) (SyncQuestDiscordState, error)
	StoreSyncQuestDiscord(ctx context.Context, write SyncQuestDiscordWrite) (DeliveryReceipt, error)
	LockPublishQuestPlayerList(ctx context.Context, spec PublishQuestPlayerListSpec) (PublishQuestPlayerListState, error)
	StorePublishQuestPlayerList(ctx context.Context, write PublishQuestPlayerListWrite) (DeliveryReceipt, error)
	LockTransitionQuestStatus(ctx context.Context, spec TransitionQuestStatusSpec) (TransitionQuestStatusState, error)
	StoreTransitionQuestStatus(ctx context.Context, write TransitionQuestStatusWrite) (QuestView, error)
	LockUpdateQuest(ctx context.Context, spec UpdateQuestSpec) (UpdateQuestState, error)
	StoreUpdateQuest(ctx context.Context, write UpdateQuestWrite) (QuestView, error)
	LockUpsertQuestSummary(ctx context.Context, spec UpsertQuestSummarySpec) (UpsertQuestSummaryState, error)
	StoreUpsertQuestSummary(ctx context.Context, write UpsertQuestSummaryWrite) (document.DocumentView, error)
	LockWithdrawFromQuest(ctx context.Context, spec WithdrawFromQuestSpec) (WithdrawFromQuestState, error)
	StoreWithdrawFromQuest(ctx context.Context, write WithdrawFromQuestWrite) (QuestParticipantView, error)
	StoreCorrectQuestRoster(ctx context.Context, write CorrectQuestRosterWrite) (QuestParticipantView, bool, error)
}

type ProductBatchRepository interface {
	ReadBatchParticipants(ctx context.Context, actor auth.Authority, keys []ParticipantsKey) ([]product.BatchResult[ParticipantList], error)
	ReadBatchQuestHexes(ctx context.Context, actor auth.Authority, keys []QuestHexesKey) ([]product.BatchResult[HexList], error)
	ReadBatchArcs(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[QuestArcView], error)
	ReadBatchArcQuests(ctx context.Context, actor auth.Authority, keys []ArcQuestsKey) ([]product.BatchResult[QuestList], error)
	ReadBatchDelivery(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[QuestDiscordDeliveryView], error)
	ReadBatchRewardEntitlements(ctx context.Context, actor auth.Authority, keys []RewardEntitlementsKey) ([]product.BatchResult[RewardList], error)
}

type RewardDecisionCoverageReader interface {
	ReadRewardDecisionCoverage(ctx context.Context, questIDs []string) ([]RewardDecisionCoverage, error)
}

type SummaryDocumentReader interface {
	ReadDocumentById(ctx context.Context, actor auth.Authority, spec document.DocumentByIdSpec) (*document.DocumentView, error)
}

type TagNormalizer interface {
	NormalizeVocabulary(ctx context.Context, tags, genres []string) (NormalizedVocabulary, error)
	MatchVariants(ctx context.Context, value string, kind TagKind) ([]string, error)
	FoldKey(value string) (string, error)
}

type ProductReadRepos struct {
	Arc              ArcReadRepository
	Quest            QuestReadRepository
	Batch            ProductBatchRepository
	DocumentAudience document.ReferenceAudienceReader
	RewardCoverage   RewardDecisionCoverageReader
}

type ProductCommandRepos struct {
	Arc              ArcWriteRepository
	Quest            QuestWriteRepository
	Policy           *auth.Policy
	Authority        auth.AuthorityResolver
	Replay           idempotency.Repository
	Producer         notification.EventProducer
	Notice           notification.ProducerRepos
	Audit            auth.OverrideRecorder
	Characters       character.AdmissionReader
	Brief            document.BriefWriter
	Summaries        document.SummaryWriter
	Places           spatial.PlaceReader
	Tags             TagNormalizer
	Withdrawals      character.QuestWithdrawalWriter
	Rewards          character.QuestRewardWriter
	SummaryDocuments SummaryDocumentReader
}
