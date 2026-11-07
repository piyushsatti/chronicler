package quest

import (
	"encoding/json"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

type CloseQuestFields struct {
	Attendance []ParticipationAttestationFields
	Rewards    []QuestPcxpAwardFields
}

type CreateQuestFields struct {
	AdditionalInfo *string
	Apl            *int32
	ArcId          *string
	BriefBody      string
	DmId           *string
	DurationHours  float64
	Genres         []string
	Kinds          []string
	RegionIds      []string
	ScheduledAt    time.Time
	SignupType     *string
	SlotsMax       int32
	Tags           []string
	Title          string
	VoiceChannelId *string
}

type DeliveryReceipt struct {
	AppliedRevision int32
	DeliveryStatus  string
	DesiredRevision int32
	JobId           string
}

type DmLastSessionView struct {
	Quest         QuestView
	RecapDocument *document.DocumentView
}

type DmSessionHistoryResult struct {
	Items []DmLastSessionView
	Total int32
}

type DmStatsView struct {
	LastSession  *DmLastSessionView
	SessionCount int32
}

type DmSummaryFiltersFields struct {
	QuestId *string
	Search  *string
}

type OpenQuestSeatView struct {
	DmId        string
	FilledCount int32
	OpenSeats   int32
	QuestId     string
	RegionIds   []string
	ScheduledAt time.Time
	ShortCode   string
	SlotsMax    int32
	Status      string
}

type OpenQuestSeatsResult struct {
	Entries []OpenQuestSeatView
	Total   int32
}

type ParticipationAttestationFields struct {
	CharacterId string
	Status      string
}

type ParticipationPage struct {
	Items []QuestParticipantView
	Total int32
}

type QuestArcListResult struct {
	Items []QuestArcView
	Total int32
}

type QuestArcView struct {
	CreatedAt  time.Time
	CreatedBy  string
	Id         string
	Name       string
	QuestCount int32
}

type QuestDiscordDeliveryView struct {
	AppliedRevision int32
	DesiredRevision int32
	ErrorCode       *string
	ErrorMessage    *string
	EventState      *string
	JobId           *string
	MessageState    *string
	NextRetryAt     *time.Time
	OverallStatus   string
	ThreadState     *string
}

type QuestDmView struct {
	AvatarUrl   *string
	DisplayName string
	Handle      string
}

type QuestEditFields struct {
	AdditionalInfo    product.Optional[string]
	Apl               product.Optional[int32]
	ArcId             product.Optional[string]
	BriefBody         product.Optional[string]
	DmId              product.Optional[string]
	DurationHours     product.Optional[float64]
	ExpectedUpdatedAt time.Time
	Genres            product.Optional[[]string]
	Kinds             product.Optional[[]string]
	RegionIds         product.Optional[[]string]
	ScheduledAt       product.Optional[time.Time]
	SignupType        product.Optional[string]
	SlotsMax          product.Optional[int32]
	Tags              product.Optional[[]string]
	Title             product.Optional[string]
	VoiceChannelId    product.Optional[string]
}

type QuestHexFields struct {
	HexId string
	Role  string
}

type QuestHexView struct {
	HexId   string
	QuestId string
	Role    string
	Name    string
}

type QuestParticipantView struct {
	CharacterId       string
	CharacterName     string
	CreatedAt         time.Time
	LastPlayedAt      *time.Time
	Manual            bool
	MemberAvatarUrl   *string
	MemberDisplayName string
	MemberHandle      string
	MemberId          string
	QuestId           string
	Status            string
	UpdatedAt         time.Time
}

type QuestPcxpAwardFields struct {
	CharacterId string
	Note        *string
	Pcxp        int32
}

type QuestStateCountView struct {
	Count int32
	State string
}

type QuestStateCountsFiltersFields struct {
	ArcId    *string
	DmId     *string
	Kind     *string
	RegionId *string
	Tag      *string
}

type QuestSummariesResult struct {
	Summaries []document.DocumentView
	Totals    QuestSummaryTotalsView
}

type NormalizedVocabulary struct {
	Tags   []string
	Genres []string
}

type RewardDecisionCoverage struct {
	QuestID                string
	Closed                 bool
	HasFullClosureDecision bool
}

type TagKind string

const (
	TagKindTags   TagKind = "tags"
	TagKindGenres TagKind = "genres"
)

type QuestSummaryFields struct {
	Body             string
	CharacterId      *string
	DocumentId       *string
	ExpectedRevision *int32
	Frontmatter      json.RawMessage
	QuestIds         []string
	Title            string
	Visibility       string
}

type QuestSummaryTotalsView struct {
	Coverage         RewardCoverage
	TotalPcxpAwarded *int32
}

type QuestFiltersFields struct {
	ArcId         *string
	DisplayStatus *string
	DmId          *string
	Genre         *string
	Kind          *string
	RegionId      *string
	ScheduledFrom *time.Time
	ScheduledTo   *time.Time
	Search        *string
	ShortCodes    []string
	Status        *string
	Tag           *string
}

type QuestListResult struct {
	Items []QuestView
	Total int32
}

type QuestView struct {
	AnnounceError    *string
	Apl              *int32
	ArcId            *string
	CreatedAt        time.Time
	CreatedBy        string
	DiscordEventId   *string
	DiscordMessageId *string
	DisplayStatus    *string
	DmId             string
	DocumentId       *string
	DurationHours    float64
	EventUrl         *string
	FilledCount      int32
	Genres           []string
	Id               string
	Kinds            []string
	Regions          []string
	ScheduledAt      time.Time
	ShortCode        string
	SignupType       *string
	SlotsMax         int32
	Status           string
	Tags             []string
	UpdatedAt        time.Time
	VoiceChannelId   *string
}

type RewardCoverage string

const (
	RewardCoverageComplete      RewardCoverage = "COMPLETE"
	RewardCoverageLegacyUnknown RewardCoverage = "LEGACY_UNKNOWN"
)

type AttestQuestParticipationSpec struct {
	QuestId string
	Entries []ParticipationAttestationFields
	AsOf    time.Time
}

type CloseQuestSpec struct {
	Id    string
	Input CloseQuestFields
	AsOf  time.Time
}

type CreateQuestSpec struct {
	Input CreateQuestFields
	AsOf  time.Time
}

type DeleteQuestSpec struct {
	QuestId string
	AsOf    time.Time
}

type RemoveQuestFromArcSpec struct {
	QuestId string
	AsOf    time.Time
}

type RestoreQuestSpec struct {
	QuestId string
	AsOf    time.Time
}

type SelectQuestParticipantsSpec struct {
	QuestId      string
	CharacterIds []string
	AsOf         time.Time
}

type SetQuestHexesSpec struct {
	QuestId string
	Hexes   []QuestHexFields
	AsOf    time.Time
}

type SignupForQuestSpec struct {
	QuestId     string
	CharacterId string
	AsOf        time.Time
}

type SyncQuestDiscordSpec struct {
	QuestId string
	AsOf    time.Time
}

type TransitionQuestStatusSpec struct {
	Id   string
	To   string
	AsOf time.Time
}

type UpdateQuestSpec struct {
	Id    string
	Input QuestEditFields
	AsOf  time.Time
}

type UpsertQuestArcSpec struct {
	Id   *string
	Name string
	AsOf time.Time
}

type UpsertQuestSummarySpec struct {
	Input QuestSummaryFields
	AsOf  time.Time
}

type WithdrawFromQuestSpec struct {
	QuestId     string
	CharacterId string
	AsOf        time.Time
}

type CorrectQuestRosterSpec struct {
	QuestId     string
	CharacterId string
	Action      string
	AsOf        time.Time
}

type DmSessionHistorySpec struct {
	MemberId string
	Limit    int32
	Offset   int32
	AsOf     time.Time
}

type DmStatsSpec struct {
	MemberId string
	AsOf     time.Time
}

type DmSummariesSpec struct {
	Filters *DmSummaryFiltersFields
	Limit   int32
	Offset  int32
	AsOf    time.Time
}

type MyQuestSignupsSpec struct {
	Limit  int32
	Offset int32
	AsOf   time.Time
}

type OpenQuestSeatsSpec struct {
	RegionId *string
	DmId     *string
	Limit    int32
	Offset   int32
	AsOf     time.Time
}

type QuestSpec struct {
	Id        *string
	ShortCode *string
	AsOf      time.Time
}

type QuestArcSpec struct {
	Id   string
	AsOf time.Time
}

type QuestArcsSpec struct {
	Limit  int32
	Offset int32
	AsOf   time.Time
}

type QuestBoardSpec struct {
	RegionId *string
	Limit    int32
	Offset   int32
	AsOf     time.Time
}

type QuestGenreOptionsSpec struct {
	AsOf time.Time
}

type QuestStateCountsSpec struct {
	Filters        *QuestStateCountsFiltersFields
	TagFilterSet   bool
	TagVariants    []string
	GenreFilterSet bool
	GenreVariants  []string
	AsOf           time.Time
}

type QuestSummariesSpec struct {
	QuestId string
	Limit   int32
	Offset  int32
	AsOf    time.Time
}

type QuestsSpec struct {
	Filters        *QuestFiltersFields
	Limit          int32
	Offset         int32
	TagFilterSet   bool
	TagVariants    []string
	GenreFilterSet bool
	GenreVariants  []string
	AsOf           time.Time
}

type RecentlyClosedQuestsSpec struct {
	RegionId    *string
	ClosedSince *time.Time
	Limit       int32
	Offset      int32
	AsOf        time.Time
}

type AttestQuestParticipationState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type CloseQuestState struct {
	Exists               bool
	SubjectID            string
	OwnerID              string
	Version              int64
	UpdatedAt            *time.Time
	Before               *QuestView
	Character            *character.Admission
	Roster               []QuestParticipantView
	BriefVersion         int64
	AllowedHexes         []spatial.PointcrawlAdmission
	ExistingEntitlements []character.QuestRewardEntitlementView
}

type CreateQuestState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type DeleteQuestState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type WithdrawFromQuestState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type RemoveQuestFromArcState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type RestoreQuestState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type SelectQuestParticipantsState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
	Candidates   []character.Admission
}

