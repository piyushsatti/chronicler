package jobs

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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

// Store is the job table used by the worker.
type Store interface {
	Enqueue(ctx context.Context, job Job) error
	EnqueueScheduled(ctx context.Context, job Job) (bool, error)
	ClaimOne(ctx context.Context, lane string) (Job, error)
	Renew(ctx context.Context, receipt Receipt) (Lease, error)
	Succeed(ctx context.Context, receipt Receipt) error
	// SucceedWith is Succeed with the completion payload the worker stored.
	SucceedWith(ctx context.Context, receipt Receipt, payload []byte) error
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

// QuestPlayerListPayload is one publish of the seated roster. Fingerprint is
// the sorted Discord ids joined with commas. DiscordIDs are the mentions.
// A succeeded job for the same fingerprint is not queued again.
type QuestPlayerListPayload struct {
	PublicID    string   `json:"public_id"`
	Fingerprint string   `json:"fingerprint"`
	DiscordIDs  []string `json:"discord_ids"`
}

func QuestPlayerListKey(publicID, fingerprint string) string {
	return "quest-player-list:" + publicID + ":" + fingerprint
}

const (
	MaxAttempts        = 8
	DiscordMaxAttempts = 20
	LaneDiscord        = "discord"
)

func (j Job) MaxAttempts() int {
	if j.Lane == LaneDiscord {
		return DiscordMaxAttempts
	}
	return MaxAttempts
}

func Backoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	d := time.Duration(1<<uint(min(attempt-1, 9))) * time.Second
	if d > 5*time.Minute {
		return 5 * time.Minute
	}
	return d
}

type ExecutionScope struct {
	Receipt    Receipt
	Connection *pgxpool.Conn
}
