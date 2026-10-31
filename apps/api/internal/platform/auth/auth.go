// Package auth resolves request authority from live member data. Tokens
// establish identity; their role bits never establish request authority.
package auth

import (
	"context"
	"github.com/google/uuid"
	"net/http"
	"slices"
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

type Role string

const (
	Guest      Role = "guest"
	Player     Role = "player"
	DM         Role = "dm"
	Admin      Role = "admin"
	Archon     Role = "archon"
	Lieutenant Role = "lieutenant"
	Verifier   Role = "verifier"
)

type Claims struct {
	MemberID string
	Roles    []Role
}

// Authority is built from a fresh member/profile read, then shared only within
// the request. Its fields cannot be populated by decoding an external token.
type Authority struct {
	claims        Claims
	liveDM        bool
	handle        string
	platformOwner bool
}

func NewAuthority(memberID string, roles []Role, status, dmStatus string) (Authority, error) {
	return NewAuthorityWithHandle(memberID, roles, status, dmStatus, "")
}

// NewAuthorityWithHandle adds the handle from the same live member read. A
// renamed handle takes effect on the next request even with an unchanged JWT.
func NewAuthorityWithHandle(memberID string, roles []Role, status, dmStatus, handle string) (Authority, error) {
	if memberID == "" || status != "active" {
		return Authority{}, apierr.New(apierr.Forbidden, "member is not active")
	}
	return Authority{
		claims: Claims{MemberID: memberID, Roles: slices.Clone(roles)},
		liveDM: slices.Contains(roles, DM) && dmStatus == "approved",
		handle: handle,
	}, nil
}

func (a Authority) Claims() Claims {
	return Claims{MemberID: a.claims.MemberID, Roles: slices.Clone(a.claims.Roles)}
}

func (a Authority) LiveDM() bool   { return a.liveDM }
func (a Authority) Handle() string { return a.handle }

type AuthorityResolver func(context.Context, string) (Authority, error)
type authorityKey struct{}

func WithAuthority(ctx context.Context, a Authority) context.Context {
	ctx = WithClaims(ctx, a.Claims())
	return context.WithValue(ctx, authorityKey{}, a)
}

func AuthorityFromContext(ctx context.Context) (Authority, bool) {
	a, ok := ctx.Value(authorityKey{}).(Authority)
	return a, ok && !a.claims.Anonymous()
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
				// Identity-only adapter for local callers; it cannot grant roles.
				r = r.WithContext(WithClaims(r.Context(), Claims{MemberID: c.MemberID}))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// LiveMiddleware is the production boundary. It resolves authority once per
// request, rejects inactive/missing members, and never falls back to JWT roles.
func LiveMiddleware(parse Parser, resolve AuthorityResolver, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !found {
			next.ServeHTTP(w, r)
			return
		}
		c, ok := parse(token)
		if !ok || c.Anonymous() {
			next.ServeHTTP(w, r)
			return
		}
		if resolve == nil {
			apierr.Write(w, r, apierr.New(apierr.Internal, "authority unavailable"))
			return
		}
		a, err := resolve(r.Context(), c.MemberID)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		if a.claims.MemberID != c.MemberID || a.claims.Anonymous() {
			apierr.Write(w, r, apierr.New(apierr.Forbidden, "member authority mismatch"))
			return
		}
		next.ServeHTTP(w, r.WithContext(WithAuthority(r.Context(), a)))
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

func NewAuthorityWithOwner(memberID string, roles []Role, status, dmStatus, handle, configuredOwnerID string) (Authority, error) {
	if configuredOwnerID != "" {
		parsed, err := uuid.Parse(configuredOwnerID)
		if err != nil || parsed.String() != configuredOwnerID {
			return Authority{}, apierr.New(apierr.Internal, "invalid configured owner identity")
		}
	}
	actor, err := NewAuthorityWithHandle(memberID, roles, status, dmStatus, handle)
	if err != nil {
		return Authority{}, err
	}
	actor.platformOwner = configuredOwnerID != "" && memberID == configuredOwnerID
	return actor, nil
}
func (a Authority) IsPlatformOwner() bool { return a.platformOwner }
