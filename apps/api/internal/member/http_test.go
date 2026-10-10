package member_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
)

func TestByDiscordMissingStore(t *testing.T) {
	mux := http.NewServeMux()
	member.ReadAPI{}.Routes(mux)
	req := httptest.NewRequest(http.MethodGet, "/v1/members/by-discord/123", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d", rec.Code)
	}
}

func TestByDiscordFound(t *testing.T) {
	mux := http.NewServeMux()
	member.ReadAPI{
		ByDiscordID: func(_ context.Context, id string) (member.Member, error) {
			if id != "123" {
				return member.Member{}, member.ErrNotFound
			}
			return member.Member{ID: "m1", DiscordID: "123", Handle: "u", DisplayName: "U", Status: member.StatusActive}, nil
		},
	}.Routes(mux)
	req := httptest.NewRequest(http.MethodGet, "/v1/members/by-discord/123", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestReadRoutesDoNotConflictOnServeMux(t *testing.T) {
	mux := http.NewServeMux()
	// Previously separate patterns panicked: by-discord/{id} vs {id}/role-history.
	member.ReadAPI{
		ByDiscordID: func(context.Context, string) (member.Member, error) {
			return member.Member{ID: "m1", Status: member.StatusActive}, nil
		},
		RoleHistory: func(context.Context, string, int) ([]member.RoleChange, error) {
			return []member.RoleChange{{MemberID: "m1"}}, nil
		},
		Availability: func(context.Context, string) ([]member.AvailabilityWindow, error) {
			return nil, nil
		},
	}.Routes(mux)
}
