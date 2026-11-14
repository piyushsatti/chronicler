package ingest

import (
	"context"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type Event struct {
	EventID       string    `json:"event_id"`
	Kind          string    `json:"kind"`
	DiscordUserID string    `json:"discord_user_id"`
	ChannelID     string    `json:"channel_id"`
	OccurredAt    time.Time `json:"occurred_at"`
	Amount        float64   `json:"amount"`
}

type Store interface {
	SaveEvent(ctx context.Context, e Event) error
	SaveHeartbeat(ctx context.Context, payload json.RawMessage) error
}

type Handler struct {
	secret string
	store  Store
	now    func() time.Time
}

func New(secret string, store Store) *Handler {
	return &Handler{secret: secret, store: store, now: time.Now}
}

func (h *Handler) Routes(mux httpserver.Router) {
	mux.HandleFunc("POST /v1/ingest/discord-event", h.event)
	mux.HandleFunc("POST /v1/ingest/heartbeat", h.heartbeat)
}

func (h *Handler) authorize(r *http.Request) error {
	return httpserver.AuthorizeIngestSecret(r, h.secret)
}

func (h *Handler) event(w http.ResponseWriter, r *http.Request) {
	if err := h.authorize(r); err != nil {
		apierr.Write(w, r, err)
		return
	}
	var e Event
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "invalid JSON body"))
		return
	}
	switch e.Kind {
	case "message", "voice", "reaction":
	default:
		apierr.Write(w, r, apierr.New(apierr.Invalid, "kind must be message, voice, or reaction"))
		return
	}
	if e.EventID == "" || e.DiscordUserID == "" || e.ChannelID == "" {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "event_id, discord_user_id, and channel_id required"))
		return
	}
	if err := h.validateEvent(e); err != nil {
		apierr.Write(w, r, err)
		return
	}
	if err := h.store.SaveEvent(r.Context(), e); err != nil {
		apierr.Write(w, r, err)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{}`))
}

func (h *Handler) validateEvent(e Event) error {
	now := h.now()
	if e.OccurredAt.IsZero() {
		return apierr.New(apierr.Invalid, "occurred_at required")
	}
	if e.OccurredAt.Before(now.Add(-24 * time.Hour)) {
		return apierr.New(apierr.Invalid, "occurred_at too old")
	}
	if e.OccurredAt.After(now.Add(5 * time.Minute)) {
		return apierr.New(apierr.Invalid, "occurred_at too far in the future")
	}
	if e.Amount != math.Trunc(e.Amount) {
		return apierr.New(apierr.Invalid, "amount must be a whole number")
	}
	switch e.Kind {
	case "voice":
		if e.Amount < 1 || e.Amount > 1440 {
			return apierr.New(apierr.Invalid, "amount must be between 1 and 1440 for voice")
		}
	case "message", "reaction":
		if e.Amount != 1 {
			return apierr.New(apierr.Invalid, "amount must be 1 for "+e.Kind)
		}
	}
	return nil
}

func (h *Handler) heartbeat(w http.ResponseWriter, r *http.Request) {
	if err := h.authorize(r); err != nil {
		apierr.Write(w, r, err)
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "could not read body"))
		return
	}
	if !json.Valid(raw) {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "body must be JSON"))
		return
	}
	if err := validateHeartbeat(raw); err != nil {
		apierr.Write(w, r, err)
		return
	}
	if err := h.store.SaveHeartbeat(r.Context(), raw); err != nil {
		apierr.Write(w, r, err)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{}`))
}

func validateHeartbeat(raw json.RawMessage) error {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return apierr.New(apierr.Invalid, "heartbeat must be an object")
	}
	required := []string{"gateway_ready", "shard_state", "host", "build_sha"}
	if len(obj) != len(required) {
		return apierr.New(apierr.Invalid, "heartbeat fields required")
	}
	for _, key := range required {
		if _, ok := obj[key]; !ok {
			return apierr.New(apierr.Invalid, key+" required")
		}
	}

	var ready *bool
	if err := json.Unmarshal(obj["gateway_ready"], &ready); err != nil || ready == nil {
		return apierr.New(apierr.Invalid, "gateway_ready must be a boolean")
	}
	var shardState map[string]string
	if err := json.Unmarshal(obj["shard_state"], &shardState); err != nil || shardState == nil {
		return apierr.New(apierr.Invalid, "shard_state must be an object of strings")
	}
	var host *string
	if err := json.Unmarshal(obj["host"], &host); err != nil || host == nil {
		return apierr.New(apierr.Invalid, "host must be a string")
	}
	var buildSHA *string
	if err := json.Unmarshal(obj["build_sha"], &buildSHA); err != nil || buildSHA == nil {
		return apierr.New(apierr.Invalid, "build_sha must be a string")
	}
	return nil
}

// MemoryStore keeps events in process for P4 until postgres adapters land.
type MemoryStore struct {
	Events     []Event
	Heartbeats []json.RawMessage
}

func (m *MemoryStore) SaveEvent(_ context.Context, e Event) error {
	m.Events = append(m.Events, e)
	return nil
}

func (m *MemoryStore) SaveHeartbeat(_ context.Context, payload json.RawMessage) error {
	m.Heartbeats = append(m.Heartbeats, payload)
	return nil
}
