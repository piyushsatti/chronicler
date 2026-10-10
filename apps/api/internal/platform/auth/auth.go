// Package auth carries the caller's claims and enforces the coarse gate a
// route declares. Ownership and live revocation checks stay in commands.
package auth

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

type Role string

const (
	Player Role = "player"
	DM     Role = "dm"
	Admin  Role = "admin"
)

type Claims struct {
	MemberID string
	Roles    []Role
}

func (c Claims) Anonymous() bool { return c.MemberID == "" }

func (c Claims) Has(role Role) bool { return slices.Contains(c.Roles, role) }

type contextKey struct{}

func WithClaims(ctx context.Context, c Claims) context.Context {
	return context.WithValue(ctx, contextKey{}, c)
}

func FromContext(ctx context.Context) Claims {
	c, _ := ctx.Value(contextKey{}).(Claims)
	return c
}

// Parser turns a bearer token into claims. A token it rejects leaves the
// caller anonymous rather than failing the request.
type Parser func(token string) (Claims, bool)

func Middleware(parse Parser, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if found {
			if c, ok := parse(token); ok {
				r = r.WithContext(WithClaims(r.Context(), c))
			}
		}
		next.ServeHTTP(w, r)
	})
}

type Gate int

const (
	Public Gate = iota
	Authenticated
)

// Require is the route's declared gate. It is the only place a route states
// who may call it.
func Require(gate Gate, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if gate == Authenticated && FromContext(r.Context()).Anonymous() {
			apierr.Write(w, r, apierr.New(apierr.Unauthenticated, "sign in required"))
			return
		}
		next.ServeHTTP(w, r)
	})
}