type SetQuestHexesState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type SignupForQuestState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type SyncQuestDiscordState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type TransitionQuestStatusState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type UpdateQuestState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type UpsertQuestArcState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestArcView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type UpsertQuestSummaryState struct {
	Exists       bool
	SubjectID    string
	OwnerID      string
	Version      int64
	UpdatedAt    *time.Time
	Before       *QuestView
	Character    *character.Admission
	Roster       []QuestParticipantView
	BriefVersion int64
	AllowedHexes []spatial.PointcrawlAdmission
}

type AttestQuestParticipationWrite struct {
	ActorID        string
	At             time.Time
	Input          AttestQuestParticipationSpec
	Locked         AttestQuestParticipationState
	ValidatedInput AttestQuestParticipationSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type CloseQuestWrite struct {
	ActorID          string
	At               time.Time
	Input            CloseQuestSpec
	Locked           CloseQuestState
	ValidatedInput   CloseQuestSpec
	HistoryID        *string
	DecisionID       *string
	RevisionID       *string
	EventKey         *string
	EntitlementIDs   []string
	RewardDecisionID string
}

type CreateQuestWrite struct {
	ActorID        string
	At             time.Time
	Input          CreateQuestSpec
	Locked         CreateQuestState
	ValidatedInput CreateQuestSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type DeleteQuestWrite struct {
	ActorID        string
	At             time.Time
	Input          DeleteQuestSpec
	Locked         DeleteQuestState
	ValidatedInput DeleteQuestSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type RemoveQuestFromArcWrite struct {
	ActorID        string
	At             time.Time
	Input          RemoveQuestFromArcSpec
	Locked         RemoveQuestFromArcState
	ValidatedInput RemoveQuestFromArcSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type RestoreQuestWrite struct {
	ActorID        string
	At             time.Time
	Input          RestoreQuestSpec
	Locked         RestoreQuestState
	ValidatedInput RestoreQuestSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SelectQuestParticipantsWrite struct {
	ActorID        string
	At             time.Time
	Input          SelectQuestParticipantsSpec
	Locked         SelectQuestParticipantsState
	ValidatedInput SelectQuestParticipantsSpec
	DMPicked       bool
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SetQuestHexesWrite struct {
	ActorID        string
	At             time.Time
	Input          SetQuestHexesSpec
	Locked         SetQuestHexesState
	ValidatedInput SetQuestHexesSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SignupForQuestWrite struct {
	ActorID        string
	At             time.Time
	Input          SignupForQuestSpec
	Locked         SignupForQuestState
	ValidatedInput SignupForQuestSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type SyncQuestDiscordWrite struct {
	ActorID        string
	At             time.Time
	Input          SyncQuestDiscordSpec
	Locked         SyncQuestDiscordState
	ValidatedInput SyncQuestDiscordSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type TransitionQuestStatusWrite struct {
	ActorID        string
	At             time.Time
	Input          TransitionQuestStatusSpec
	Locked         TransitionQuestStatusState
	ValidatedInput TransitionQuestStatusSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpdateQuestWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateQuestSpec
	Locked         UpdateQuestState
	ValidatedInput UpdateQuestSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpsertQuestArcWrite struct {
	ActorID        string
	At             time.Time
	Input          UpsertQuestArcSpec
	Locked         UpsertQuestArcState
	ValidatedInput UpsertQuestArcSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type UpsertQuestSummaryWrite struct {
	ActorID        string
	At             time.Time
	Input          UpsertQuestSummarySpec
	Locked         UpsertQuestSummaryState
	ValidatedInput UpsertQuestSummarySpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type WithdrawFromQuestWrite struct {
	ActorID        string
	At             time.Time
	Input          WithdrawFromQuestSpec
	Locked         WithdrawFromQuestState
	ValidatedInput WithdrawFromQuestSpec
	HistoryID      *string
	DecisionID     *string
	RevisionID     *string
	EventKey       *string
}

type CorrectQuestRosterWrite struct {
	At             time.Time
	ValidatedInput CorrectQuestRosterSpec
	Quest          *QuestView
	Roster         []QuestParticipantView
	Candidates     []character.Admission
}

type ArcQuestsKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type HexList struct {
	Items []QuestHexView
}

type IDKey struct {
	ID string
}

type ParticipantList struct {
	Items []QuestParticipantView
}

type ParticipantsKey struct {
	ParentID  string
	Limit     int32
	Offset    int32
	Status    string
	HasStatus bool
}

type QuestHexesKey struct {
	ParentID string
	Limit    int32
	Offset   int32
	Role     string
	HasRole  bool
}

type QuestList struct {
	Items []QuestView
}

type RewardEntitlementsKey struct {
	ParentID string
	Limit    int32
	Offset   int32
}

type RewardList struct {
	Items []character.QuestRewardEntitlementView
}
