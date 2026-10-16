package observations

import (
	"context"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// ScheduledStatus projects execution facts. A slot with no admitted job has
// outcome NEVER_RAN and nil execution times, job ID and error code.
type ScheduledStatus struct {
	Kind           string
	ExpectedSlot   time.Time
	Outcome        string
	LastStartedAt  *time.Time
	LastFinishedAt *time.Time
	JobID          *string
	SafeErrorCode  *string
}

// AlertTransition describes an OPEN or RESOLVED condition. Version advances
// only when the condition changes; it is not a job attempt or delivery receipt.
type AlertTransition struct {
	Key         string
	Kind        string
	State       string
	SafeSummary string
	Version     int64
	ObservedAt  time.Time
}

type ScheduleSpec struct {
	Kind            string
	HourUTC         int32
	MinuteUTC       int32
	DeadlineMinutes int32
}

type ScheduleRegistry struct {
	Entries []ScheduleSpec
}

type AlertMessage struct {
	Transition AlertTransition
	JobID      *string
	Slot       *time.Time
}

// WorkerHeartbeatStatus reports the database check time and the latest valid
// sample among its four current minute keys. A missing sample remains nil.
type WorkerHeartbeatStatus struct {
	CheckedAt      time.Time
	LastObservedAt *time.Time
}

// WorkerHeartbeatWriter admits an immutable pool-bound sample. False means a
// matching durable sample already exists; it does not refresh that sample.
type WorkerHeartbeatWriter interface {
	RecordWorkerHeartbeat(ctx context.Context) (bool, error)
}

// ObservationStore writes through the supplied executor and owns short read
// tasks for projections. Repositories never commit or create another work lifecycle.
type ObservationStore interface {
	RecordLifecycle(ctx context.Context, db jobs.SQLExecutor, fact jobs.LifecycleFact) error
	ListScheduled(ctx context.Context, actor auth.Authority, page product.Page) ([]ScheduledStatus, error)
	EvaluateOverdue(ctx context.Context, now time.Time, registry []ScheduleSpec) ([]AlertTransition, error)
	PersistTransition(ctx context.Context, db jobs.SQLExecutor, transition AlertTransition) error
	CurrentTransition(ctx context.Context, db jobs.SQLExecutor, key string) (*AlertTransition, error)
	ReadWorkerHeartbeat(ctx context.Context) (WorkerHeartbeatStatus, error)
	ReadCurrentConditionVersions(ctx context.Context, keys []string) (map[string]int64, error)
}

// TransitionWriter atomically persists condition changes and their logical
// operator-alert jobs in one unit of work.
type TransitionWriter interface {
	ApplyTransitions(ctx context.Context, transitions []AlertTransition) error
}

// WebhookSender sends outside database transactions. Success means provider
// acceptance; Jobs retains ownership of the delivery's fenced receipt.
type WebhookSender interface {
	Send(ctx context.Context, message AlertMessage) error
	Configured() bool
}

// DBOutageMonitor suppresses one DB_UNAVAILABLE condition in memory. It has no
// durable receipt or offline backlog; a restart may permit another send.
type DBOutageMonitor interface {
	ShouldSend(now time.Time) bool
	MarkAccepted(now time.Time)
	Reset()
}
