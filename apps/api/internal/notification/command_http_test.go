package notification

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

const markReadPath = "/v1/me/notifications/read"

func readRequest(ctx context.Context, body, media string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, markReadPath, strings.NewReader(body)).WithContext(ctx)
	r.Header.Set("Content-Type", media)
	return r
}
func assertReadProblem(t *testing.T, w *httptest.ResponseRecorder, status int, code, title string) {
	t.Helper()
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != status || w.Header().Get("Content-Type") != "application/problem+json" || !reflect.DeepEqual(got, map[string]any{"code": code, "status": float64(status), "title": title}) {
		t.Fatalf("problem=%d %s err=%v", w.Code, w.Body, err)
	}
}

func TestMarkReadHTTPRejectsMalformedInputBeforeCommand(t *testing.T) {
	mux := http.NewServeMux()
	CommandRoutes(mux, NewCommands(readRunnerFunc(func(context.Context, func(CommandRepository) error) error {
		t.Fatal("invalid input reached transaction")
		return nil
	})))
	good := `{"ids":["` + readID + `"]}`
	many := make([]string, 101)
	for i := range many {
		many[i] = readID
	}
	raw, _ := json.Marshal(map[string]any{"ids": many})
	cases := []struct{ name, body, media string }{
		{"empty", "", "application/json"}, {"null", "null", "application/json"}, {"array", "[]", "application/json"},
		{"missing", "{}", "application/json"}, {"null ids", `{"ids":null}`, "application/json"},
		{"scalar ids", `{"ids":"` + readID + `"}`, "application/json"}, {"number", `{"ids":[1]}`, "application/json"},
		{"null entry", `{"ids":[null]}`, "application/json"}, {"object entry", `{"ids":[{}]}`, "application/json"},
		{"boolean entry", `{"ids":[true]}`, "application/json"}, {"malformed", `{"ids":["bad"]}`, "application/json"},
		{"mixed", `{"ids":["` + readID + `","bad"]}`, "application/json"},
		{"duplicate key", `{"ids":[],"ids":[]}`, "application/json"}, {"escaped duplicate", `{"ids":[],"i\u0064s":[]}`, "application/json"},
		{"unknown key", `{"ids":[],"memberId":"other"}`, "application/json"}, {"unknown first", `{"memberId":"other","ids":[]}`, "application/json"},
		{"trailing object", good + `{}`, "application/json"}, {"trailing null", good + `null`, "application/json"},
		{"trailing malformed", good + `x`, "application/json"}, {"truncated", `{"ids":[`, "application/json"},
		{"over entries", string(raw), "application/json"}, {"over bytes", `{"ids":[]}` + strings.Repeat(" ", 8193-len(`{"ids":[]}`)), "application/json"},
		{"missing media", good, ""}, {"wrong media", good, "text/plain"}, {"malformed media", good, "application/json; charset"},
		{"compact UUID", `{"ids":["` + strings.ReplaceAll(readID, "-", "") + `"]}`, "application/json"},
		{"URN", `{"ids":["urn:uuid:` + readID + `"]}`, "application/json"},
		{"braces", `{"ids":["{` + readID + `}"]}`, "application/json"},
		{"UUID whitespace", `{"ids":[" ` + readID + `"]}`, "application/json"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, readRequest(unreadAuthority(t), tc.body, tc.media))
			assertReadProblem(t, w, 422, "INVALID", "Invalid notification read request")
		})
	}
}

func TestMarkReadHTTPUsesVerifiedRecipientAndWaitsForCommit(t *testing.T) {
	for _, n := range []int{0, 1, 100} {
		ids := make([]string, n)
		for i := range ids {
			ids[i] = strings.ToUpper(readID)
		}
		body, _ := json.Marshal(map[string]any{"ids": ids})
		// Exactly 8192 bytes must be admitted; the limit is inclusive.
		body = append(body, []byte(strings.Repeat(" ", 8192-len(body)))...)
		w := httptest.NewRecorder()
		writes, commits := 0, 0
		mux := http.NewServeMux()
		CommandRoutes(mux, NewCommands(readRunnerFunc(func(ctx context.Context, fn func(CommandRepository) error) error {
			if err := fn(readRepoFunc(func(_ context.Context, member string, got []string) error {
				writes++
				if member != unreadMemberID {
					t.Fatal("claims/query overrode verified recipient")
				}
				want := []string{}
				if n > 0 {
					want = []string{readID}
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("ids=%v", got)
				}
				return nil
			})); err != nil {
				return err
			}
			if w.Code == 204 {
				t.Fatal("success emitted before commit")
			}
			commits++
			return nil
		})))
		ctx := auth.WithClaims(unreadAuthority(t), auth.Claims{MemberID: "foreign", Roles: []auth.Role{auth.Admin}})
		r := readRequest(ctx, string(body), "application/json; charset=utf-8")
		r.URL.RawQuery = "member_id=foreign"
		mux.ServeHTTP(w, r)
		if w.Code != 204 || w.Body.Len() != 0 || writes != 1 || commits != 1 {
			t.Fatalf("response=%d %s writes=%d commits=%d", w.Code, w.Body, writes, commits)
		}
	}
}

func TestMarkReadHTTPAuthenticationAndOpaqueDependencyFailures(t *testing.T) {
	privateErr := errors.New("private row IDs and database endpoint")
	for _, tc := range []struct {
		name        string
		ctx         context.Context
		cmd         Commands
		status      int
		code, title string
	}{
		{"anonymous", context.Background(), Commands{}, 401, "UNAUTHENTICATED", "sign in required"},
		{"claims only", auth.WithClaims(context.Background(), auth.Claims{MemberID: unreadMemberID}), Commands{}, 500, "INTERNAL", "Internal error"},
		{"missing dependency", unreadAuthority(t), Commands{}, 500, "INTERNAL", "Internal error"},
		{"SQL", unreadAuthority(t), NewCommands(readRunnerFunc(func(_ context.Context, fn func(CommandRepository) error) error {
			return fn(readRepoFunc(func(context.Context, string, []string) error { return privateErr }))
		})), 500, "INTERNAL", "Internal error"},
		{"commit", unreadAuthority(t), NewCommands(readRunnerFunc(func(_ context.Context, fn func(CommandRepository) error) error {
			if err := fn(readRepoFunc(func(context.Context, string, []string) error { return nil })); err != nil {
				return err
			}
			return privateErr
		})), 500, "INTERNAL", "Internal error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			CommandRoutes(mux, tc.cmd)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, readRequest(tc.ctx, `{"ids":[]}`, "application/json"))
			assertReadProblem(t, w, tc.status, tc.code, tc.title)
		})
	}
}
