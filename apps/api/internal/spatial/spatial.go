package spatial

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

var ErrNotFound = apierr.New(apierr.NotFound, "spatial entity not found")

type TimeMap interface {
	GameDay(realDate time.Time) (int, error)
	RealDates(gameDay int) ([]time.Time, error)
}

func Routes(mux httpserver.Router, tm TimeMap) {
	mux.HandleFunc("GET /v1/time/game-date", func(w http.ResponseWriter, r *http.Request) {
		raw := r.URL.Query().Get("realDate")
		day, err := time.Parse("2006-01-02", raw)
		if err != nil {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "realDate must be YYYY-MM-DD"))
			return
		}
		gameDay, err := tm.GameDay(day)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]int{"gameDay": gameDay})
	})
	mux.HandleFunc("GET /v1/time/real-dates", func(w http.ResponseWriter, r *http.Request) {
		n, err := strconv.Atoi(r.URL.Query().Get("gameDay"))
		if err != nil {
			apierr.Write(w, r, apierr.New(apierr.Invalid, "gameDay must be an integer"))
			return
		}
		dates, err := tm.RealDates(n)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		out := make([]string, 0, len(dates))
		for _, d := range dates {
			out = append(out, d.Format("2006-01-02"))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"dates": out})
	})
}

// EmptyTimeMap returns not found for game-date and empty for real-dates.
type EmptyTimeMap struct{}

func (EmptyTimeMap) GameDay(time.Time) (int, error) {
	return 0, apierr.New(apierr.NotFound, "no game day for that date")
}

func (EmptyTimeMap) RealDates(int) ([]time.Time, error) { return nil, nil }
