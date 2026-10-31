package ingest

import (
	"context"
	"encoding/json"
	"io"
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
}

func New(secret string, store Store) *Handler {
	return &Handler{secret: secret, store: store}
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
	if err := h.store.SaveEvent(r.Context(), e); err != nil {
		apierr.Write(w, r, err)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{}`))
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
	if err := h.store.SaveHeartbeat(r.Context(), raw); err != nil {
		apierr.Write(w, r, err)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{}`))
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
