package character

// CHA01 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Exact domain DTOs and typed operation Specs from interfaces.json, no graph imports.
// Dependencies: P01, P02.
// Acceptance: TASK-CHA01, AUTH-character, BATCH-character. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/CHA01.json.

import (
	"encoding/json"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type AdminCharacterDirectoryEntryView struct {
	DdbSyncedAt             *time.Time
	DdbUrl                  *string
	GuildId                 *string
	Id                      string
	Name                    string
	OwnerAvatarUrl          *string
	OwnerDisplayName        string
	OwnerHandle             string
	OwnerId                 string
	RegionId                *string
	RegionName              *string
	ShortCode               string
	Status                  string
	UpdatedAt               time.Time
	VerificationStatus      string
	VerificationSubmittedAt *time.Time
}

type AdminCharacterDirectoryFiltersFields struct {
	NamePrefix *string
	RegionId   *string
	Status     *string
}

type AdminCharacterDirectoryView struct {
	Items []AdminCharacterDirectoryEntryView
	Total int32
}

type BackstoryFiltersFields struct {
	Cohort         *string
	IncludeRetired bool
	RegionId       *string
}

type BackstoryFields struct {
	Cohort         string
	Lore           string
	Name           string
	Retired        bool
	SourceRegionId *string
}

type BackstoryPage struct {
	Items []BackstoryView
	Total int32
}

type BackstoryView struct {
	Cohort         string
	Id             string
	Lore           string
	Name           string
	Retired        bool
	SourceRegionId *string
}

type CharacterDDBMirrorView struct {
	ArmorClass  *int32
	Background  *string
	CharacterId string
	Classes     *string
	Level       *int32
	MaxHp       *int32
	Species     *string
	SyncedAt    *time.Time
	Xp          *int32
}

type CharacterLogListResult struct {
	Items []CharacterLogView
	Total int32
}

type CharacterLogView struct {
	Body        string
	CharacterId string
	CreatedAt   time.Time
	CreatedBy   *string
	Id          string
	QuestId     *string
}

type CharacterReviewStatus string

const (
	CharacterReviewStatusPending  CharacterReviewStatus = "PENDING"
	CharacterReviewStatusRejected CharacterReviewStatus = "REJECTED"
	CharacterReviewStatusApproved CharacterReviewStatus = "APPROVED"
	CharacterReviewStatusUnknown  CharacterReviewStatus = "UNKNOWN"
)

type CharacterFiltersFields struct {
	GuildId    *string
	NamePrefix *string
	OwnerId    *string
	RegionId   *string
	Status     *string
}

type CharacterListResult struct {
	Items []CharacterView
	Total int32
}

type CharacterView struct {
	BackgroundText          *string
	BackstoryId             *string
	CreatedAt               time.Time
	DaysActive              int32
	DdbLastAttempt          *DdbAttemptView
	DdbMirror               *CharacterDDBMirrorView
	DdbUrl                  *string
	Description             *string
	DisplayIcon             *string
	GuildId                 *string
	Id                      string
	ImageUrl                *string
	Name                    string
	OwnerId                 string
	Pcxp                    int32
	Proficiencies           []DDBProficiencyView
	RegionId                *string
	ShortCode               string
	Status                  string
	UpdatedAt               time.Time
	VerificationStatus      CharacterReviewStatus
	VerificationSubmittedAt *time.Time
}

type CoPlayerPage struct {
	Items []CoPlayerView
	Total int32
}

type CoPlayerView struct {
	CharacterId string
	MemberId    string
	QuestCount  int32
}

type CreateCharacterFields struct {
	BackgroundText *string
	BackstoryId    *string
	CatalogPickIds []string
	DdbUrl         *string
	Description    *string
	GuildId        *string
	ImageUrl       *string
	Name           string
	RegionId       *string
	ShortCode      *string
}

type CreationCatalogEntryView struct {
	Available            bool
	Description          *string
	Id                   string
	IntroducedByRegionId *string
	Kind                 string
	Name                 string
	Retired              bool
}

type CreationCatalogFiltersFields struct {
	IncludeAll bool
	Kind       *string
	RegionId   *string
}

type CreationCatalogPage struct {
	Items []CreationCatalogEntryView
	Total int32
}

type DDBProficiencyView struct {
	Kind string
	Name string
}

type DdbAttemptView struct {
	AttemptedAt time.Time
	FinishedAt  time.Time
	Id          string
	Provenance  json.RawMessage
	SafeError   *string
	Succeeded   bool
}

type DdbSyncReceipt struct {
	AttemptedAt time.Time
	Character   CharacterView
	SafeError   *string
	Succeeded   bool
}

type DowntimeFields struct {
	Goal     *string
	Id       *string
	Name     string
	Notes    *string
	Progress int32
	Status   string
	Target   *int32
}

type DowntimeProjectListResult struct {
	Items []DowntimeProjectView
	Total int32
}

type DowntimeProjectView struct {
	CharacterId string
	Goal        *string
	Id          string
	Name        string
	Notes       *string
	Progress    int32
	Status      string
	Target      *int32
	UpdatedAt   time.Time
}

type ProgressionEntryView struct {
	Amount      *int32
	CharacterId string
	Id          string
	Kind        string
	Note        *string
	QuestId     *string
	RecordedAt  time.Time
	RecordedBy  *string
}

type ProgressionListResult struct {
	Items []ProgressionEntryView
	Total int32
}

type QuestRewardEntitlementView struct {
	AwardedAt          time.Time
	AwardedBy          string
	CharacterId        string
	ClaimedAt          *time.Time
	Id                 string
	Note               *string
	Pcxp               int32
	ProgressionEntryId *string
	QuestId            string
}

type RewardClaimReceipt struct {
	AlreadyClaimed     bool
	EntitlementIds     []string
	ProgressionEntries []ProgressionEntryView
	Replayed           bool
}

type RewardClaimStatus string

const (
	RewardClaimStatusUnclaimed RewardClaimStatus = "UNCLAIMED"
	RewardClaimStatusClaimed   RewardClaimStatus = "CLAIMED"
)

type RewardEntitlementPage struct {
	Items []QuestRewardEntitlementView
	Total int32
}

type UpdateCharacterProfileFields struct {
	BackgroundText product.Optional[string]
	Description    product.Optional[string]
	ImageUrl       product.Optional[string]
}

type UpsertCreationCatalogEntryFields struct {
	Available            bool
	Description          *string
	IntroducedByRegionId *string
	Kind                 string
	Name                 string
	OptionId             *string
	Retired              bool
}

type AdjustPcxpSpec struct {
	CharacterId string
	Amount      int32
	Note        string
}

type ClaimQuestRewardsSpec struct {
	QuestId     string
	CharacterId string
}

type CreateBackstorySpec struct {
	Input BackstoryFields
}

type CreateCharacterSpec struct {
	Input CreateCharacterFields
}

type DecideVerificationSpec struct {
	CharacterId         string
	ExpectedSubmittedAt time.Time
	Verdict             member.VerificationVerdict
	Note                *string
}

type DeleteCharacterSpec struct {
	CharacterId string
}

type DeleteCharacterLogSpec struct {
	CharacterId string
	LogId       string
}

type LogCharacterEventSpec struct {
	CharacterId string
	Body        string
	QuestId     *string
}

type RestoreCharacterSpec struct {
	CharacterId string
}

type RetireCharacterSpec struct {
	CharacterId       string
	ExpectedUpdatedAt time.Time
}

type SetCharacterGuildSpec struct {
	CharacterId string
	GuildId     *string
}

type SubmitForVerificationSpec struct {
	CharacterId       string
	ExpectedUpdatedAt time.Time
}

type SyncCharacterDdbSpec struct {
	CharacterId string
	DdbUrl      string
}

type UpdateBackstorySpec struct {
	Id    string
	Input BackstoryFields
}

type UpdateCharacterProfileSpec struct {
	CharacterId string
	Input       UpdateCharacterProfileFields
}

type UpsertCreationCatalogEntrySpec struct {
	Input UpsertCreationCatalogEntryFields
}

type UpsertDowntimeProjectSpec struct {
	CharacterId string
	Input       DowntimeFields
}

type AdminCharacterDirectorySpec struct {
	Filters *AdminCharacterDirectoryFiltersFields
	Limit   int32
	Offset  int32
}

type BackstoriesSpec struct {
	Filters *BackstoryFiltersFields
	Limit   int32
	Offset  int32
}

type CharacterSpec struct {
	Id        *string
	ShortCode *string
}

type CharacterLogsSpec struct {
	CharacterId string
	Limit       int32
	Offset      int32
}

type CharacterProgressionSpec struct {
	CharacterId string
	Limit       int32
	Offset      int32
}

type CharacterSummariesSpec struct {
	CharacterId string
	Limit       int32
	Offset      int32
}

type CharacterVerificationHistorySpec struct {
	CharacterId string
	Limit       int32
	Offset      int32
}

type CharactersSpec struct {
	Filters *CharacterFiltersFields
	Limit   int32
	Offset  int32
}

type CoPlayersSpec struct {
	CharacterId string
	Limit       int32
	Offset      int32
}

type CreationCatalogSpec struct {
	Filters *CreationCatalogFiltersFields
	Limit   int32
	Offset  int32
}

type DowntimeProjectsSpec struct {
	CharacterId string
	Limit       int32
	Offset      int32
}

type MyCharactersSpec struct {
	Limit  int32
	Offset int32
}

type MyQuestRewardsSpec struct {
	Status *RewardClaimStatus
	Limit  int32
	Offset int32
}

type ParticipationsByCharacterSpec struct {
	CharacterId string
	Limit       int32
	Offset      int32
}

type PendingCharacterVerificationsSpec struct {
	Limit  int32
	Offset int32
}

type AdjustPcxpState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type ClaimQuestRewardsState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
	Entitlements []QuestRewardEntitlementView
}

