package notification

import "time"

type NotificationConnection struct {
	HasMore    bool
	Items      []NotificationView
	NextBefore *string
}

type NotificationView struct {
	CreatedAt   time.Time
	Id          string
	Kind        string
	Label       string
	ReadAt      *time.Time
	SubjectCode *string
	SubjectId   string
	SubjectType string
	Summary     *string
	Title       *string
}

type NotificationWriteReceipt struct {
	AffectedCount int32
	Replayed      bool
}

type AcknowledgeSuppressedNotificationsSpec struct {
	Limit int32
}

type MarkNotificationsReadSpec struct {
	Ids []string
}

type MyNotificationsSpec struct {
	Limit                int32
	UnreadOnly           bool
	Before               *string
	BeforeCreatedAt      *time.Time
	BeforeNotificationID *string
}

type MyUnreadNotificationCountSpec struct {
}

type AcknowledgeSuppressedNotificationsState struct {
	ActorID    string
	Candidates []NotificationCandidate
}

type AcknowledgeSuppressedNotificationsWrite struct {
	ActorID     string
	At          time.Time
	Locked      AcknowledgeSuppressedNotificationsState
	SelectedIDs []string
}

type MarkNotificationsReadWrite struct {
	ActorID string
	At      time.Time
	Input   MarkNotificationsReadSpec
}

type SubjectKey struct {
	NotificationID string
	EventID        string
	SubjectType    string
	SubjectID      string
}

type SubjectProjection struct {
	SubjectType string
	SubjectID   string
	Visible     bool
	Malformed   bool
	Title       *string
	Summary     *string
	Code        *string
	Label       string
	Facts       Facts
}

type Facts struct {
	RecipientMemberIDs  []string   `json:"recipientMemberIds,omitempty"`
	Version             int32      `json:"version"`
	EventKind           EventKind  `json:"eventKind"`
	VerificationID      *string    `json:"verificationId,omitempty"`
	Verdict             *string    `json:"verdict,omitempty"`
	QuestChangeID       *string    `json:"questChangeId,omitempty"`
	OldScheduledAt      *time.Time `json:"oldScheduledAt,omitempty"`
	NewScheduledAt      *time.Time `json:"newScheduledAt,omitempty"`
	RevisionID          *string    `json:"revisionId,omitempty"`
	CharacterID         *string    `json:"characterId,omitempty"`
	FromStatus          *string    `json:"fromStatus,omitempty"`
	ToStatus            *string    `json:"toStatus,omitempty"`
	DecisionID          *string    `json:"decisionId,omitempty"`
	NewMentionMemberIDs []string   `json:"newMentionMemberIds,omitempty"`
	RequestID           *string    `json:"requestId,omitempty"`
	ChangedFields       []string   `json:"changedFields,omitempty"`
	Decision            *string    `json:"decision,omitempty"`
}

type EventKind string

const (
	CharacterVerificationDecided EventKind = "CHARACTER_VERIFICATION_DECIDED"
	QuestSignupConfirmed         EventKind = "QUEST_SIGNUP_CONFIRMED"
	QuestWaitlistPromoted        EventKind = "QUEST_WAITLIST_PROMOTED"
	DocumentEdited               EventKind = "DOCUMENT_EDITED"
	DocumentPublished            EventKind = "DOCUMENT_PUBLISHED"
	DMMentioned                  EventKind = "DM_MENTIONED"
	QuestScheduled               EventKind = "QUEST_SCHEDULED"
	DMRequestDecided             EventKind = "DM_REQUEST_DECIDED"
)

type NotificationCandidate struct {
	NotificationID  string
	CreatedAt       time.Time
	ReadAt          *time.Time
	EventID         string
	EventKey        string
	Kind            EventKind
	Subject         SubjectKey
	Facts           Facts
	EventActorID    string
	EventOccurredAt time.Time
}

type RequestParties struct {
	RequesterID string
	TargetDMID  string
}

type Event struct {
	Key         string    `json:"key"`
	Kind        EventKind `json:"kind"`
	SubjectType string    `json:"subjectType"`
	SubjectID   string    `json:"subjectId"`
	ActorID     string    `json:"actorId"`
	Facts       Facts     `json:"facts"`
	OccurredAt  time.Time `json:"occurredAt"`
}

type Preferences struct {
	MemberID              string
	CharacterVerification bool
	QuestSignup           bool
	DocumentActivity      bool
	QuestScheduled        bool
	DMMentioned           bool
	DMRequestDecided      bool
}
