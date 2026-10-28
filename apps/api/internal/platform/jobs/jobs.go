package jobs

import (
	"context"
	"time"
)

type State string

const (
	Queued         State = "queued"
	Running        State = "running"
	RetryWait      State = "retry_wait"
	Succeeded      State = "succeeded"
	Dead           State = "dead"
	RepairRequired State = "repair_required"
	Cancelled      State = "cancelled"
)

type Job struct {
	ID                  string
	Key                 string
	Kind                string
	Lane                string
	State               State
	Attempts            int
	Payload             []byte
	NextRunAt           time.Time
	PublicID            string
	Token               int64
	LeaseExpiresAt      time.Time
	ClaimedAt           time.Time
	AttemptDeadlineAt   time.Time
	QuestionDeadlineAt  time.Time
	CompletionOperation string
	CompletionPayload   []byte
	ErrorMessage        string
	// SafeErrorCode is a stable, display-safe failure code (no provider text).
	// Empty means none; only FailWithCode sets it.
	SafeErrorCode string
}

type Writer interface {
	EnqueueDesired(ctx context.Context, questID string, desiredRevision int32, at time.Time) (string, error)
}

// Store is the job table used by the worker.
type Store interface {
	Enqueue(ctx context.Context, job Job) error
	ClaimOne(ctx context.Context, lane string) (Job, error)
	Renew(ctx context.Context, receipt Receipt) (Lease, error)
	Succeed(ctx context.Context, receipt Receipt) error
	Retry(ctx context.Context, receipt Receipt, after time.Duration, reason string) error
	Fail(ctx context.Context, receipt Receipt, state State, reason string) error
	// FailWithCode is Fail that also records a safe error code for operators.
	FailWithCode(ctx context.Context, receipt Receipt, state State, reason, safeCode string) error
}

// QuestDiscordPayload is the discord-lane body. ID is the internal quest
// bigint. PublicID is the wire id used in the stable job key.
type QuestDiscordPayload struct {
	ID              int64  `json:"id"`
	PublicID        string `json:"public_id"`
	DesiredRevision int    `json:"desired_revision"`
}

func QuestDiscordKey(publicID string) string {
	return "quest-discord:" + publicID
}

const MaxAttempts = 8

func Backoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	d := time.Duration(1<<uint(min(attempt-1, 6))) * time.Second
	if d > 5*time.Minute {
		return 5 * time.Minute
	}
	return d
}
