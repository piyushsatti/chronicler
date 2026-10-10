package quest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func server(t *testing.T) *httptest.Server {
	t.Helper()
	c, _ := newCommands(Quest{ID: "q1", DMID: "dm-1", Status: Open, ScheduledAt: scheduledAt})
	mux := http.NewServeMux()
	Routes(mux, c)
	parse := func(token string) (auth.Claims, bool) {
		if token == "dm-token" {
			return auth.Claims{MemberID: "dm-1"}, true
		}
		return auth.Claims{}, false
	}
	srv := httptest.NewServer(auth.Middleware(parse, mux))
	t.Cleanup(srv.Close)
	return srv
}

func post(t *testing.T, srv *httptest.Server, token, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/v1/quests/q1/transition", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var decoded map[string]any
	if err := json.NewDecoder(res.Body).Decode(&decoded); err != nil {
		t.Fatal(err)
	}
	return res.StatusCode, decoded
}

func TestTransitionRoute(t *testing.T) {
	cases := []struct {
		name   string
		token  string
		body   string
		status int
		field  string
		value  string
	}{
		{"dm plays the quest", "dm-token", `{"to":"played"}`, http.StatusOK, "status", "played"},
		{"anonymous caller", "", `{"to":"played"}`, http.StatusUnauthorized, "code", "UNAUTHENTICATED"},
		{"bad token is anonymous", "forged", `{"to":"played"}`, http.StatusUnauthorized, "code", "UNAUTHENTICATED"},
		{"unknown status", "dm-token", `{"to":"archived"}`, http.StatusUnprocessableEntity, "code", "INVALID"},
		{"close through transition", "dm-token", `{"to":"closed"}`, http.StatusConflict, "code", "CONFLICT"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := post(t, server(t), tc.token, tc.body)
			if status != tc.status || body[tc.field] != tc.value {
				t.Fatalf("got %d %v, want %d %s=%s", status, body, tc.status, tc.field, tc.value)
			}
		})
	}
}
