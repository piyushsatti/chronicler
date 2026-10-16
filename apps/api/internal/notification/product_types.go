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
	Version             int32
	EventKind           EventKind
	VerificationID      *string
	Verdict             *string
	QuestChangeID       *string
	OldScheduledAt      *time.Time
	NewScheduledAt      *time.Time
	RevisionID          *string
	CharacterID         *string
	FromStatus          *string
	ToStatus            *string
	DecisionID          *string
	NewMentionMemberIDs []string
	RequestID           *string
	ChangedFields       []string
	Decision            *string
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
	Key         string
	Kind        EventKind
	SubjectType string
	SubjectID   string
	ActorID     string
	Facts       Facts
	OccurredAt  time.Time
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