type CreateBackstoryState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *BackstoryView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type CreateCharacterState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type DecideVerificationState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type DeleteCharacterState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type DeleteCharacterLogState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type LogCharacterEventState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type RestoreCharacterState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type RetireCharacterState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type SetCharacterGuildState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type SubmitForVerificationState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type SyncCharacterDdbState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type UpdateBackstoryState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *BackstoryView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type UpdateCharacterProfileState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type UpsertCreationCatalogEntryState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CreationCatalogEntryView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type UpsertDowntimeProjectState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *CharacterView
	LiveBindings []LiveParticipationBinding
	Assessment   *member.VerificationView
	CatalogIDs   []string
}

type AdjustPcxpWrite struct {
	ActorID        string
	At             time.Time
	Input          AdjustPcxpSpec
	Locked         AdjustPcxpState
	ValidatedInput AdjustPcxpSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type ClaimQuestRewardsWrite struct {
	ActorID               string
	At                    time.Time
	Input                 ClaimQuestRewardsSpec
	Locked                ClaimQuestRewardsState
	ValidatedInput        ClaimQuestRewardsSpec
	HistoryID             *string
	DecisionID            *string
	RevisionID            *string
	EventKey              *string
	ValidatedEntitlements []QuestRewardEntitlementView
	LedgerBindings        []RewardClaimBinding
}

type CreateBackstoryWrite struct {
	ActorID        string
	At             time.Time
	Input          CreateBackstorySpec
	Locked         CreateBackstoryState
	ValidatedInput CreateBackstorySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type CreateCharacterWrite struct {
	ActorID        string
	At             time.Time
	Input          CreateCharacterSpec
	Locked         CreateCharacterState
	ValidatedInput CreateCharacterSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
	// Nil when the submission sync failed. Stored with At so it is not older than verification_submitted_at.
	DdbPayload json.RawMessage
}

type DecideVerificationWrite struct {
	ActorID        string
	At             time.Time
	Input          DecideVerificationSpec
	Locked         DecideVerificationState
	ValidatedInput DecideVerificationSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
	Assessment     member.VerificationView
}

type DeleteCharacterWrite struct {
	ActorID        string
	At             time.Time
	Input          DeleteCharacterSpec
	Locked         DeleteCharacterState
	ValidatedInput DeleteCharacterSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type DeleteCharacterLogWrite struct {
	ActorID        string
	At             time.Time
	Input          DeleteCharacterLogSpec
	Locked         DeleteCharacterLogState
	ValidatedInput DeleteCharacterLogSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type LogCharacterEventWrite struct {
	ActorID        string
	At             time.Time
	Input          LogCharacterEventSpec
	Locked         LogCharacterEventState
	ValidatedInput LogCharacterEventSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type RestoreCharacterWrite struct {
	ActorID        string
	At             time.Time
	Input          RestoreCharacterSpec
	Locked         RestoreCharacterState
	ValidatedInput RestoreCharacterSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type RetireCharacterWrite struct {
	ActorID        string
	At             time.Time
	Input          RetireCharacterSpec
	Locked         RetireCharacterState
	ValidatedInput RetireCharacterSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetCharacterGuildWrite struct {
	ActorID        string
	At             time.Time
	Input          SetCharacterGuildSpec
	Locked         SetCharacterGuildState
	ValidatedInput SetCharacterGuildSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SubmitForVerificationWrite struct {
	ActorID        string
	At             time.Time
	Input          SubmitForVerificationSpec
	Locked         SubmitForVerificationState
	ValidatedInput SubmitForVerificationSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
	// Nil when the submission sync failed. Stored with At so it is not older than verification_submitted_at.
	DdbPayload json.RawMessage
}

type SyncCharacterDdbWrite struct {
	ActorID        string
	At             time.Time
	Input          SyncCharacterDdbSpec
	Locked         SyncCharacterDdbState
	ValidatedInput SyncCharacterDdbSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateBackstoryWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateBackstorySpec
	Locked         UpdateBackstoryState
	ValidatedInput UpdateBackstorySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateCharacterProfileWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateCharacterProfileSpec
	Locked         UpdateCharacterProfileState
	ValidatedInput UpdateCharacterProfileSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpsertCreationCatalogEntryWrite struct {
	ActorID        string
	At             time.Time
	Input          UpsertCreationCatalogEntrySpec
	Locked         UpsertCreationCatalogEntryState
	ValidatedInput UpsertCreationCatalogEntrySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpsertDowntimeProjectWrite struct {
	ActorID        string
	At             time.Time
	Input          UpsertDowntimeProjectSpec
	Locked         UpsertDowntimeProjectState
	ValidatedInput UpsertDowntimeProjectSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type LiveParticipationBinding struct {
	QuestID     string
	CharacterID string
	MemberID    string
	Status      string
	ScheduledAt time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type RewardClaimBinding struct {
	EntitlementID      string
	ProgressionEntryID string
}

type FactualRewardTotals struct {
	QuestID string
	PCXP    int32
}

type Admission struct {
	ID          string
	OwnerID     string
	Status      string
	Trusted     bool
	OwnerStatus string
	UpdatedAt   time.Time
}

type ParticipationView struct {
	QuestID           string
	MemberID          string
	CharacterID       string
	Status            string
	Manual            bool
	CreatedAt         time.Time
	UpdatedAt         time.Time
	CharacterName     string
	MemberHandle      string
	MemberDisplayName string
	MemberAvatarURL   *string
}

type ParticipationPageView struct {
	Items []ParticipationView
	Total int32
}
