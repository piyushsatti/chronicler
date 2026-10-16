package jobs

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SQLExecutor allows schema checks and observations to use the owning transaction.
type SQLExecutor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type CompatibilityGate interface {
	Check(ctx context.Context, db SQLExecutor) error
}

type LifecycleObserver interface {
	Record(ctx context.Context, db SQLExecutor, fact LifecycleFact) error
}

type StoreOptions struct {
	Gate     CompatibilityGate
	Observer LifecycleObserver
}

type LifecycleEventKind string

const (
	LifecycleEventEnqueued       LifecycleEventKind = "ENQUEUED"
	LifecycleEventClaimed        LifecycleEventKind = "CLAIMED"
	LifecycleEventRetryScheduled LifecycleEventKind = "RETRY_SCHEDULED"
	LifecycleEventSucceeded      LifecycleEventKind = "SUCCEEDED"
	LifecycleEventFailed         LifecycleEventKind = "FAILED"
	LifecycleEventCancelled      LifecycleEventKind = "CANCELLED"
	LifecycleEventEffectAdmitted LifecycleEventKind = "EFFECT_ADMITTED"
)

// LifecycleFact describes an admitted transition. JobID is the public job UUID,
// while Receipt.ID is the internal row identifier. Slot is schedule metadata;
// execution timestamps come from the post-lock database clock.
type LifecycleFact struct {
	JobID         string
	JobKey        string
	Kind          string
	BuildID       string
	State         State
	Slot          *time.Time
	StartedAt     *time.Time
	FinishedAt    *time.Time
	LeaseToken    int64
	Attempt       int32
	SafeErrorCode *string
	EventKind     LifecycleEventKind
	EffectCount   int32
}

type ExecutionScope struct {
	Receipt    Receipt
	Connection *pgxpool.Conn
}
