package notification

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type NotificationReadRepository interface {
	ReadMyNotifications(ctx context.Context, actor auth.Authority, spec MyNotificationsSpec) (NotificationConnection, error)
	ReadMyUnreadNotificationCount(ctx context.Context, actor auth.Authority, spec MyUnreadNotificationCountSpec) (int32, error)
}

type NotificationWriteRepository interface {
	LockAcknowledgeSuppressedNotifications(ctx context.Context, actorID string, spec AcknowledgeSuppressedNotificationsSpec) (AcknowledgeSuppressedNotificationsState, error)
	StoreAcknowledgeSuppressedNotifications(ctx context.Context, write AcknowledgeSuppressedNotificationsWrite) (NotificationWriteReceipt, error)
	StoreMarkNotificationsRead(ctx context.Context, write MarkNotificationsReadWrite) (NotificationWriteReceipt, error)
}

type ProductBatchRepository interface {
	ReadBatchNotificationSubjects(ctx context.Context, actor auth.Authority, keys []SubjectKey) ([]product.BatchResult[SubjectProjection], error)
}

type DocumentAudienceReader interface {
	ReadableDocumentIDs(ctx context.Context, actor auth.Authority, documentIDs []string) (map[string]bool, error)
}

type ProductReadRepos struct {
	Notification     NotificationReadRepository
	Batch            ProductBatchRepository
	DocumentAudience DocumentAudienceReader
}

type ProductCommandRepos struct {
	Batch            ProductBatchRepository
	DocumentAudience DocumentAudienceReader
	Notification     NotificationWriteRepository
	Policy           *auth.Policy
	Authority        auth.AuthorityResolver
	Replay           idempotency.Repository
	Audit            auth.OverrideRecorder
}

type CharacterRecipientReader interface {
	CharacterOwner(context.Context, string) (string, error)
}
type DocumentRecipientReader interface {
	DocumentAuthor(context.Context, string) (string, error)
}
type QuestRecipientReader interface {
	QuestRecipientIDs(context.Context, string, string) ([]string, error)
}
type PreferenceReader interface {
	ReadPreferences(context.Context, []string) ([]Preferences, error)
}
type EventWriter interface {
	InsertInbox(context.Context, Event, []string) error
}
type EventProducer interface {
	Record(context.Context, ProducerRepos, Event) error
}
type RecipientComposition struct {
	Character CharacterRecipientReader
	Document  DocumentRecipientReader
	Quest     QuestRecipientReader
}
type ProducerRepos struct {
	Writer      EventWriter
	Recipients  RecipientComposition
	Preferences PreferenceReader
}
