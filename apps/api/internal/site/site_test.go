package site

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatsRoute(t *testing.T) {
	for _, tt := range []struct {
		name       string
		err        error
		wantStatus int
		wantType   string
		wantBody   string
	}{
		{
			name: "success", wantStatus: http.StatusOK, wantType: "application/json",
			wantBody: "{\"totalMembers\":5,\"activeCharacters\":3,\"totalQuests\":7}\n",
		},
		{
			name: "database failure", err: errors.New("database unavailable"),
			wantStatus: http.StatusInternalServerError, wantType: "application/problem+json",
			wantBody: "{\"title\":\"Internal error\",\"status\":500,\"code\":\"INTERNAL\"}\n",
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			mux := http.NewServeMux()
			Routes(mux, func(got context.Context) (Stats, error) {
				if got != ctx {
					t.Fatal("stats callback did not receive request context")
				}
				return Stats{TotalMembers: 5, ActiveCharacters: 3, TotalQuests: 7}, tt.err
			})
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/stats", nil).WithContext(ctx))
			if response.Code != tt.wantStatus || response.Header().Get("Content-Type") != tt.wantType || response.Body.String() != tt.wantBody {
				t.Fatalf("status=%d type=%s body=%s", response.Code, response.Header().Get("Content-Type"), response.Body.String())
			}
		})
	}
}
