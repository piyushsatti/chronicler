package character

// CHA02 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Typed repository/read/write contracts and CommandRepos; no transaction ownership.
// Dependencies: P01, CHA01.
// Acceptance: TASK-CHA02, AUTH-character, BATCH-character. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/CHA02.json.

import (
	"context"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type CharacterReadRepository interface {
	ReadAdminCharacterDirectory(ctx context.Context, actor auth.Authority, spec AdminCharacterDirectorySpec) (AdminCharacterDirectoryView, error)
	ReadCharacter(ctx context.Context, actor auth.Authority, spec CharacterSpec) (*CharacterView, error)
	ReadCharacterLogs(ctx context.Context, actor auth.Authority, spec CharacterLogsSpec) (CharacterLogListResult, error)
	ReadCharacterProgression(ctx context.Context, actor auth.Authority, spec CharacterProgressionSpec) (ProgressionListResult, error)
	ReadCharacterSummaries(ctx context.Context, actor auth.Authority, spec CharacterSummariesSpec) (document.DocumentListResult, error)
	ReadCharacterVerificationHistory(ctx context.Context, actor auth.Authority, spec CharacterVerificationHistorySpec) (member.VerificationPage, error)
	ReadCharacters(ctx context.Context, actor auth.Authority, spec CharactersSpec) (CharacterV2ListResult, error)
	ReadCoPlayers(ctx context.Context, actor auth.Authority, spec CoPlayersSpec) (CoPlayerPage, error)
	ReadDowntimeProjects(ctx context.Context, actor auth.Authority, spec DowntimeProjectsSpec) (DowntimeProjectListResult, error)
	ReadMyCharacters(ctx context.Context, actor auth.Authority, spec MyCharactersSpec) (CharacterV2ListResult, error)
	ReadMyQuestRewards(ctx context.Context, actor auth.Authority, spec MyQuestRewardsSpec) (RewardEntitlementPage, error)
	ReadParticipationsByCharacter(ctx context.Context, actor auth.Authority, spec ParticipationsByCharacterSpec) (ParticipationPageView, error)
	ReadPendingCharacterVerifications(ctx context.Context, actor auth.Authority, spec PendingCharacterVerificationsSpec) (CharacterV2ListResult, error)
}

type CharacterWriteRepository interface {
	LockAdjustPcxp(ctx context.Context, spec AdjustPcxpSpec) (AdjustPcxpState, error)
	StoreAdjustPcxp(ctx context.Context, write AdjustPcxpWrite) (ProgressionEntryView, error)
	LockClaimQuestRewards(ctx context.Context, spec ClaimQuestRewardsSpec) (ClaimQuestRewardsState, error)
	StoreClaimQuestRewards(ctx context.Context, write ClaimQuestRewardsWrite) (RewardClaimReceipt, error)
	LockCreateCharacter(ctx context.Context, spec CreateCharacterSpec) (CreateCharacterState, error)
	StoreCreateCharacter(ctx context.Context, write CreateCharacterWrite) (CharacterView, error)
	LockDecideVerification(ctx context.Context, spec DecideVerificationSpec) (DecideVerificationState, error)
	StoreDecideVerification(ctx context.Context, write DecideVerificationWrite) (member.VerificationView, error)
	LockDeleteCharacter(ctx context.Context, spec DeleteCharacterSpec) (DeleteCharacterState, error)
	StoreDeleteCharacter(ctx context.Context, write DeleteCharacterWrite) (product.CommandReceipt, error)
	LockDeleteCharacterLog(ctx context.Context, spec DeleteCharacterLogSpec) (DeleteCharacterLogState, error)
	StoreDeleteCharacterLog(ctx context.Context, write DeleteCharacterLogWrite) (product.CommandReceipt, error)
	LockLogCharacterEvent(ctx context.Context, spec LogCharacterEventSpec) (LogCharacterEventState, error)
	StoreLogCharacterEvent(ctx context.Context, write LogCharacterEventWrite) (CharacterLogView, error)
	LockRestoreCharacter(ctx context.Context, spec RestoreCharacterSpec) (RestoreCharacterState, error)
	StoreRestoreCharacter(ctx context.Context, write RestoreCharacterWrite) (CharacterView, error)
	LockRetireCharacter(ctx context.Context, spec RetireCharacterSpec) (RetireCharacterState, error)
	StoreRetireCharacter(ctx context.Context, write RetireCharacterWrite) (CharacterView, error)
	LockSetCharacterGuild(ctx context.Context, spec SetCharacterGuildSpec) (SetCharacterGuildState, error)
	StoreSetCharacterGuild(ctx context.Context, write SetCharacterGuildWrite) (CharacterView, error)
	LockSubmitForVerification(ctx context.Context, spec SubmitForVerificationSpec) (SubmitForVerificationState, error)
	StoreSubmitForVerification(ctx context.Context, write SubmitForVerificationWrite) (CharacterView, error)
	LockSyncCharacterDdb(ctx context.Context, spec SyncCharacterDdbSpec) (SyncCharacterDdbState, error)
	StoreSyncCharacterDdb(ctx context.Context, write SyncCharacterDdbWrite) (DdbSyncReceipt, error)
	LockUpdateCharacterProfile(ctx context.Context, spec UpdateCharacterProfileSpec) (UpdateCharacterProfileState, error)
	StoreUpdateCharacterProfile(ctx context.Context, write UpdateCharacterProfileWrite) (CharacterView, error)
	LockUpsertDowntimeProject(ctx context.Context, spec UpsertDowntimeProjectSpec) (UpsertDowntimeProjectState, error)
	StoreUpsertDowntimeProject(ctx context.Context, write UpsertDowntimeProjectWrite) (DowntimeProjectView, error)
}

type ProductBatchRepository interface {
	ReadBatchCharacters(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[CharacterView], error)
}

type ReferenceReadRepository interface {
	ReadBackstories(ctx context.Context, actor auth.Authority, spec BackstoriesSpec) (BackstoryPage, error)
	ReadCreationCatalog(ctx context.Context, actor auth.Authority, spec CreationCatalogSpec) (CreationCatalogPage, error)
}

type ReferenceWriteRepository interface {
	LockCreateBackstory(ctx context.Context, spec CreateBackstorySpec) (CreateBackstoryState, error)
	StoreCreateBackstory(ctx context.Context, write CreateBackstoryWrite) (BackstoryView, error)
	LockUpdateBackstory(ctx context.Context, spec UpdateBackstorySpec) (UpdateBackstoryState, error)
	StoreUpdateBackstory(ctx context.Context, write UpdateBackstoryWrite) (BackstoryView, error)
	LockUpsertCreationCatalogEntry(ctx context.Context, spec UpsertCreationCatalogEntrySpec) (UpsertCreationCatalogEntryState, error)
	StoreUpsertCreationCatalogEntry(ctx context.Context, write UpsertCreationCatalogEntryWrite) (CreationCatalogEntryView, error)
}

type AdmissionReader interface {
	ReadImmutableOwner(ctx context.Context, characterID string) (string, error)
	LockAdmissions(ctx context.Context, characterIDs []string) ([]Admission, error)
	LockAdmission(ctx context.Context, characterID string) (Admission, error)
}

type RewardClaimWriter interface {
	LockRewardClaims(ctx context.Context, questID, characterID string) ([]QuestRewardEntitlementView, error)
	MarkRewardClaims(ctx context.Context, claims []RewardClaimBinding, at time.Time) error
}

type QuestWithdrawalWriter interface {
	PlanOwnedCharacterWithdrawal(ctx context.Context, characterID string, questIDs []string) (WithdrawalPlan, error)
	WithdrawOwnedCharacter(ctx context.Context, actorID string, plan WithdrawalPlan, reason string, at time.Time) (WithdrawalEffects, error)
}

type IDKey struct{ ID string }

type WithdrawalPlan struct {
	OwnedCharacterID string
	CharacterIDs     []string
	QuestIDs         []string
	Bindings         []LiveParticipationBinding
}

type WithdrawalEffects struct {
	Bindings          []LiveParticipationBinding
	PromotedMemberIDs []string
	Events            []notification.Event
}

type ProductReadRepos struct {
	Character        CharacterReadRepository
	Reference        ReferenceReadRepository
	Batch            ProductBatchRepository
	DocumentAudience document.ReferenceAudienceReader
}

type ProductCommandRepos struct {
	Character   CharacterWriteRepository
	Reference   ReferenceWriteRepository
	Policy      *auth.Policy
	Authority   auth.AuthorityResolver
	Replay      idempotency.Repository
	Producer    notification.EventProducer
	Notice      notification.ProducerRepos
	Audit       auth.OverrideRecorder
	Guilds      document.GuildReader
	Admissions  AdmissionReader
	Claims      RewardClaimWriter
	Assessments member.AssessmentWriter
	Withdrawals QuestWithdrawalWriter
}

type RewardClaims struct {
	Runner uow.Runner[ProductCommandRepos]
	Clock  product.Clock
	IDs    product.IDGenerator
}
