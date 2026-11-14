package graph

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestLoadOne(t *testing.T) {
	actor, err := auth.NewAuthority("ada", []auth.Role{auth.Admin}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	pick := func(l *RequestLoaders) *Loader[member.IDKey, member.MemberView] {
		return l.Members
	}
	key := member.IDKey{ID: "10000000-0000-4000-8000-00000000000a"}

	withMembers := func(t *testing.T, load func(context.Context, member.IDKey) (*member.MemberView, error)) context.Context {
		t.Helper()
		state, err := NewRequestState(auth.Claims{MemberID: "ada"}, func(context.Context, string) (auth.Authority, error) {
			return actor, nil
		}, &actor)
		if err != nil {
			t.Fatal(err)
		}
		if err := state.InstallLoaders(&RequestLoaders{
			Members: &Loader[member.IDKey, member.MemberView]{Load: load},
		}); err != nil {
			t.Fatal(err)
		}
		return WithRequestState(context.Background(), state)
	}

	t.Run("nil value", func(t *testing.T) {
		ctx := withMembers(t, func(context.Context, member.IDKey) (*member.MemberView, error) {
			return nil, nil
		})
		got, err := loadOne(ctx, pick, "members", key)
		if got != nil || err != nil {
			t.Fatalf("got (%v, %v), want (nil, nil)", got, err)
		}
	})

	t.Run("value", func(t *testing.T) {
		want := &member.MemberView{Handle: "ada"}
		ctx := withMembers(t, func(context.Context, member.IDKey) (*member.MemberView, error) {
			return want, nil
		})
		got, err := loadOne(ctx, pick, "members", key)
		if err != nil || got != want {
			t.Fatalf("got (%v, %v), want (%v, nil)", got, err, want)
		}
	})

	t.Run("error", func(t *testing.T) {
		want := errors.New("batch failed")
		ctx := withMembers(t, func(context.Context, member.IDKey) (*member.MemberView, error) {
			return nil, want
		})
		got, err := loadOne(ctx, pick, "members", key)
		if got != nil || !errors.Is(err, want) {
			t.Fatalf("got (%v, %v), want (nil, %v)", got, err, want)
		}
	})

	t.Run("no loader", func(t *testing.T) {
		state, err := NewRequestState(auth.Claims{MemberID: "ada"}, func(context.Context, string) (auth.Authority, error) {
			return actor, nil
		}, &actor)
		if err != nil {
			t.Fatal(err)
		}
		if err := state.InstallLoaders(&RequestLoaders{}); err != nil {
			t.Fatal(err)
		}
		ctx := WithRequestState(context.Background(), state)
		got, err := loadOne(ctx, pick, "members", key)
		if got != nil || err == nil || err.Error() != "members loader unavailable" {
			t.Fatalf("got (%v, %v), want (nil, members loader unavailable)", got, err)
		}
	})
}
