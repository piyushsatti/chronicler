package quest

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

func Routes(mux httpserver.Router, c Commands) {
	mux.Handle("POST /v1/quests", auth.Require(auth.Authenticated, createHandler(c)))
	mux.Handle("POST /v1/quests/{id}/transition", auth.Require(auth.Authenticated, transitionHandler(c)))
	mux.Handle("POST /v1/quests/{id}/close", auth.Require(auth.Authenticated, closeHandler(c)))
	mux.Handle("POST /v1/quests/{id}/signup", auth.Require(auth.Authenticated, signupHandler(c)))
	mux.Handle("POST /v1/quests/{id}/discord/sync", auth.Require(auth.Authenticated, syncHandler(c)))
}

type signupRequest struct {
	CharacterID string `json:"characterId"`
}

type createRequest struct {
	ShortCode     string    `json:"shortCode"`
	Kinds         []string  `json:"kinds"`
	ScheduledAt   time.Time `json:"scheduledAt"`
	DocumentID    string    `json:"documentId"`
	SlotsMax      int       `json:"slotsMax"`
	DurationHours float64   `json:"durationHours"`
}

func createHandler(c Commands) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body createRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "body must be JSON"))
			return
		}
		q, err := c.Create(r.Context(), auth.FromContext(r.Context()), CreateSpec{
			ShortCode:     body.ShortCode,
			Kinds:         body.Kinds,
			ScheduledAt:   body.ScheduledAt,
			DocumentID:    body.DocumentID,
			SlotsMax:      body.SlotsMax,
			DurationHours: body.DurationHours,
		})
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(questResponse{ID: q.ID, Status: q.Status})
	})
}

func syncHandler(c Commands) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := c.SyncDiscord(r.Context(), auth.FromContext(r.Context()), r.PathValue("id")); err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func signupHandler(c Commands) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body signupRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CharacterID == "" {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "characterId required"))
			return
		}
		if err := c.SignUp(r.Context(), auth.FromContext(r.Context()), r.PathValue("id"), body.CharacterID); err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

type transitionRequest struct {
	To string `json:"to"`
}

type questResponse struct {
	ID     string `json:"id"`
	Status Status `json:"status"`
}

func closeHandler(c Commands) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q, err := c.Close(r.Context(), auth.FromContext(r.Context()), r.PathValue("id"))
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(questResponse{ID: q.ID, Status: q.Status})
	})
}

func transitionHandler(c Commands) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body transitionRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "body must be JSON with a \"to\" status"))
			return
		}
		to, ok := ParseStatus(body.To)
		if !ok {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "unknown status"))
			return
		}
		q, err := c.TransitionStatus(r.Context(), auth.FromContext(r.Context()), r.PathValue("id"), to)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(questResponse{ID: q.ID, Status: q.Status})
	})
}
