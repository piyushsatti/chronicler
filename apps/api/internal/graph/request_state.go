package graph

import (
	"context"
	"errors"
	"sync"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// RequestState shares live authority within one GraphQL request.
type RequestState struct {
	Identity         auth.Claims
	Resolver         auth.AuthorityResolver
	CachedAuthority  *auth.Authority
	Loaders          *RequestLoaders
	mu               sync.Mutex
	generation       uint64
	cachedGeneration uint64
	cachedErr        error
	flight           chan struct{}
}

func NewRequestState(identity auth.Claims, resolver auth.AuthorityResolver, initial *auth.Authority) (*RequestState, error) {
	if resolver == nil {
		return nil, errors.New("authority resolver is required")
	}
	if (!identity.Anonymous() && initial == nil) || (initial != nil && initial.Claims().MemberID != identity.MemberID) {
		return nil, errors.New("initial authority must match identity")
	}
	state := &RequestState{Identity: auth.Claims{MemberID: identity.MemberID}, Resolver: resolver}
	if initial != nil {
		value := *initial
		state.CachedAuthority = &value
	}
	return state, nil
}

func (s *RequestState) CurrentAuthority(ctx context.Context) (auth.Authority, error) {
	for {
		if err := ctx.Err(); err != nil {
			return auth.Authority{}, err
		}
		s.mu.Lock()
		if s.cachedGeneration == s.generation {
			authority := auth.Authority{}
			if s.CachedAuthority != nil {
				authority = *s.CachedAuthority
			}
			err := s.cachedErr
			s.mu.Unlock()
			return authority, err
		}
		if pending := s.flight; pending != nil {
			s.mu.Unlock()
			select {
			case <-pending:
				continue
			case <-ctx.Done():
				return auth.Authority{}, ctx.Err()
			}
		}
		pending := make(chan struct{})
		s.flight = pending
		generation := s.generation
		s.mu.Unlock()
		authority, err := s.Resolver(ctx, s.Identity.MemberID)
		if err == nil && authority.Claims().MemberID != s.Identity.MemberID {
			err = errors.New("refreshed authority must match identity")
		}
		s.mu.Lock()
		if generation == s.generation {
			s.CachedAuthority = nil
			s.cachedErr = err
			s.cachedGeneration = generation
			if err == nil {
				s.CachedAuthority = &authority
			}
			if s.Loaders != nil {
				s.Loaders.clear()
			}
		}
		s.flight = nil
		close(pending)
		s.mu.Unlock()
	}
}

func (s *RequestState) InvalidateAuthority() {
	s.mu.Lock()
	s.generation++
	s.CachedAuthority = nil
	s.cachedErr = nil
	s.mu.Unlock()
}
func (s *RequestState) InstallLoaders(loaders *RequestLoaders) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if loaders == nil || s.Loaders != nil {
		return errors.New("request loaders must be installed exactly once")
	}
	s.Loaders = loaders
	return nil
}
func (s *RequestState) ClearLoaders() {
	s.mu.Lock()
	loaders := s.Loaders
	s.mu.Unlock()
	if loaders != nil {
		loaders.clear()
	}
}

type requestStateContextKey struct{}

func WithRequestState(ctx context.Context, state *RequestState) context.Context {
	return context.WithValue(ctx, requestStateContextKey{}, state)
}

func RequestStateFromContext(ctx context.Context) (*RequestState, bool) {
	state, ok := ctx.Value(requestStateContextKey{}).(*RequestState)
	return state, ok
}

// LiveAuthority prefers request-scoped refresh, then HTTP-bound live authority.
func LiveAuthority(ctx context.Context) (auth.Authority, error) {
	if state, ok := RequestStateFromContext(ctx); ok {
		return state.CurrentAuthority(ctx)
	}
	if a, ok := auth.AuthorityFromContext(ctx); ok {
		return a, nil
	}
	if auth.FromContext(ctx).Anonymous() {
		return auth.Authority{}, errors.New("sign in required")
	}
	return auth.Authority{}, errors.New("live authority unavailable")
}
