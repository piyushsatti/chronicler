package delivery

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func discordRetryDelay(job jobs.Job, err error) time.Duration {
	var apiErr *DiscordAPIError
	if errors.As(err, &apiErr) && apiErr.RetryAfter > 0 {
		return apiErr.RetryAfter
	}
	return jobs.Backoff(job.Attempts)
}

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

const LaneDiscord = jobs.LaneDiscord
const KindQuestDiscord = "quest_discord_delivery"
const KindQuestPlayerList = "quest_player_list"

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
	if job.Kind == KindQuestPlayerList {
		return h.processPlayerList(ctx, job)
	}
	questID, desired, err := parseQuestPayload(job.Payload)
	if err != nil {
		return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, err.Error())
	}
	if err := jobs.RunLeased(ctx, h.store, job, func(work context.Context) error { return h.sync.SyncQuest(work, questID, desired) }); err != nil {
		// A Discord 403 is a missing bot permission; no retry can fix it.
		// Park it until an admin repairs the permission and redrives.
		if errors.Is(err, ErrDiscordForbidden) {
			return true, h.store.FailWithCode(ctx, job.Receipt(), jobs.RepairRequired, err.Error(), SafeCodeDiscordPermission)
		}
		if errors.Is(err, ErrDiscordEventState) {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.RepairRequired, err.Error())
		}
		if job.Attempts >= job.MaxAttempts() {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, err.Error())
		}
		return true, h.store.Retry(ctx, job.Receipt(), discordRetryDelay(job, err), err.Error())
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

type playerListPublisher interface {
	PublishPlayerList(ctx context.Context, jobKey string, body jobs.QuestPlayerListPayload) (string, error)
}

func (h *Handler) processPlayerList(ctx context.Context, job jobs.Job) (bool, error) {
	body, err := parsePlayerListPayload(job.Payload)
	if err != nil {
		return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, err.Error())
	}
	publisher, ok := h.sync.(playerListPublisher)
	if !ok {
		return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, "player list publisher missing")
	}
	var messageID string
	if err := jobs.RunLeased(ctx, h.store, job, func(work context.Context) error {
		id, err := publisher.PublishPlayerList(work, job.Key, body)
		messageID = id
		return err
	}); err != nil {
		if errors.Is(err, ErrDiscordForbidden) {
			return true, h.store.FailWithCode(ctx, job.Receipt(), jobs.RepairRequired, err.Error(), SafeCodeDiscordPermission)
		}
		if errors.Is(err, ErrPlayerListTooLong) || errors.Is(err, ErrBadPayload) {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, err.Error())
		}
		if job.Attempts >= job.MaxAttempts() {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, err.Error())
		}
		return true, h.store.Retry(ctx, job.Receipt(), discordRetryDelay(job, err), err.Error())
	}
	payload := []byte(`{}`)
	if messageID != "" {
		encoded, marshalErr := json.Marshal(map[string]string{"message_id": messageID})
		if marshalErr != nil {
			return true, marshalErr
		}
		payload = encoded
	}
	if err := h.store.SucceedWith(ctx, job.Receipt(), payload); err != nil {
		return true, err
	}
	slog.InfoContext(ctx, "player list delivery succeeded", "job", job.ID, "quest", body.PublicID)
	return true, nil
}

// NoopSync is the P5 stand-in until Discord REST calls are wired.
type NoopSync struct{}

func (NoopSync) SyncQuest(context.Context, string, int) error { return nil }

// MemoryStore is a local substitute using the same lease specification.
type MemoryStore = jobs.MemoryStore
