package app_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

type retiredRouteRunner struct{ calls int }

func (r *retiredRouteRunner) Do(context.Context, func(quest.Repository) error) error {
	r.calls++
	return errors.New("retired route reached a write transaction")
}

func TestRetiredQuestCharacterAndMemberRoutesReturnNotFound(t *testing.T) {
	runner := &retiredRouteRunner{}
	mux := http.NewServeMux()
	app.MountFromAPI(mux, app.API{QuestCmd: quest.NewCommands(runner, time.Now)}, config.Config{})
	actor, err := auth.NewAuthority("member", []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, authenticated := range []bool{false, true} {
		for _, route := range []struct{ method, path, body string }{
			{"POST", "/v1/quests", `{"shortCode":"X","kinds":["standard"],"scheduledAt":"2026-12-01T00:00:00Z"}`},
			{"POST", "/v1/quests/quest/transition", `{"to":"played"}`},
			{"POST", "/v1/quests/quest/close", ""},
			{"POST", "/v1/quests/quest/signup", `{"characterId":"character"}`},
			{"POST", "/v1/quests/quest/discord/sync", ""},
			{"GET", "/v1/characters/character/progression", ""},
			{"GET", "/v1/characters/character/logs", ""},
			{"GET", "/v1/characters/character/verification-history", ""},
			{"GET", "/v1/members/by-discord/123", ""},
			{"GET", "/v1/members/member/role-history", ""},
			{"GET", "/v1/members/member/availability", ""},
		} {
			t.Run(fmt.Sprintf("%s %s authenticated=%t", route.method, route.path, authenticated), func(t *testing.T) {
				req := httptest.NewRequest(route.method, route.path, strings.NewReader(route.body))
				if authenticated {
					req = req.WithContext(auth.WithAuthority(req.Context(), actor))
				}
				rec := httptest.NewRecorder()
				mux.ServeHTTP(rec, req)
				if rec.Code != http.StatusNotFound || rec.Body.String() != "404 page not found\n" {
					t.Errorf("status=%d body=%q, want unregistered route", rec.Code, rec.Body.String())
				}
			})
		}
	}
	if runner.calls != 0 {
		t.Errorf("retired routes began %d write transactions", runner.calls)
	}
}
