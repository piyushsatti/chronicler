package graph

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func requestTestAuthority(t *testing.T, id string, role auth.Role) auth.Authority {
	t.Helper()
	a, err := auth.NewAuthority(id, []auth.Role{role}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestRequestStateConstruction(t *testing.T) {
	a := requestTestAuthority(t, "ada", auth.Admin)
	resolver := func(context.Context, string) (auth.Authority, error) {
		t.Fatal("constructor dispatched")
		return a, nil
	}
	for _, tc := range []struct {
		name     string
		claims   auth.Claims
		initial  *auth.Authority
		resolver auth.AuthorityResolver
		valid    bool
	}{
		{"anonymous", auth.Claims{}, nil, resolver, true},
		{"live", auth.Claims{MemberID: "ada", Roles: []auth.Role{auth.Admin}}, &a, resolver, true},
		{"missing", auth.Claims{MemberID: "ada"}, nil, resolver, false},
		{"mismatch", auth.Claims{MemberID: "ben"}, &a, resolver, false},
		{"resolver", auth.Claims{}, nil, nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, err := NewRequestState(tc.claims, tc.resolver, tc.initial)
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v error=%v", tc.valid, err)
			}
			if s != nil && len(s.Identity.Roles) != 0 {
				t.Fatal("token roles retained")
			}
		})
	}
}

func TestRequestStateConcurrentRefresh(t *testing.T) {
	for _, failure := range []bool{false, true} {
		t.Run(map[bool]string{false: "demotion", true: "failure"}[failure], func(t *testing.T) {
			initial := requestTestAuthority(t, "ada", auth.Admin)
			player := requestTestAuthority(t, "ada", auth.Player)
			dependencyErr := errors.New("member read failed")
			started, release := make(chan struct{}), make(chan struct{})
			var calls, clears atomic.Int32
			s, err := NewRequestState(auth.Claims{MemberID: "ada"}, func(context.Context, string) (auth.Authority, error) {
				calls.Add(1)
				close(started)
				<-release
				if failure {
					return auth.Authority{}, dependencyErr
				}
				return player, nil
			}, &initial)
			if err != nil {
				t.Fatal(err)
			}
			if err = s.InstallLoaders(&RequestLoaders{Members: &Loader[member.IDKey, member.MemberView]{Clear: func() { clears.Add(1) }}}); err != nil {
				t.Fatal(err)
			}
			a, err := s.CurrentAuthority(context.Background())
			if err != nil || !a.Claims().Has(auth.Admin) || calls.Load() != 0 {
				t.Fatal("initial authority was not cached")
			}
			s.InvalidateAuthority()
			var wg sync.WaitGroup
			for range 8 {
				wg.Add(1)
				go func() {
					defer wg.Done()
					a, err := s.CurrentAuthority(context.Background())
					if failure {
						if err != dependencyErr || !a.Claims().Anonymous() {
							t.Errorf("stale authority or changed error: %v %v", a.Claims(), err)
						}
					} else if err != nil || a.Claims().Has(auth.Admin) || !a.Claims().Has(auth.Player) {
						t.Errorf("demotion not visible: %v %v", a.Claims(), err)
					}
				}()
			}
			<-started
			// Invalidation must proceed while the owning authority task is blocked.
			s.ClearLoaders()
			canceled, cancel := context.WithCancel(context.Background())
			cancel()
			if _, err := s.CurrentAuthority(canceled); !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
			close(release)
			wg.Wait()
			if calls.Load() != 1 || clears.Load() != 2 {
				t.Fatalf("calls=%d clears=%d", calls.Load(), clears.Load())
			}
			if err := s.InstallLoaders(&RequestLoaders{}); err == nil {
				t.Fatal("installed twice")
			}
		})
	}
}

func TestRequestStateInvalidationDuringRefresh(t *testing.T) {
	initial := requestTestAuthority(t, "ada", auth.Admin)
	player := requestTestAuthority(t, "ada", auth.Player)
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	s, _ := NewRequestState(auth.Claims{MemberID: "ada"}, func(context.Context, string) (auth.Authority, error) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
			return initial, nil
		}
		return player, nil
	}, &initial)
	s.InvalidateAuthority()
	done := make(chan auth.Authority)
	go func() {
		a, err := s.CurrentAuthority(context.Background())
		if err != nil {
			t.Error(err)
		}
		done <- a
	}()
	<-started
	s.InvalidateAuthority()
	close(release)
	if a := <-done; a.Claims().Has(auth.Admin) || !a.Claims().Has(auth.Player) || calls.Load() != 2 {
		t.Fatal("invalidated in-flight value was reused")
	}
}
