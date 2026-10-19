package delivery

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func parseQuestPayload(payload []byte) (string, int, error) {
	if len(payload) == 0 {
		return "", 0, fmt.Errorf("%w: empty body", ErrBadPayload)
	}
	var body jobs.QuestDiscordPayload
	if err := json.Unmarshal(payload, &body); err != nil {
		return "", 0, fmt.Errorf("%w: %v", ErrBadPayload, err)
	}
	if body.PublicID == "" {
		return "", 0, fmt.Errorf("%w: missing public_id", ErrBadPayload)
	}
	if body.DesiredRevision < 1 {
		return "", 0, fmt.Errorf("%w: desired_revision must be >= 1", ErrBadPayload)
	}
	return body.PublicID, body.DesiredRevision, nil
}

const LaneDiscord = "discord"
const KindQuestDiscord = "quest_discord_delivery"

// DesiredStateWriter bumps discord_desired_revision and enqueues a coalesce job.
type DesiredStateWriter interface {
	RecordDesiredRevision(ctx context.Context, questID string) error
}

// DiscordSync applies the current desired Discord state for one quest.
type DiscordSync interface {
	SyncQuest(ctx context.Context, questID string, desiredRevision int) error
}

// Reconciler schedules a follow-up job when desired still leads applied.
type Reconciler interface {
	Reconcile(ctx context.Context, questPublicID string) error
}

// Handler processes claimed Discord delivery jobs.
type Handler struct {
	store     jobs.Store
	sync      DiscordSync
	reconcile Reconciler
}

func NewHandler(store jobs.Store, sync DiscordSync) *Handler {
	return &Handler{store: store, sync: sync}
}

func (h *Handler) WithReconciler(r Reconciler) *Handler {
	h.reconcile = r
	return h
}

func (h *Handler) ProcessOne(ctx context.Context) (bool, error) {
	job, err := h.store.ClaimOne(ctx, LaneDiscord)
	if err != nil {
		return false, err
	}
	if job.ID == "" {
		return false, nil
	}
	questID, desired, err := parseQuestPayload(job.Payload)
	if err != nil {
		return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, err.Error())
	}
	if err := jobs.RunLeased(ctx, h.store, job, func(work context.Context) error { return h.sync.SyncQuest(work, questID, desired) }); err != nil {
		if job.Attempts >= jobs.MaxAttempts {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, err.Error())
		}
		return true, h.store.Retry(ctx, job.Receipt(), jobs.Backoff(job.Attempts), err.Error())
	}
	if err := h.store.Succeed(ctx, job.Receipt()); err != nil {
		return true, err
	}
	if h.reconcile != nil {
		if err := h.reconcile.Reconcile(ctx, questID); err != nil {
			slog.ErrorContext(ctx, "discord reconcile failed", "job", job.ID, "quest", questID, "error", err)
		}
	}
	slog.InfoContext(ctx, "discord delivery succeeded", "job", job.ID, "quest", questID)
	return true, nil
}

// NoopSync is the P5 stand-in until Discord REST calls are wired.
type NoopSync struct{}

func (NoopSync) SyncQuest(context.Context, string, int) error { return nil }

// MemoryStore is a local substitute using the same lease specification.
type MemoryStore = jobs.MemoryStore
